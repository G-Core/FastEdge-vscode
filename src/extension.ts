import * as vscode from "vscode";
import path from "path";
import { readFileSync } from "fs";

import {
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
        if (debugContext === "workspace" || debugContext === "package") {
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
    vscode.commands.registerCommand("fastedge.generate-mcp-json", () =>
      createMCPJson(context),
    ),
    vscode.commands.registerCommand("fastedge.setup-codespace-secret", () =>
      setupCodespaceSecret(context),
    ),
  );
}

export function deactivate() {
  // Stop all per-app debugger servers on extension deactivation
  const stops = Array.from(serverManagers.values()).map((m) =>
    m.stop().catch(console.error)
  );
  return Promise.all(stops);
}
