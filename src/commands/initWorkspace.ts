import * as vscode from "vscode";
import * as jsonc from "jsonc-parser";

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
  let rawText: string | undefined;

  try {
    const fileData = await vscode.workspace.fs.readFile(launchJsonUri);
    rawText = Buffer.from(fileData).toString("utf8");
    fileExists = true;
  } catch (error: any) {
    const code = error?.code || error?.name;
    if (code !== "FileNotFound" && code !== "ENOENT") {
      vscode.window.showErrorMessage(
        `Failed to read launch.json: ${error?.message || error}`,
      );
      return;
    }
    /* launch.json doesn't exist yet — we'll create it */
  }

  if (fileExists && rawText !== undefined) {
    const errors: jsonc.ParseError[] = [];
    const parsed = jsonc.parse(rawText, errors, { allowTrailingComma: true });
    if (
      errors.length > 0 ||
      parsed === null ||
      parsed === undefined ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      vscode.window.showErrorMessage(
        "Your existing .vscode/launch.json contains invalid JSON. Please fix it manually; the FastEdge configuration was not added.",
      );
      const doc = await vscode.workspace.openTextDocument(launchJsonUri);
      await vscode.window.showTextDocument(doc);
      return;
    }
    launchJson = {
      version: typeof parsed.version === "string" ? parsed.version : "0.2.0",
      configurations: Array.isArray(parsed.configurations) ? parsed.configurations : [],
    };
  }

  const existing = launchJson.configurations.find((c) => c.type === "fastedge");
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

  let outputText: string;
  if (fileExists && rawText !== undefined) {
    // Targeted edit: append to the configurations array in the original text,
    // preserving any existing comments and formatting.
    const edits = jsonc.modify(
      rawText,
      ["configurations", -1],
      LAUNCH_CONFIG,
      { formattingOptions: { tabSize: 2, insertSpaces: true } },
    );
    outputText = jsonc.applyEdits(rawText, edits);
  } else {
    outputText =
      JSON.stringify({ version: "0.2.0", configurations: [LAUNCH_CONFIG] }, null, 2) + "\n";
  }

  try {
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.joinPath(workspaceFolder.uri, ".vscode"),
    );
    await vscode.workspace.fs.writeFile(launchJsonUri, Buffer.from(outputText));
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
