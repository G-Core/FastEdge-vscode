import * as vscode from "vscode";
import * as os from "os";

export type DebugConfig = vscode.DebugConfiguration;

export class BinaryDebugConfigurationProvider
  implements vscode.DebugConfigurationProvider
{
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  private getLauncherPath(extensionPath: string): string {
    switch (os.platform()) {
      // todo: add support for windows
      // case "win32":
      //   return vscode.Uri.joinPath(
      //     vscode.Uri.file(extensionPath),
      //     "fastedge-cli",
      //     "cli.exe"
      //   ).fsPath;
      case "darwin":
        return vscode.Uri.joinPath(
          vscode.Uri.file(extensionPath),
          "fastedge-cli",
          "cli-darwin-arm64"
        ).fsPath;
      case "linux":
        return vscode.Uri.joinPath(
          vscode.Uri.file(extensionPath),
          "fastedge-cli",
          "cli-linux-x64"
        ).fsPath;
      default:
        throw new Error("Unsupported platform");
    }
  }

  async resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    token?: vscode.CancellationToken
  ): Promise<DebugConfig | undefined> {
    try {
      if (
        config?.debugContext !== "file" &&
        config?.debugContext !== "workspace"
      ) {
        // Prompt the user to select a debug context if not provided
        if (!config.entrypoint || config.entrypoint.toLowerCase() === "file") {
          config.debugContext = "file";
        } else if (config.entrypoint.toLowerCase() === "workspace") {
          config.debugContext = config.entrypoint;
        } else {
          const selectedContext = await vscode.window.showQuickPick([
            { label: "File", description: "Debug the active file" },
            { label: "Workspace", description: "Debug the workspace" },
          ]);
          if (!selectedContext) {
            throw new Error("No program specified for debugging.");
          }
          config.debugContext = selectedContext.label.toLowerCase();
        }
      }
      // Get the path to the FastEdge CLI - this is required to launch the binary
      // Can be overwritten in launch.json configuration
      if (!config.cliPath) {
        config.cliPath = this.getLauncherPath(this.context.extensionPath);
      }
      return config as DebugConfig;
    } catch (err) {
      vscode.window.showErrorMessage(`Error: ${(err as Error).message}`);
      return undefined;
    }
  }
}
