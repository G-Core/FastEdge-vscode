import * as vscode from "vscode";
import * as path from "path";
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
        const appName = path.basename(this.serverManager.getAppRoot());
        this.panel = vscode.window.createWebviewPanel(
          "fastedgeDebugger",
          `FastEdge Debugger — ${appName}`,
          vscode.ViewColumn.Two,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          }
        );

        // Set webview content
        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from the webview (forwarded from the debugger iframe)
        this.panel.webview.onDidReceiveMessage(async (message) => {
          if (message.command === "openExternal") {
            await vscode.env.openExternal(vscode.Uri.parse(message.url));
          }
        });

        // When the user closes the panel, stop the server for this app
        this.panel.onDidDispose(async () => {
          this.panel = null;
          // Only stop if the server is still running — avoids double-stop
          // when the "Stop Debug Server" command closes the panel explicitly
          if (this.serverManager.isRunning()) {
            await this.serverManager.stop();
          }
        });
      }

      // Load WASM if path provided — wait for UI WebSocket to connect first
      // so the wasm_loaded event is not missed
      if (wasmPath) {
        await this.waitForWebSocketClient();
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
      // Load via REST API using path-based loading — server is local so the
      // path is always accessible, and avoids the "binary.wasm" placeholder filename
      const response = await fetch(
        `${this.serverManager.getUrl()}/api/load`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Source": "vscode",
          },
          body: JSON.stringify({
            wasmPath,
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
   * Poll until the debugger UI has established its WebSocket connection,
   * then the wasm_loaded event will be received. Gives up after timeoutMs.
   */
  private async waitForWebSocketClient(timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(`${this.serverManager.getUrl()}/api/client-count`);
        const { count } = await response.json();
        if (count > 0) return;
      } catch {
        // Server may not be ready yet — keep polling
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    // Timeout — proceed anyway, load is better than no load
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
    const vscode = acquireVsCodeApi();
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

    // Forward openExternal messages from the debugger iframe to the extension host
    window.addEventListener('message', function(event) {
      if (event.data && event.data.command === 'openExternal') {
        vscode.postMessage({ command: 'openExternal', url: event.data.url });
      }
    });
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
