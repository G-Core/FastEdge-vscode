import * as vscode from "vscode";
import path from "node:path";
import fs from "node:fs";

import { DebugContext } from "../types";

function findNearestDotenvFolder(
  stopDir: string,
  startDir: string
): string | null {
  // Walks up the tree from activeFile location to find the nearest .env file
  // stops when it reaches the Workspace root. i.e. --dotenv will be set as "false"
  const files = fs.readdirSync(startDir);
  if (files.find((file) => file.startsWith(".env"))) {
    // this directory contains a .env file
    return startDir;
  }
  if (startDir.length < stopDir.length) {
    return null; // No .env file found
  }
  return findNearestDotenvFolder(stopDir, path.dirname(startDir));
}

function validateDotenvPath(dotenvPath: string): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceFolder) {
    throw new Error("No workspace found!");
  }
  const resolvedDotenvPath = path.isAbsolute(dotenvPath)
    ? dotenvPath // Use the absolute path as-is
    : path.join(workspaceFolder, dotenvPath);

  const files = fs.readdirSync(resolvedDotenvPath);
  if (files.find((file) => file.startsWith(".env"))) {
    // this directory contains a .env file
    return resolvedDotenvPath;
  }
  return null;
}

function findDotenvLocation(
  debugContext: DebugContext = "file"
): string | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const activeFile =
    debugContext === "workspace"
      ? vscode.workspace?.workspaceFolders?.[0].uri.fsPath +
        path.sep +
        "index.js" // Does not matter what this filename is.. used solely for the directory structure.
      : vscode.window.activeTextEditor?.document.uri.fsPath;

  if (!activeFile || !workspaceFolder) {
    throw new Error("No active file or workspace found!");
  }
  const dotEnvLocation = findNearestDotenvFolder(
    workspaceFolder.uri.fsPath,
    path.dirname(activeFile)
  );
  return dotEnvLocation;
}

export { findDotenvLocation, validateDotenvPath };
