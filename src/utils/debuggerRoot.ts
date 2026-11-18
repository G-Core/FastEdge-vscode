import * as vscode from "vscode";
import { resolveDebuggerRoot } from "./resolveAppRoot";

/** The debugger's root for a file, bounded by the VS Code workspace folder that holds it. */
export function debuggerRootFor(filePath: string): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  return resolveDebuggerRoot(filePath, folder?.uri.fsPath);
}
