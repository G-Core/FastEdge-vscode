import * as vscode from "vscode";

import { LaunchConfiguration } from "../types";

function getLaunchConfigurations(
  scope?: vscode.ConfigurationScope | null
): LaunchConfiguration {
  const config = vscode.workspace.getConfiguration("launch", scope);
  const configurations = config.get<any[]>("configurations");
  const fastedgeConfig = configurations?.find(
    (c) => c.type === "fastedge" && c.request === "launch"
  );
  return fastedgeConfig ?? {};
}

function runFile() {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    vscode.window.showInformationMessage("FastEdge: Running File");
    vscode.debug.startDebugging(undefined, {
      ...getLaunchConfigurations(activeEditor?.document.uri),
      type: "fastedge",
      name: "Debug File",
      request: "launch",
      program: "${file}",
      debugContext: "file",
    });
  } else {
    vscode.window.showErrorMessage("No active file to debug.");
  }
}

function runWorkspace() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    vscode.window.showInformationMessage("FastEdge: Running Workspace");
    vscode.debug.startDebugging(
      undefined,
      {
        ...getLaunchConfigurations(workspaceFolder.uri),
        type: "fastedge",
        name: "Debug Workspace",
        request: "launch",
        program: "${file}",
        debugContext: "workspace",
      },
      { noDebug: true }
    );
  } else {
    vscode.window.showErrorMessage("No workspace folder available.");
  }
}

export { runFile, runWorkspace };
