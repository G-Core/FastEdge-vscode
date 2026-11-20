import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join, relative, isAbsolute } from "path";

// Changed in place: the mock module keeps this array.
const folders = vi.hoisted(() => ({ list: [] as string[], objects: [] as { uri: { fsPath: string } }[] }));
const setFolders = (paths: string[]) => {
  folders.list.splice(0, Infinity, ...paths);
  folders.objects.splice(0, Infinity, ...paths.map((fsPath) => ({ uri: { fsPath } })));
};
vi.mock("vscode", () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: {
    workspaceFolders: folders.objects,
    // As VS Code: by the path as written.
    getWorkspaceFolder: (uri: { fsPath: string }) => {
      const fsPath = folders.list.find((f) => {
        const rel = relative(f, uri.fsPath);
        return !rel.startsWith("..") && !isAbsolute(rel);
      });
      return fsPath ? { uri: { fsPath } } : undefined;
    },
  },
}));

import { debuggerRootFor } from "./debuggerRoot";

const app = (dir: string) => {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "package.json"), "{}");
  writeFileSync(join(dir, "src", "index.ts"), "");
  return join(dir, "src", "index.ts");
};

describe("debuggerRootFor", () => {
  let base: string;
  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), "dbg-root-")));
  });

  it("finds the app's folder inside the workspace folder", () => {
    setFolders([join(base, "ws")]);
    const file = app(join(base, "ws", "app"));
    expect(debuggerRootFor(file)).toBe(join(base, "ws", "app"));
  });

  it("uses the workspace folder when the app's folder leaves it through a symlink (as the server does)", () => {
    mkdirSync(join(base, "ws"));
    setFolders([join(base, "ws")]);
    app(join(base, "other", "app"));
    symlinkSync(join(base, "other", "app"), join(base, "ws", "linked-app"), "junction");
    expect(debuggerRootFor(join(base, "ws", "linked-app", "src", "index.ts"))).toBe(join(base, "ws"));
  });

  it("matches a file opened by its real path to a workspace folder opened through a symlink", () => {
    writeFileSync(join(base, "package.json"), "{}"); // a marker above the folder: never reached
    const file = app(join(base, "real", "proj", "app"));
    symlinkSync(join(base, "real", "proj"), join(base, "link"), "junction");
    setFolders([join(base, "link")]);
    expect(debuggerRootFor(file)).toBe(join(base, "link", "app"));
  });
});
