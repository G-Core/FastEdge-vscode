import * as vscode from "vscode";

const LAUNCH_CONFIG = {
  type: "fastedge",
  request: "launch",
  name: "FastEdge App",
};

async function initWorkspace() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder available.");
    return;
  }

  const launchJsonUri = vscode.Uri.joinPath(
    workspaceFolder.uri,
    ".vscode",
    "launch.json",
  );

  let launchJson: { version: string; configurations: Record<string, unknown>[] } = {
    version: "0.2.0",
    configurations: [],
  };

  let fileExists = false;
  try {
    const fileData = await vscode.workspace.fs.readFile(launchJsonUri);
    launchJson = JSON.parse(Buffer.from(fileData).toString("utf8"));
    fileExists = true;
  } catch {
    /* launch.json doesn't exist yet — we'll create it */
  }

  const existing = launchJson.configurations?.find((c) => c.type === "fastedge");
  if (existing) {
    const open = await vscode.window.showInformationMessage(
      "This workspace already has a FastEdge launch configuration.",
      "Open launch.json",
    );
    if (open) {
      const doc = await vscode.workspace.openTextDocument(launchJsonUri);
      await vscode.window.showTextDocument(doc);
    }
    return;
  }

  if (!Array.isArray(launchJson.configurations)) {
    launchJson.configurations = [];
  }
  launchJson.configurations.push(LAUNCH_CONFIG);

  try {
    await vscode.workspace.fs.writeFile(
      launchJsonUri,
      Buffer.from(JSON.stringify(launchJson, null, 2) + "\n"),
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to write launch.json: ${error?.message || error}`,
    );
    return;
  }

  const action = fileExists ? "Updated" : "Created";
  const result = await vscode.window.showInformationMessage(
    `${action} .vscode/launch.json. Press F5 to run your FastEdge app.`,
    "Open launch.json",
  );
  if (result === "Open launch.json") {
    const doc = await vscode.workspace.openTextDocument(launchJsonUri);
    await vscode.window.showTextDocument(doc);
  }
}

export { initWorkspace };
