import * as vscode from "vscode";
import path from "path";
import { readFileSync } from "fs";

import { FastEdgeDebugAdapterDescriptorFactory } from "./FastEdgeDebugAdapterDescriptorFactory";
import { BinaryDebugConfigurationProvider } from "./BinaryDebugConfigurationProvider";
import { LaunchConfiguration } from "./types";

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

export function activate(context: vscode.ExtensionContext) {
  // Read the cliVersion from METADATA.json
  const metadataJsonPath = path.join(
    context.extensionPath,
    "fastedge-cli/METADATA.json"
  );
  const metadataJson = JSON.parse(readFileSync(metadataJsonPath, "utf8"));
  const cliVersion = metadataJson.fastedge_run_version || "unknown";

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
    }),
    vscode.commands.registerCommand("fastedge.run-workspace", () => {
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
                dotenv: false,
                env: {},
                secrets: {},
                headers: {},
                geoIpHeaders: false,
                responseHeaders: {},
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
