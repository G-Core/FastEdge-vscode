import * as vscode from "vscode";
import { compileRustAndFindBinary } from "./rust_build";

type ExtLanguage = "javascript" | "rust";

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

async function compileActiveEditorsBinary(): Promise<string> {
  const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
  const activeFileLanguage = getActiveFileLanguage();
  if (!activeFile || !activeFileLanguage) {
    // return an error.. need to have a rust or javascript file selected
  }
  const activeFilePath = activeFile?.slice(0, activeFile?.lastIndexOf("/"));
  if (activeFileLanguage === "javascript") {
  } else if (activeFileLanguage === "rust") {
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
      config.binary = await compileActiveEditorsBinary();
      return config;
    } catch (err) {
      vscode.window.showErrorMessage(`Error: ${(err as Error).message}`);
      return undefined;
    }
  }
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
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

export default activate;
