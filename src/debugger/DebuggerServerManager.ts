import { fork, execFile, ChildProcess } from "child_process";
import { randomBytes, createHash } from "crypto";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const DEBUG_DIR = ".fastedge-debug";

/** The server asks the user to approve an allowed folder (fastedge-test's allowed folders). */
const APPROVAL_REQUEST = "fastedge:approve-folder";
const APPROVAL_REPLY = "fastedge:folder-approval";

/**
 * The user's allowed folders: folders outside the workspace the debugger may read once the user
 * approves each in a session. Only the user setting counts (`globalValue`): the setting is
 * application-scoped, so a workspace's `.vscode/settings.json` cannot set it, and it is not read
 * from there even if it tried. None in an untrusted workspace (Restricted Mode).
 */
export function allowedFolders(): string[] {
  if (!vscode.workspace.isTrusted) {return [];}
  const configured = vscode.workspace.getConfiguration("fastedge").inspect<unknown>("debugger.allowedFolders")?.globalValue;
  if (!Array.isArray(configured)) {return [];}
  return configured
    .filter((f): f is string => typeof f === "string" && f.trim() !== "")
    .map((f) => (/^~([\\/]|$)/.test(f) ? path.join(os.homedir(), f.slice(1)) : f));
}

/**
 * Asks the user, in a modal dialog, whether the debugger may read `folder` for this session.
 * The server reads it only after this answer, which arrives over the private IPC channel: nothing
 * on the debugger's HTTP API can approve a folder.
 */
async function approveFolder(folder: string): Promise<boolean> {
  const allow = "Allow for this session";
  const choice = await vscode.window.showWarningMessage(
    `Let the FastEdge debugger read ${folder}?`,
    {
      modal: true,
      detail:
        "It is outside this workspace, in your fastedge.debugger.allowedFolders setting. Until the debugger stops, " +
        "every config it loads can read files there, and a loaded app can send what it reads over the network. " +
        "Allow it only if you trust the code in this workspace.",
    },
    allow,
  );
  return choice === allow;
}

/**
 * Manages the lifecycle of the fastedge-debugger server for a specific app root.
 * Each app folder gets its own server instance and port file.
 *
 * Port selection is handled by fastedge-test's startServer() which auto-increments
 * from 5179 if ports are busy. The resolved port is written to .fastedge-debug/.debug-port.
 */
export class DebuggerServerManager {
  private serverProcess: ChildProcess | null = null;
  private port: number = 5179;
  private isStarting: boolean = false;
  // Per-instance token: generated once, injected into the server via env and
  // passed to the webview iframe via URL fragment so the frontend can auth.
  private readonly token: string = randomBytes(16).toString("hex");

  constructor(
    private extensionPath: string,
    /** The app's folder: home of .fastedge-debug/ (port file, app.wasm, config). */
    private appRoot: string,
    /** The VS Code workspace folder holding it: the limit on what the server reads. */
    private workspaceRoot: string = appRoot,
  ) {}

  getToken(): string {
    return this.token;
  }

  private get portFilePath(): string {
    return path.join(this.appRoot, DEBUG_DIR, ".debug-port");
  }

  private readPortFile(): number | null {
    try {
      const raw = fs.readFileSync(this.portFilePath, "utf8").trim();
      // Format: PORT:SHA256_OF_TOKEN — proves the server was spawned by this session.
      // Legacy single-number format is rejected: can't verify server identity.
      const sep = raw.indexOf(":");
      if (sep === -1) {return null;}
      const portStr = raw.substring(0, sep);
      const storedHash = raw.substring(sep + 1);
      if (!/^\d{1,5}$/.test(portStr)) {return null;}
      const port = Number(portStr);
      if (port < 1 || port > 65535) {return null;}
      const expectedHash = createHash("sha256").update(this.token).digest("hex");
      return storedHash === expectedHash ? port : null;
    } catch {
      return null;
    }
  }

  private deletePortFile(): void {
    try {
      fs.unlinkSync(this.portFilePath);
    } catch {
      // File may not exist — not an error
    }
  }

  /**
   * Check if the debugger server is healthy and responding on the current port.
   */
  async isHealthy(): Promise<boolean> {
    return this.isHealthyOnPort(this.port);
  }

