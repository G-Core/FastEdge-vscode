import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join, relative, isAbsolute } from "path";

// Changed in place: the mock module keeps this array.
const folders = vi.hoisted(() => ({ list: [] as string[], objects: [] as { uri: { fsPath: string } }[], match: undefined as string | undefined }));
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
      if (folders.match) {return { uri: { fsPath: folders.match } };}
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

  it("takes the deepest workspace folder that holds the file by real path, whatever their order", () => {
    mkdirSync(join(base, "real", "proj", ".fastedge-debug"), { recursive: true }); // the outer folder's marker
    const file = app(join(base, "real", "proj", "nested", "app"));
    symlinkSync(join(base, "real", "proj"), join(base, "link"), "junction");
    symlinkSync(join(base, "real", "proj", "nested"), join(base, "nested-link"), "junction");
    setFolders([join(base, "link"), join(base, "nested-link")]);
    expect(debuggerRootFor(file)).toBe(join(base, "nested-link", "app"));
  });

  it("searches in the folder's spelling when VS Code matched a differently spelled path", () => {
    const file = app(join(base, "real", "proj", "app"));
    symlinkSync(join(base, "real", "proj"), join(base, "link"), "junction");
    // VS Code matched the file to the folder (as for other letter case on macOS) though the path,
    // as written, is not under it.
    setFolders([join(base, "link")]);
    folders.match = join(base, "link");
    try {
      expect(debuggerRootFor(file)).toBe(join(base, "link", "app"));
    } finally {
      folders.match = undefined;
    }
  });
});
