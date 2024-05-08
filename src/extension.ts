import * as vscode from "vscode";

import { compileJavascriptBinary } from "./js_build";
import { compileRustAndFindBinary } from "./rust_build";

type ExtLanguage = "javascript" | "rust";
export type DebugContext = "file" | "workspace";

function getActiveFileLanguage(): ExtLanguage | null {
  const languageId = vscode.window.activeTextEditor?.document.languageId ?? "";
  const javascriptLanguageIds = [
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact",
  ];
  if (javascriptLanguageIds.includes(languageId)) {
    return "javascript";
  } else if (languageId === "rust") {
    return "rust";
  }
  return null;
}

async function compileActiveEditorsBinary(
  debugContext: DebugContext = "file"
): Promise<string> {
  const activeFile =
    debugContext === "workspace"
      ? vscode.workspace?.workspaceFolders?.[0].uri.fsPath + "/"
      : vscode.window.activeTextEditor?.document.uri.fsPath;

  const activeFileLanguage = getActiveFileLanguage();
  if (!activeFile || !activeFileLanguage) {
    // return an error.. need to have a rust or javascript file selected
    throw new Error(
      "No active file or language detected is incorrect! Only Rust or Javascript files are supported"
    );
  }
  if (activeFileLanguage === "javascript") {
    return compileJavascriptBinary(activeFile, debugContext);
  } else if (activeFileLanguage === "rust") {
    const activeFilePath = activeFile?.slice(0, activeFile?.lastIndexOf("/"));
    return compileRustAndFindBinary(activeFilePath as string);
  }
  return "";
}

class MyDebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
    executable: vscode.DebugAdapterExecutable
  ): vscode.DebugAdapterExecutable {
    return new vscode.DebugAdapterExecutable(executable.command);
  }
}

class BinaryDebugConfigurationProvider {
  async resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder,
    config: vscode.DebugConfiguration,
    _token: vscode.CancellationToken
  ) {
    try {
      config.binary = await compileActiveEditorsBinary(config?.debugContext);
      return config;
    } catch (err) {
      vscode.window.showErrorMessage(`Error: ${(err as Error).message}`);
      return undefined;
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("fastegde.run-file", () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("FastEdge: Running File!");
      vscode.debug.startDebugging(undefined, {
        type: "fastedge",
        name: "Debug File",
        request: "launch",
        program: "${file}",
        debugContext: "file",
      });
    }),
    vscode.commands.registerCommand("fastegde.run-workspace", () => {
      vscode.window.showInformationMessage("FastEdge: Running Workspace!");
      vscode.debug.startDebugging(undefined, {
        type: "fastedge",
        name: "Debug Workspace",
        request: "launch",
        program: "${file}",
        debugContext: "workspace",
      });
    }),
    vscode.debug.registerDebugAdapterDescriptorFactory(
      "fastedge",
      new MyDebugAdapterDescriptorFactory()
    )
  );
}

vscode.debug.registerDebugConfigurationProvider(
  "fastedge",
  new BinaryDebugConfigurationProvider()
);