  private async isHealthyOnPort(port: number): Promise<boolean> {
    try {
      // Use the unauthenticated /health probe — sending our session token to an
      // unverified endpoint would let a malicious listener steal it and impersonate
      // the server. /health only tells us something is listening; subsequent authed
      // requests will fail naturally if it's the wrong server.
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(500),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Start the debugger server for this app root.
   * Checks the port file first — reuses an existing healthy server if found.
   * Port selection is delegated to fastedge-test's auto-increment logic.
   */
  async start(): Promise<void> {
    // Step 1: Check if a server is already running for this app via port file.
    // In an untrusted workspace the port file is workspace-controlled, so ignore
    // it and always spawn a fresh server that this session owns.
    if (vscode.workspace.isTrusted) {
      const filePort = this.readPortFile();
      if (filePort !== null) {
        if (await this.isHealthyOnPort(filePort)) {
          // Only reuse servers we started in this extension host; otherwise the
          // per-session token will not match and /api/* calls will fail auth.
          if (this.serverProcess) {
            this.port = filePort;
            console.log(`Reusing existing debugger server on port ${this.port} for ${this.appRoot}`);
            return;
          }
          console.log(
            `Found existing debugger server on port ${filePort} for ${this.appRoot} but no owned process; spawning a fresh server...`,
          );
          this.deletePortFile();
        } else {
          // Stale port file — clean it up
          console.log(`Stale port file found for ${this.appRoot}, removing...`);
          this.deletePortFile();
        }
      }
    }

    // Step 2: Concurrent call guard (same manager instance only)
    if (this.isStarting) {
      console.log("Debugger server is already starting");
      await this.waitForPortFile(30000);
      const resolvedPort = this.readPortFile();
      if (resolvedPort !== null) {
        this.port = resolvedPort;
      }
      return;
    }

    this.isStarting = true;

    try {
      // Step 3: Spawn the server — it picks its own port via auto-increment
      const bundledServerPath = path.join(
        this.extensionPath,
        "dist",
        "debugger",
        "server.js"
      );

      if (!fs.existsSync(bundledServerPath)) {
        throw new Error(
          `Bundled debugger not found at: ${bundledServerPath}. ` +
          `The extension may not have been packaged correctly.`
        );
      }

      console.log(`Starting debugger server for ${this.appRoot}...`);

      // No PORT env var — let fastedge-test's startServer() resolve it via auto-increment.
      // WORKSPACE_PATH is the limit on what it reads (resources may use sibling apps);
      // FASTEDGE_APP_ROOT is where it writes .fastedge-debug/.debug-port.
      // In GitHub Codespaces the browser connects through a port-forwarded URL
      // of the form <name>-<port>.<domain>. The server needs FASTEDGE_EXPECTED_HOST
      // set to the forwarding domain so its suffix-match check allows the request
      // (the full hostname cannot be known here because the server picks its own port).
      const codespacesDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
      this.serverProcess = fork(bundledServerPath, [], {
        cwd: path.dirname(bundledServerPath),
        execPath: process.execPath,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          VSCODE_INTEGRATION: "true",
          WORKSPACE_PATH: this.workspaceRoot,
          FASTEDGE_APP_ROOT: this.appRoot,
          FASTEDGE_DEBUG_TOKEN: this.token,
          FASTEDGE_BIND_HOST: "127.0.0.1",
          // Always set, so a value inherited from the environment never counts.
          FASTEDGE_ALLOWED_FOLDERS: JSON.stringify(allowedFolders()),
          ...(codespacesDomain ? { FASTEDGE_EXPECTED_HOST: codespacesDomain } : {}),
        },
      });

      this.serverProcess.stdout?.on("data", (data: any) => {
        console.log(`[Debugger Server] ${data.toString()}`);
      });

      this.serverProcess.stderr?.on("data", (data: any) => {
        console.error(`[Debugger Server Error] ${data.toString()}`);
      });

      // The server asks before reading an allowed folder; answer with the user's choice.
      const server = this.serverProcess;
      server.on("message", (message: unknown) => {
        const m = message as { type?: unknown; id?: unknown; folder?: unknown };
        if (m?.type !== APPROVAL_REQUEST || typeof m.id !== "string" || typeof m.folder !== "string") {return;}
        const { id, folder } = m;
        void approveFolder(folder).then((approved) => {
          if (server.connected) {server.send({ type: APPROVAL_REPLY, id, approved });}
        });
      });

      this.serverProcess.on("error", (error: Error) => {
        console.error("Failed to start debugger server:", error);
        vscode.window.showErrorMessage(
          `Failed to start debugger server: ${error.message}`
        );
      });

      this.serverProcess.on("exit", (code: number | null, signal: string | null) => {
        console.log(`Debugger server exited with code ${code}, signal ${signal}`);
        this.serverProcess = null;
        this.deletePortFile();
      });

      // Step 4: Wait for the port file to appear and the server to become healthy
      await this.waitForPortFile(30000);
      const resolvedPort = this.readPortFile();
      if (resolvedPort === null) {
        throw new Error("Server started but port file was not written");
      }
      this.port = resolvedPort;

      console.log(`Debugger server started on port ${this.port} for ${this.appRoot}`);
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Wait for the port file to appear and the server to become healthy.
   */
  private async waitForPortFile(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 300;

    while (Date.now() - startTime < timeoutMs) {
      const port = this.readPortFile();
      if (port !== null && await this.isHealthyOnPort(port)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    throw new Error(
      `Debugger server failed to start within ${timeoutMs / 1000} seconds`
    );
  }

  /**
   * Stop the debugger server and clean up its port file
   */
  async stop(): Promise<void> {
    if (this.serverProcess) {
      const proc = this.serverProcess;
      this.serverProcess = null;
      console.log(`Stopping debugger server for ${this.appRoot}...`);
      proc.kill("SIGINT");
      const exited = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 2000);
        proc.once("exit", () => { clearTimeout(timer); resolve(true); });
      });
      if (!exited && proc.pid) {
        console.log(`Debugger server did not exit in time, force-killing pid ${proc.pid}`);
        if (process.platform === "win32") {
          try { execFile("taskkill", ["/F", "/T", "/PID", String(proc.pid)]); } catch { /* best effort */ }
        } else {
          try { proc.kill("SIGKILL"); } catch { /* already dead */ }
        }
      }
    }
    this.deletePortFile();
  }

  /**
   * Restart the debugger server
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Get the debugger server URL
   */
  getUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * Get the debugger server port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Get the app root this manager is scoped to
   */
  getAppRoot(): string {
    return this.appRoot;
  }

  /**
   * Check if the server process is running
   */
  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }

  /**
   * Trigger workspace WASM reload
   * Called by VSCode extension after F5 rebuild
   */
  async reloadWorkspaceWasm(): Promise<void> {
    try {
      const response = await fetch(`${this.getUrl()}/api/reload-workspace-wasm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fastedge-token": this.token,
        },
      });

      if (!response.ok) {
        const result = await response.json();
        console.error("Failed to reload workspace WASM:", result.error || result);
      }
    } catch (error) {
      console.error("Failed to trigger workspace WASM reload:", error);
    }
  }
}
