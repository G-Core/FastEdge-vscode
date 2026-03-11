import { fork, ChildProcess } from "child_process";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const PORT_FILE_DIR = ".fastedge";
const PORT_FILE_NAME = ".debug-port";

/**
 * Manages the lifecycle of the fastedge-debugger server for a specific app root.
 * Each app folder gets its own server instance and port file.
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
    return path.join(this.appRoot, PORT_FILE_DIR, PORT_FILE_NAME);
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
   * Check if the debugger server is healthy and responding.
   * Returns true only if the server is our own fastedge-debugger process.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${this.port}/health`);
      const data = await response.json();
      return response.ok && data.status === "ok" && data.service === "fastedge-debugger";
    } catch {
      return false;
    }
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
   * Find a free port starting from the preferred port.
   * Skips ports occupied by foreign processes.
   */
  private async resolvePort(): Promise<number> {
    for (let port = 5179; port < 5189; port++) {
      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(500),
        });
        const data = await response.json();
        if (data.status === "ok" && data.service === "fastedge-debugger") {
          // A fastedge server is on this port — skip it (belongs to another app)
          console.log(`Port ${port} is in use by another fastedge-debugger, trying ${port + 1}...`);
          continue;
        }
        // Something else is on this port — try the next one
        console.log(`Port ${port} is occupied by a foreign process, trying ${port + 1}...`);
      } catch {
        // Port is free
        return port;
      }
    }
    throw new Error("Could not find a free port for the debugger server (tried 10 ports)");
  }

  /**
   * Start the debugger server for this app root.
   * Checks the port file first — reuses an existing healthy server if found.
   */
  async start(): Promise<void> {
    // Step 1: Check if a server is already running for this app via port file
    const filePort = this.readPortFile();
    if (filePort !== null) {
      if (await this.isHealthyOnPort(filePort)) {
        // Existing server is alive — reuse it
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
      await this.waitForHealthy(30000);
      return;
    }

    this.isStarting = true;

    try {
      // Step 3: Find a free port and spawn
      this.port = await this.resolvePort();

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

      console.log(`Starting debugger server for ${this.appRoot} on port ${this.port}`);

      this.serverProcess = fork(bundledServerPath, [], {
        cwd: path.dirname(bundledServerPath),
        execPath: process.execPath,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          PORT: String(this.port),
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

      await this.waitForHealthy(30000);

      console.log(`Debugger server started on port ${this.port} for ${this.appRoot}`);
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Wait for the debugger server to become healthy
   */
  private async waitForHealthy(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500;

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isHealthy()) {
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
      console.log(`Stopping debugger server for ${this.appRoot}...`);
      this.serverProcess.kill("SIGTERM");
      this.serverProcess = null;
      // Wait a bit for graceful shutdown before cleaning the port file,
      // as the server's own SIGTERM handler will delete it too
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
