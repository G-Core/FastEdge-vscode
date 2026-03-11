import * as vscode from "vscode";
import { DebuggerServerManager, DebuggerWebviewProvider } from "../debugger";
import { compileActiveEditorsBinary } from "../compiler";
import { resolveAppRoot } from "../utils/resolveAppRoot";
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
  const appRoot = resolveAppRoot(activeFilePath);
  if (!appRoot) {
    vscode.window.showErrorMessage(
      "Could not find app root. Ensure your project has a package.json, Cargo.toml, or test-config.json.",
    );
    return;
  }

  const { manager, provider } = debuggerFactory(appRoot);

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

export { runFile, runWorkspace };
