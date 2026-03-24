import * as vscode from "vscode";
import * as path from "path";
import { readFile } from "fs/promises";
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

        // Resolve the debugger URL for the webview — in remote environments
        // (e.g. GitHub Codespaces), localhost is not accessible from the browser,
        // so asExternalUri converts it to a forwarded URL.
        const localUri = vscode.Uri.parse(this.serverManager.getUrl());
        const externalUri = await vscode.env.asExternalUri(localUri);
        const debuggerUrl = externalUri.toString();

        // Set webview content
        this.panel.webview.html = this.getWebviewContent(debuggerUrl);

        // Handle messages from the webview (forwarded from the debugger iframe)
        this.panel.webview.onDidReceiveMessage(async (message) => {
          if (message.command === "openExternal") {
            await vscode.env.openExternal(vscode.Uri.parse(message.url));
          }

          if (message.command === "openFilePicker") {
            const appRoot = this.serverManager.getAppRoot();
            const uris = await vscode.window.showOpenDialog({
              defaultUri: vscode.Uri.file(appRoot),
              canSelectMany: false,
              filters: { "JSON Files": ["json"] },
              title: "Load FastEdge Config",
            });
            if (uris && uris.length > 0) {
              const content = await readFile(uris[0].fsPath, "utf-8");
              const fileName = path.basename(uris[0].fsPath);
              this.panel?.webview.postMessage({ command: "filePickerResult", content, fileName });
            } else {
              this.panel?.webview.postMessage({ command: "filePickerResult", canceled: true });
            }
          }

          if (message.command === "getAppRoot") {
            this.panel?.webview.postMessage({
              command: "appRootResult",
              appRoot: this.serverManager.getAppRoot(),
            });
          }

          if (message.command === "openFolderPicker") {
            const appRoot = this.serverManager.getAppRoot();
            const uris = await vscode.window.showOpenDialog({
              defaultUri: vscode.Uri.file(appRoot),
              canSelectMany: false,
              canSelectFiles: false,
              canSelectFolders: true,
              title: "Select .env files directory",
            });
            if (uris && uris.length > 0) {
              this.panel?.webview.postMessage({ command: "folderPickerResult", folderPath: uris[0].fsPath });
            } else {
              this.panel?.webview.postMessage({ command: "folderPickerResult", canceled: true });
            }
          }

          if (message.command === "openSavePicker") {
            const appRoot = this.serverManager.getAppRoot();
            const suggestedName = message.suggestedName ?? "fastedge-config.test.json";
            const uri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.file(path.join(appRoot, suggestedName)),
              filters: { "JSON Files": ["json"] },
              title: "Save FastEdge Config",
            });
            if (uri) {
              this.panel?.webview.postMessage({ command: "savePickerResult", filePath: uri.fsPath });
            } else {
              this.panel?.webview.postMessage({ command: "savePickerResult", canceled: true });
            }
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
            dotenv: { enabled: true },
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
  private getWebviewContent(debuggerUrl: string): string {

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

    // Forward messages from the debugger iframe to the extension host,
    // and forward responses from the extension host back to the iframe.
    window.addEventListener('message', function(event) {
      if (event.data && event.data.command === 'openExternal') {
        vscode.postMessage({ command: 'openExternal', url: event.data.url });
      }
      if (event.data && event.data.command === 'openFilePicker') {
        vscode.postMessage({ command: 'openFilePicker' });
      }
      if (event.data && event.data.command === 'getAppRoot') {
        vscode.postMessage({ command: 'getAppRoot' });
      }
      if (event.data && event.data.command === 'openFolderPicker') {
        vscode.postMessage({ command: 'openFolderPicker' });
      }
      if (event.data && event.data.command === 'openSavePicker') {
        vscode.postMessage({ command: 'openSavePicker', suggestedName: event.data.suggestedName });
      }
      // Forward extension host responses back to the iframe
      if (event.data && event.data.command === 'filePickerResult') {
        iframe.contentWindow.postMessage(event.data, '*');
      }
      if (event.data && event.data.command === 'appRootResult') {
        iframe.contentWindow.postMessage(event.data, '*');
      }
      if (event.data && event.data.command === 'folderPickerResult') {
        iframe.contentWindow.postMessage(event.data, '*');
      }
      if (event.data && event.data.command === 'savePickerResult') {
        iframe.contentWindow.postMessage(event.data, '*');
      }
    });
  </script>
</body>
</html>`;
  }

  /**
   * Send a config file's content to the debugger UI.
   * Posts a filePickerResult message, which ConfigButtons already handles.
   * Waits for the React app to connect via WebSocket before posting.
   */
  async sendConfig(content: string, fileName: string): Promise<void> {
    await this.waitForWebSocketClient();
    if (!this.panel) {
      throw new Error("Debugger panel was closed before the config could be sent.");
    }
    this.panel.webview.postMessage({ command: "filePickerResult", content, fileName });
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
