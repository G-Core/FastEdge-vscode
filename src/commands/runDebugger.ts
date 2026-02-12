import * as vscode from "vscode";
import { DebuggerServerManager, DebuggerWebviewProvider } from "../debugger";
import { compileActiveEditorsBinary } from "../compiler";
import { DebugContext } from "../types";

let debuggerServerManager: DebuggerServerManager | null = null;
let debuggerWebviewProvider: DebuggerWebviewProvider | null = null;

/**
 * Create a pseudoterminal for build output
 * Note: Using terminal instead of Output Channel for proper ANSI color rendering.
 * This can be revisited in the future if we want to use Debug Console via a debug adapter.
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
      const normalizedData = data.replace(/\r?\n/g, '\r\n');
      writeEmitter.fire(normalizedData);
    },
  };
}


/**
 * Initialize the debugger components
 * This should be called from extension.ts during activation
 */
export function initializeDebuggerComponents(
  serverManager: DebuggerServerManager,
  webviewProvider: DebuggerWebviewProvider
) {
  debuggerServerManager = serverManager;
  debuggerWebviewProvider = webviewProvider;
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

  if (!debuggerServerManager || !debuggerWebviewProvider) {
    vscode.window.showErrorMessage(
      "Debugger not available. Extension may not be initialized correctly."
    );
    return;
  }

  try {
    // Show progress notification
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

        const logToConsole = (message: string, type?: "stdout" | "stderr") => {
          // Terminal natively supports ANSI codes
          write(message);
        };

        let wasmPath: string;
        try {
          const binaryInfo = await compileActiveEditorsBinary(
            debugContext,
            logToConsole
          );
          wasmPath = binaryInfo.path;
          write(`\n✓ Build successful: ${wasmPath}\n`);
        } catch (error) {
          write(`\n✗ Build failed: ${(error as Error).message}\n`);
          throw error;
        }

        // Step 2: Start debugger server
        progress.report({ message: "Starting debugger server..." });
        await debuggerServerManager!.start();

        // Step 3: Open debugger webview and load WASM
        progress.report({ message: "Loading WASM into debugger..." });
        await debuggerWebviewProvider!.showDebugger(wasmPath);

        vscode.window.showInformationMessage(
          `FastEdge app loaded successfully! Debugger running on port ${debuggerServerManager!.getPort()}`
        );
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to debug application: ${(error as Error).message}`
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
