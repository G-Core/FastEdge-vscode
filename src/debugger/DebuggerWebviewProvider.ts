import * as vscode from "vscode";
import * as fs from "fs/promises";
import { DebuggerServerManager } from "./DebuggerServerManager";

/**
 * Manages the debugger webview panel and communicates with the debugger server
 */
export class DebuggerWebviewProvider {
  private panel: vscode.WebviewPanel | null = null;

  constructor(
    private context: vscode.ExtensionContext,
    private serverManager: DebuggerServerManager
  ) {}

  /**
   * Show the debugger webview with an optional WASM file
   */
  async showDebugger(wasmPath?: string): Promise<void> {
    try {
      // Ensure debugger server is running
      await this.serverManager.start();

      // Create or reveal webview panel
      if (this.panel) {
        this.panel.reveal(vscode.ViewColumn.Two);
      } else {
        this.panel = vscode.window.createWebviewPanel(
          "fastedgeDebugger",
          "FastEdge Debugger",
          vscode.ViewColumn.Two,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        // Set webview content
        this.panel.webview.html = this.getWebviewContent();

        // Handle panel disposal
        this.panel.onDidDispose(() => {
          this.panel = null;
        });
      }

      // Load WASM if path provided
      if (wasmPath) {
        await this.loadWasm(wasmPath);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to show debugger: ${(error as Error).message}`
      );
      throw error;
    }
  }

  /**
   * Load a WASM file into the debugger
   */
  async loadWasm(wasmPath: string): Promise<void> {
    try {
      // Read WASM file
      const wasmBuffer = await fs.readFile(wasmPath);
      const wasmBase64 = wasmBuffer.toString("base64");

      // Load via REST API
      const response = await fetch(
        `${this.serverManager.getUrl()}/api/load`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Source": "vscode",
          },
          body: JSON.stringify({
            wasmBase64,
            dotenvEnabled: true,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to load WASM");
      }

      const result = await response.json();
      console.log(`WASM loaded successfully: ${result.wasmType}`);

      vscode.window.showInformationMessage(
        `WASM loaded successfully (${result.wasmType})`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to load WASM: ${(error as Error).message}`
      );
      throw error;
    }
  }

  /**
   * Set configuration (environment variables, secrets, properties)
   */
  async setConfig(config: {
    envVars?: Record<string, string>;
    secrets?: Record<string, string>;
    properties?: Record<string, any>;
  }): Promise<void> {
    try {
      const response = await fetch(
        `${this.serverManager.getUrl()}/api/config`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Source": "vscode",
          },
          body: JSON.stringify({ config }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to set config");
      }

      console.log("Configuration updated successfully");
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to set config: ${(error as Error).message}`
      );
      throw error;
    }
  }

  /**
   * Get the webview HTML content
   */
  private getWebviewContent(): string {
    const debuggerUrl = this.serverManager.getUrl();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FastEdge Debugger</title>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }
    iframe {
      border: none;
      width: 100%;
      height: 100%;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--vscode-foreground);
    }
    .error {
      padding: 20px;
      color: var(--vscode-errorForeground);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div class="loading" id="loading">
    <div>
      <h2>Loading FastEdge Debugger...</h2>
      <p>Starting server on port ${this.serverManager.getPort()}</p>
    </div>
  </div>
  <iframe id="debugger-frame" src="${debuggerUrl}" style="display:none;"></iframe>

  <script>
    const iframe = document.getElementById('debugger-frame');
    const loading = document.getElementById('loading');

    // Show iframe when loaded
    iframe.onload = function() {
      loading.style.display = 'none';
      iframe.style.display = 'block';
    };

    // Handle load errors
    iframe.onerror = function() {
      loading.innerHTML = '<div class="error"><h2>Failed to load debugger</h2><p>Please check that the debugger server is running.</p></div>';
    };

    // Retry loading if it takes too long
    setTimeout(function() {
      if (iframe.style.display === 'none') {
        iframe.src = iframe.src; // Retry
      }
    }, 5000);
  </script>
</body>
</html>`;
  }

  /**
   * Close the debugger webview
   */
  close(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }

  /**
   * Check if the debugger webview is visible
   */
  isVisible(): boolean {
    return this.panel !== null && this.panel.visible;
  }
}
