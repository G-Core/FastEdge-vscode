import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { resolveDebuggerRoot } from "./resolveAppRoot";

function realpath(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

function inside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return !(rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
}

/**
 * The debugger's root for a file, bounded by the VS Code workspace folder that holds it.
 * - A file reached through its real path while the folder was opened through a symlink still
 *   belongs to that folder: it is matched by real path and searched in the folder's spelling.
 * - A root that leaves the folder through a symlink is replaced by the folder, as the debugger
 *   server does (it ignores such an app root and writes its port file in the workspace root).
 */
export function debuggerRootFor(filePath: string): string | null {
  let file = filePath;
  let folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
  if (!folder) {
    const realFile = realpath(filePath);
    for (const f of realFile ? vscode.workspace.workspaceFolders ?? [] : []) {
      const realFolder = realpath(f.uri.fsPath);
      if (realFolder && inside(realFolder, realFile!)) {
        folder = f.uri.fsPath;
        file = path.join(folder, path.relative(realFolder, realFile!));
        break;
      }
    }
  }
  const root = resolveDebuggerRoot(file, folder);
  if (root && folder) {
    const realRoot = realpath(root);
    const realFolder = realpath(folder);
    if (!realRoot || !realFolder || !inside(realFolder, realRoot)) {return folder;}
  }
  return root;
}
