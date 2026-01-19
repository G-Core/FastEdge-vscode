import * as vscode from "vscode";
import path from "path";
import { readFileSync } from "fs";

import { FastEdgeDebugAdapterDescriptorFactory } from "./FastEdgeDebugAdapterDescriptorFactory";
import { BinaryDebugConfigurationProvider } from "./BinaryDebugConfigurationProvider";
import {
  createLaunchJson,
  createMCPJson,
  setupCodespaceSecret,
  runFile,
  runWorkspace,
} from "./commands";

export function activate(context: vscode.ExtensionContext) {
  // Read the cliVersion from METADATA.json
  const metadataJsonPath = path.join(
    context.extensionPath,
    "fastedge-cli/METADATA.json",
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
    vscode.debug.registerDebugAdapterDescriptorFactory(
      "fastedge",
      new FastEdgeDebugAdapterDescriptorFactory(),
    ),
    vscode.debug.registerDebugConfigurationProvider(
      "fastedge",
      new BinaryDebugConfigurationProvider(context),
    ),
  );
}
