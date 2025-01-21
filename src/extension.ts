import * as vscode from "vscode";
import path from "path";
import { readFileSync } from "fs";

import { FastEdgeDebugAdapterDescriptorFactory } from "./FastEdgeDebugAdapterDescriptorFactory";
import { BinaryDebugConfigurationProvider } from "./BinaryDebugConfigurationProvider";

export function activate(context: vscode.ExtensionContext) {
  // Read the cliVersion from METADATA.json
  const metadataJsonPath = path.join(
    context.extensionPath,
    "fastedge-cli/METADATA.json"
  );
  const metadataJson = JSON.parse(readFileSync(metadataJsonPath, "utf8"));
  const cliVersion = metadataJson.fastedge_cli_version || "unknown";

  // Set the cliVersion setting
  vscode.workspace
    .getConfiguration()
    .update(
      "fastedge.cliVersion",
      cliVersion,
      vscode.ConfigurationTarget.Global
    );

  context.subscriptions.push(
    vscode.commands.registerCommand("fastedge.run-file", () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        const activeEditor = vscode.window.activeTextEditor;
        vscode.window.showInformationMessage(
          `activeEditor: ${activeEditor?.document.uri.fsPath}`
        );
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        vscode.window.showInformationMessage(
          `workspaceFolder ${workspaceFolder?.uri.fsPath}`
        );

        vscode.window.showInformationMessage("FastEdge: Running File");
        vscode.debug.startDebugging(
          undefined,
          {
            type: "fastedge",
            name: "Debug File",
            request: "launch",
            program: "${file}",
            debugContext: "file",
          },
          { noDebug: true }
        );
      } else {
        vscode.window.showErrorMessage("No active file to debug.");
      }
    }),
    vscode.commands.registerCommand("fastedge.run-workspace", () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        vscode.window.showInformationMessage("FastEdge: Running Workspace");
        vscode.debug.startDebugging(
          undefined,
          {
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
    }),
    vscode.commands.registerCommand(
      "fastedge.generate-launch-json",
      async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const launchJsonPath = vscode.Uri.joinPath(
            workspaceFolder.uri,
            ".vscode",
            "launch.json"
          );
          const launchJsonContent = {
            version: "0.2.0",
            configurations: [
              {
                type: "fastedge",
                name: "FastEdge App",
                request: "launch",
                port: 8181,
                env: {},
                headers: {},
                geoIpHeaders: false,
                traceLogging: false,
              },
            ],
          };
          await vscode.workspace.fs.writeFile(
            launchJsonPath,
            Buffer.from(JSON.stringify(launchJsonContent, null, 2))
          );
          vscode.window.showInformationMessage(
            "Generated launch.json with default settings."
          );
        } else {
          vscode.window.showErrorMessage("No workspace folder available.");
        }
      }
    ),
    vscode.debug.registerDebugAdapterDescriptorFactory(
      "fastedge",
      new FastEdgeDebugAdapterDescriptorFactory()
    ),
    vscode.debug.registerDebugConfigurationProvider(
      "fastedge",
      new BinaryDebugConfigurationProvider(context)
    )
  );
}
