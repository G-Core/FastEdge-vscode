import * as vscode from "vscode";
import path from "path";
import { readFileSync } from "fs";

import {
  createLaunchJson,
  createMCPJson,
  setupCodespaceSecret,
  runFile,
  runWorkspace,
  initializeDebuggerComponents,
} from "./commands";
import { initializeTriggerFileHandler } from "./autorun/triggerFileHandler";
import {
  DebuggerServerManager,
  DebuggerWebviewProvider,
} from "./debugger";
import { resolveAppRoot } from "./utils/resolveAppRoot";

// Per-app-root instances — keyed by resolved app root path
const serverManagers = new Map<string, DebuggerServerManager>();
const webviewProviders = new Map<string, DebuggerWebviewProvider>();

let extensionContext: vscode.ExtensionContext | null = null;

function getOrCreateForAppRoot(appRoot: string): {
  manager: DebuggerServerManager;
  provider: DebuggerWebviewProvider;
} {
  if (!extensionContext) {
    throw new Error("Extension not activated");
  }

  if (!serverManagers.has(appRoot)) {
    const manager = new DebuggerServerManager(extensionContext.extensionPath, appRoot);
    const provider = new DebuggerWebviewProvider(extensionContext, manager);
    serverManagers.set(appRoot, manager);
    webviewProviders.set(appRoot, provider);
  }

  return {
    manager: serverManagers.get(appRoot)!,
    provider: webviewProviders.get(appRoot)!,
  };
}

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;

  // Read the cliVersion from METADATA.json (bundled with debugger)
  const metadataJsonPath = path.join(
    context.extensionPath,
    "dist/debugger/fastedge-cli/METADATA.json",
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

  // Wire up the per-app factory for runFile/runWorkspace
  initializeDebuggerComponents(getOrCreateForAppRoot);

  // Register debug configuration provider so F5 works
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider("fastedge", {
      resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
      ): vscode.ProviderResult<vscode.DebugConfiguration> {
        // When F5 is pressed, trigger our build and debug workflow
        const debugContext = config.debugContext || config.entrypoint || "file";
        if (debugContext === "workspace") {
          runWorkspace();
        } else {
          runFile();
        }
        // Return undefined to cancel the default debug session
        // since we're handling it ourselves
        return undefined;
      },
    })
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
 * Start the debugger server for the current active file's app
 */
async function startDebuggerServer(): Promise<void> {
  const appRoot = getActiveAppRoot();
  if (!appRoot) return;

  const { manager } = getOrCreateForAppRoot(appRoot);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Starting FastEdge Debugger Server...",
        cancellable: false,
      },
      async () => {
        await manager.start();
      }
    );

    vscode.window.showInformationMessage(
      `FastEdge Debugger server started on port ${manager.getPort()}`
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to start debugger server: ${(error as Error).message}`
    );
  }
}

/**
 * Stop a debugger server. If multiple are running, shows a picker.
 */
async function stopDebuggerServer(): Promise<void> {
  const running = Array.from(serverManagers.entries()).filter(([, m]) =>
    m.isRunning()
  );

  if (running.length === 0) {
    vscode.window.showWarningMessage("No FastEdge debugger servers are running");
    return;
  }

  let appRoot: string;

  if (running.length === 1) {
    appRoot = running[0][0];
  } else {
    const picked = await vscode.window.showQuickPick(
      running.map(([root]) => ({
        label: path.basename(root),
        description: root,
        appRoot: root,
      })),
      { placeHolder: "Select which debugger server to stop" }
    );
    if (!picked) return;
    appRoot = picked.appRoot;
  }

  const manager = serverManagers.get(appRoot)!;
  const provider = webviewProviders.get(appRoot);
  try {
    await manager.stop();
    provider?.close();
    serverManagers.delete(appRoot);
    webviewProviders.delete(appRoot);
    vscode.window.showInformationMessage(
      `FastEdge Debugger stopped for ${path.basename(appRoot)}`
    );
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
  const appRoot = getActiveAppRoot();
  if (!appRoot) return;

  const { provider } = getOrCreateForAppRoot(appRoot);

  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active file to debug");
      return;
    }

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
      return;
    }

    let wasmPath: string | undefined;

    if (shouldBuild.build) {
      // TODO: Integrate with existing compiler
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

    await provider.showDebugger(wasmPath);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to start debugging: ${(error as Error).message}`
    );
  }
}

/**
 * Get the app root for the currently active file, with user-facing error if none found.
 */
function getActiveAppRoot(): string | null {
  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!activeFile) {
    vscode.window.showErrorMessage("No active file open");
    return null;
  }

  const appRoot = resolveAppRoot(activeFile);
  if (!appRoot) {
    vscode.window.showErrorMessage(
      "Could not find app root. Ensure your project has a package.json, Cargo.toml, or fastedge-config.test.json."
    );
    return null;
  }
  return appRoot;
}

export function deactivate() {
  // Stop all per-app debugger servers on extension deactivation
  const stops = Array.from(serverManagers.values()).map((m) =>
    m.stop().catch(console.error)
  );
  return Promise.all(stops);
}
