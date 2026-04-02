import * as vscode from "vscode";
import * as path from "path";
import { readFile } from "fs/promises";
import { DebuggerServerManager, DebuggerWebviewProvider } from "../debugger";
import { compileActiveEditorsBinary } from "../compiler";
import { resolveConfigRoot, resolveBuildRoot, ensureDebugDir } from "../utils/resolveAppRoot";
import { DebugContext } from "../types";

type AppDebuggerFactory = (appRoot: string) => {
  manager: DebuggerServerManager;
  provider: DebuggerWebviewProvider;
};

let debuggerFactory: AppDebuggerFactory | null = null;

/**
 * Create a pseudoterminal for build output
 * Note: Using terminal instead of Output Channel for proper ANSI color rendering.
 */
function createBuildTerminal(): {
  terminal: vscode.Terminal;
  write: (data: string) => void;
} {
  const writeEmitter = new vscode.EventEmitter<string>();

  const pty: vscode.Pseudoterminal = {
    onDidWrite: writeEmitter.event,
    open: () => {},
    close: () => {},
  };

  const terminal = vscode.window.createTerminal({
    name: "FastEdge Build",
    pty,
  });

  return {
    terminal,
    write: (data: string) => {
      // Terminals need \r\n for proper line breaks, not just \n
      const normalizedData = data.replace(/\r?\n/g, "\r\n");
      writeEmitter.fire(normalizedData);
    },
  };
}

/**
 * Initialize the debugger components factory.
 * Called from extension.ts during activation.
 */
export function initializeDebuggerComponents(factory: AppDebuggerFactory) {
  debuggerFactory = factory;
}

/**
 * Build WASM, start debugger, and load the application
 */
async function buildAndDebug(debugContext: DebugContext): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage("No active file to debug.");
    return;
  }

  if (!debuggerFactory) {
    vscode.window.showErrorMessage(
      "Debugger not available. Extension may not be initialized correctly.",
    );
    return;
  }

  const activeFilePath = activeEditor.document.uri.fsPath;
  const buildRoot = resolveBuildRoot(activeFilePath);
  if (!buildRoot) {
    vscode.window.showErrorMessage(
      "Could not find app root. Ensure your project has a package.json or Cargo.toml.",
    );
    return;
  }

  // Resolve per-app identity anchor. If no .fastedge-debug/ dir exists yet,
  // create one co-located with the active file so that the entrypoint directory
  // becomes its own configRoot. This gives each app isolation without requiring
  // the user to have pre-created a debug directory.
  let portAnchor = resolveConfigRoot(activeFilePath);
  if (!portAnchor) {
    const activeDir = path.dirname(activeFilePath);
    ensureDebugDir(activeDir);
    portAnchor = activeDir;
  }

  const { manager, provider } = debuggerFactory(portAnchor);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "FastEdge Debugger",
        cancellable: false,
      },
      async (progress) => {
        // Step 1: Build the WASM
        progress.report({ message: "Building WASM..." });
        const { terminal, write } = createBuildTerminal();
        terminal.show(true);

        const logToConsole = (message: string) => {
          write(message);
        };

        let wasmPath: string;
        try {
          const binaryInfo = await compileActiveEditorsBinary(
            debugContext,
            logToConsole,
          );
          wasmPath = binaryInfo.path;
          write(`\n✓ Build successful: ${wasmPath}\n`);
          // Auto-close the terminal after 3s on success — leave open on failure
          setTimeout(() => terminal.dispose(), 3000);
        } catch (error) {
          write(`\n✗ Build failed: ${(error as Error).message}\n`);
          throw error;
        }

        // Step 2: Start debugger server for this app
        progress.report({ message: "Starting debugger server..." });
        await manager.start();

        // Step 3: Open debugger webview and load WASM
        progress.report({ message: "Opening debugger..." });
        await provider.showDebugger(wasmPath);

        vscode.window.showInformationMessage(
          `FastEdge app loaded successfully! Debugger running on port ${manager.getPort()}`,
        );
      },
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to debug application: ${(error as Error).message}`,
    );
  }
}

function runFile() {
  return buildAndDebug("file");
}

function runWorkspace() {
  return buildAndDebug("workspace");
}

/**
 * Load a pre-built WASM binary directly into the debugger.
 * Triggered from the explorer context menu on .wasm files.
 * Skips the build step — uses the file as-is.
 */
async function loadWasmInDebugger(uri?: vscode.Uri): Promise<void> {
  if (!debuggerFactory) {
    vscode.window.showErrorMessage("Debugger not available. Extension may not be initialized correctly.");
    return;
  }

  if (!uri) {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { "WebAssembly Binary": ["wasm"] },
      openLabel: "Load WASM",
      title: "Select a compiled WASM binary",
    });
    if (!picked || picked.length === 0) {
      return;
    }
    uri = picked[0];
  }

  const wasmPath = uri.fsPath;
  const wasmDir = path.dirname(wasmPath);
  const configRoot = resolveConfigRoot(wasmPath);
  if (!configRoot) {
    ensureDebugDir(wasmDir);
  }
  const appRoot = configRoot ?? wasmDir;

  const { provider } = debuggerFactory(appRoot);

  try {
    await provider.showDebugger(wasmPath);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to load WASM: ${(error as Error).message}`);
  }
}

/**
 * Load a fastedge test config JSON file into the running debugger.
 * Triggered from the explorer context menu on *test.json files.
 * Opens the debugger if not already open, then sends the config content.
 */
async function loadConfigInDebugger(uri?: vscode.Uri): Promise<void> {
  if (!debuggerFactory) {
    vscode.window.showErrorMessage("Debugger not available. Extension may not be initialized correctly.");
    return;
  }

  if (!uri) {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { "FastEdge Test Config": ["json"] },
      openLabel: "Load Config",
      title: "Select a FastEdge test config file (*test.json)",
    });
    if (!picked || picked.length === 0) {
      return;
    }
    uri = picked[0];
  }

  const configPath = uri.fsPath;
  const configDir = path.dirname(configPath);
  const appRoot = resolveConfigRoot(configPath) ?? configDir;

  const { provider } = debuggerFactory(appRoot);

  try {
    // Start server and open panel (no WASM yet)
    await provider.showDebugger();

    // Read config and send to the React app via the existing filePickerResult path
    const content = await readFile(configPath, "utf-8");
    await provider.sendConfig(content, path.basename(configPath), configDir);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to load config: ${(error as Error).message}`);
  }
}

export { runFile, runWorkspace, loadWasmInDebugger, loadConfigInDebugger };
