import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { resolveDebuggerRoot } from "./resolveAppRoot";

/** The path on disk; native, so letter case is the disk's too (the JS version keeps the input's). */
function realpath(p: string): string | null {
  try {
    return fs.realpathSync.native(p);
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
 * - A file whose path differs from the folder's spelling (reached through its real path while the
 *   folder was opened through a symlink, or in other letter case on macOS) still belongs to that
 *   folder: it is matched by real path (the deepest folder, as VS Code does) and searched in the
 *   folder's spelling.
 * - A root that leaves the folder through a symlink is replaced by the folder, as the debugger
 *   server does (it ignores such an app root and writes its port file in the workspace root).
 */
export function debuggerRootFor(filePath: string): string | null {
  let file = filePath;
  let folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath;
  const realFile = realpath(filePath);
  if (!folder && realFile) {
    let deepest = "";
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      const realFolder = realpath(f.uri.fsPath);
      if (realFolder && inside(realFolder, realFile) && realFolder.length > deepest.length) {
        deepest = realFolder;
        folder = f.uri.fsPath;
      }
    }
  }
  if (folder && realFile && !inside(folder, filePath)) {
    const realFolder = realpath(folder);
    if (realFolder && inside(realFolder, realFile)) {file = path.join(folder, path.relative(realFolder, realFile));}
  }
  const root = resolveDebuggerRoot(file, folder);
  if (root && folder) {
    const realRoot = realpath(root);
    const realFolder = realpath(folder);
    if (!realRoot || !realFolder || !inside(realFolder, realRoot)) {return folder;}
  }
  return root;
}
