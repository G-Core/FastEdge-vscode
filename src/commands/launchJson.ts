import * as vscode from "vscode";

async function createLaunchJson() {
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

export { createLaunchJson };
