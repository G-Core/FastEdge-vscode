import * as vscode from "vscode";
import path from "path";
import { readFileSync } from "fs";

import {
  createLaunchJson,
  createMCPJson,
  setupCodespaceSecret,
  runFile,
  runWorkspace,
} from "./commands";
import { initializeTriggerFileHandler } from "./autorun/triggerFileHandler";
import {
  DebuggerServerManager,
  DebuggerWebviewProvider,
} from "./debugger";

// Global instances
let debuggerServerManager: DebuggerServerManager | null = null;
let debuggerWebviewProvider: DebuggerWebviewProvider | null = null;

export function activate(context: vscode.ExtensionContext) {
  // Read the cliVersion from METADATA.json
  const metadataJsonPath = path.join(
    context.extensionPath,
    "fastedge-cli/METADATA.json",
  );
  const metadataJson = JSON.parse(readFileSync(metadataJsonPath, "utf8"));
  const cliVersion = metadataJson.fastedge_run_version || "unknown";

  // Set the cliVersion setting
  vscode.workspace
    .getConfiguration()
    .update(
      "fastedge.cliVersion",
      cliVersion,
      vscode.ConfigurationTarget.Global,
    );

  // Initialize trigger file handler for auto-running commands
  initializeTriggerFileHandler(context);

  // Initialize debugger components with bundled debugger
  debuggerServerManager = new DebuggerServerManager(context.extensionPath);
  debuggerWebviewProvider = new DebuggerWebviewProvider(
    context,
    debuggerServerManager
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("fastedge.run-file", runFile),
    vscode.commands.registerCommand("fastedge.run-workspace", runWorkspace),
    vscode.commands.registerCommand(
      "fastedge.generate-launch-json",
      createLaunchJson,
    ),
    vscode.commands.registerCommand("fastedge.generate-mcp-json", () =>
      createMCPJson(context),
    ),
    vscode.commands.registerCommand("fastedge.setup-codespace-secret", () =>
      setupCodespaceSecret(context),
    ),

    // Debugger commands
    vscode.commands.registerCommand(
      "fastedge.start-debugger-server",
      startDebuggerServer
    ),
    vscode.commands.registerCommand(
      "fastedge.stop-debugger-server",
      stopDebuggerServer
    ),
    vscode.commands.registerCommand("fastedge.debug-app", debugFastEdgeApp),
  );
}

/**
 * Start the debugger server
 */
async function startDebuggerServer(): Promise<void> {
  if (!debuggerServerManager) {
    vscode.window.showErrorMessage(
      "Debugger not available. Extension may not be installed correctly."
    );
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Starting FastEdge Debugger Server...",
        cancellable: false,
      },
      async () => {
        await debuggerServerManager!.start();
      }
    );

    vscode.window.showInformationMessage(
      `FastEdge Debugger server started on port ${debuggerServerManager.getPort()}`
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to start debugger server: ${(error as Error).message}`
    );
  }
}

/**
 * Stop the debugger server
 */
async function stopDebuggerServer(): Promise<void> {
  if (!debuggerServerManager) {
    vscode.window.showWarningMessage("Debugger server is not configured");
    return;
  }

  try {
    await debuggerServerManager.stop();
    vscode.window.showInformationMessage("FastEdge Debugger server stopped");
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to stop debugger server: ${(error as Error).message}`
    );
  }
}

/**
 * Debug the current FastEdge application
 */
async function debugFastEdgeApp(): Promise<void> {
  if (!debuggerWebviewProvider) {
    vscode.window.showErrorMessage(
      "Debugger not available. Extension may not be installed correctly."
    );
    return;
  }

  try {
    // Get the active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active file to debug");
      return;
    }

    // Check if we should build first
    const shouldBuild = await vscode.window.showQuickPick(
      [
        {
          label: "Build and Debug",
          description: "Compile to WASM and load into debugger",
          build: true,
        },
        {
          label: "Debug Only",
          description: "Open debugger without building",
          build: false,
        },
      ],
      { placeHolder: "Choose debug mode" }
    );

    if (!shouldBuild) {
      return; // User cancelled
    }

    let wasmPath: string | undefined;

    if (shouldBuild.build) {
      // TODO: Integrate with existing compiler
      // For now, prompt for WASM path
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { "WebAssembly": ["wasm"] },
        title: "Select WASM file to debug",
      });

      if (result && result[0]) {
        wasmPath = result[0].fsPath;
      }
    }

    // Show debugger with optional WASM
    await debuggerWebviewProvider.showDebugger(wasmPath);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to start debugging: ${(error as Error).message}`
    );
  }
}

export function deactivate() {
  // Cleanup debugger server on extension deactivation
  if (debuggerServerManager) {
    debuggerServerManager.stop().catch(console.error);
  }
}
