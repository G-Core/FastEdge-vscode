import { fork, ChildProcess } from "child_process";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Manages the lifecycle of the fastedge-debugger server
 */
export class DebuggerServerManager {
  private serverProcess: ChildProcess | null = null;
  private port: number = 5179;
  private isStarting: boolean = false;

  constructor(
    private extensionPath: string,
    private workspacePath?: string
  ) {}

  /**
   * Check if the debugger server is healthy and responding
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${this.port}/health`);
      const data = await response.json();
      return response.ok && data.status === "ok";
    } catch {
      return false;
    }
  }

  /**
   * Start the debugger server if it's not already running
   */
  async start(): Promise<void> {
    // Check if already running
    if (await this.isHealthy()) {
      console.log("Debugger server is already running");
      return;
    }

    // Prevent multiple concurrent starts
    if (this.isStarting) {
      console.log("Debugger server is already starting");
      await this.waitForHealthy(30000);
      return;
    }

    this.isStarting = true;

    try {
      // Path to bundled debugger server
      const bundledServerPath = path.join(
        this.extensionPath,
        "dist",
        "debugger",
        "server.js"
      );

      // Verify bundled server exists
      if (!fs.existsSync(bundledServerPath)) {
        throw new Error(
          `Bundled debugger not found at: ${bundledServerPath}. ` +
          `The extension may not have been packaged correctly.`
        );
      }

      console.log(`Starting bundled debugger server from: ${bundledServerPath}`);

      // Fork the bundled server using VSCode's Node.js runtime
      this.serverProcess = fork(bundledServerPath, [], {
        cwd: path.dirname(bundledServerPath),
        execPath: process.execPath, // Use VSCode's Node.js
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          PORT: String(this.port),
          VSCODE_INTEGRATION: "true", // Signal to server that it's running in VSCode
          WORKSPACE_PATH: this.workspacePath || "", // Workspace path for auto-loading WASM
        },
      });

      // Log output for debugging
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
      });

      // Wait for the server to be ready
      await this.waitForHealthy(30000);

      console.log("Debugger server started successfully");
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Wait for the debugger server to become healthy
   */
  private async waitForHealthy(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500; // Check every 500ms

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
   * Stop the debugger server
   */
  async stop(): Promise<void> {
    if (this.serverProcess) {
      console.log("Stopping debugger server...");
      this.serverProcess.kill("SIGTERM");
      this.serverProcess = null;

      // Wait a bit for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
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
