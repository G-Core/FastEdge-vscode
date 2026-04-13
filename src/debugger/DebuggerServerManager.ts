import { fork, execFile, ChildProcess } from "child_process";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const DEBUG_DIR = ".fastedge-debug";

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

  constructor(
    private extensionPath: string,
    private appRoot: string
  ) {}

  private get portFilePath(): string {
    return path.join(this.appRoot, DEBUG_DIR, ".debug-port");
  }

  private readPortFile(): number | null {
    try {
      const raw = fs.readFileSync(this.portFilePath, "utf8").trim();
      const port = parseInt(raw, 10);
      return isNaN(port) ? null : port;
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
      const response = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(500),
      });
      const data = await response.json();
      return response.ok && data.status === "ok" && data.service === "fastedge-debugger";
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
    // Step 1: Check if a server is already running for this app via port file
    const filePort = this.readPortFile();
    if (filePort !== null) {
      if (await this.isHealthyOnPort(filePort)) {
        this.port = filePort;
        console.log(`Reusing existing debugger server on port ${this.port} for ${this.appRoot}`);
        return;
      } else {
        // Stale port file — clean it up
        console.log(`Stale port file found for ${this.appRoot}, removing...`);
        this.deletePortFile();
      }
    }

    // Step 2: Concurrent call guard (same manager instance only)
    if (this.isStarting) {
      console.log("Debugger server is already starting");
      await this.waitForPortFile(30000);
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
      // WORKSPACE_PATH tells it where to write .fastedge-debug/.debug-port.
      this.serverProcess = fork(bundledServerPath, [], {
        cwd: path.dirname(bundledServerPath),
        execPath: process.execPath,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          VSCODE_INTEGRATION: "true",
          WORKSPACE_PATH: this.appRoot,
        },
      });

      this.serverProcess.stdout?.on("data", (data: any) => {
        console.log(`[Debugger Server] ${data.toString()}`);
      });

      this.serverProcess.stderr?.on("data", (data: any) => {
        console.error(`[Debugger Server Error] ${data.toString()}`);
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
    return `http://localhost:${this.port}`;
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
