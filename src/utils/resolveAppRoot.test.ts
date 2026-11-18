import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveConfigRoot, resolveBuildRoot, resolveDebuggerRoot, ensureDebugDir } from "./resolveAppRoot";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fastedge-test-"));
}

function touch(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "", "utf8");
}

function mkDebugDir(dir: string): void {
  fs.mkdirSync(path.join(dir, ".fastedge-debug"), { recursive: true });
}

// ---------------------------------------------------------------------------
// Fixtures
//
// workspace-1: .fastedge-debug/ in subdir, package.json at root
//
//   tmp/
//   ├── first-app/
//   │   ├── index.js
//   │   └── .fastedge-debug/
//   ├── second-app/
//   │   ├── index.js
//   │   └── .fastedge-debug/
//   └── package.json
//
// workspace-2/first-app: .fastedge-debug/ and package.json at same level
//
//   tmp/
//   ├── src/index.js
//   ├── package.json
//   └── .fastedge-debug/
//
// workspace-2/second-app: .fastedge-debug/ inside src/, package.json one level up
//
//   tmp/
//   ├── src/
//   │   ├── index.js
//   │   └── .fastedge-debug/
//   └── package.json
//
// workspace-2/third-app: no .fastedge-debug/, package.json at root (auto-create case)
//
//   tmp/
//   ├── src/index.js
//   └── package.json
// ---------------------------------------------------------------------------

let tmp: string;

beforeEach(() => {
  tmp = mkTmp();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// resolveConfigRoot
// ---------------------------------------------------------------------------

describe("resolveConfigRoot", () => {
  it("returns the dir containing .fastedge-debug/ (workspace-1 first-app)", () => {
    const configDir = path.join(tmp, "first-app");
    mkDebugDir(configDir);
    touch(path.join(configDir, "index.js"));
    touch(path.join(tmp, "package.json"));

    const result = resolveConfigRoot(path.join(configDir, "index.js"));
    expect(result).toBe(configDir);
  });

  it("returns the dir containing .fastedge-debug/ (workspace-2/second-app — debug dir in src/)", () => {
    const srcDir = path.join(tmp, "src");
    touch(path.join(srcDir, "index.js"));
    mkDebugDir(srcDir);
    touch(path.join(tmp, "package.json"));

    const result = resolveConfigRoot(path.join(srcDir, "index.js"));
    expect(result).toBe(srcDir);
  });

  it("returns the dir when .fastedge-debug/ and package.json are at the same level (workspace-2/first-app)", () => {
    touch(path.join(tmp, "src", "index.js"));
    touch(path.join(tmp, "package.json"));
    mkDebugDir(tmp);

    const result = resolveConfigRoot(path.join(tmp, "src", "index.js"));
    expect(result).toBe(tmp);
  });

  it("returns null when no .fastedge-debug/ exists (third-app)", () => {
    touch(path.join(tmp, "src", "index.js"));
    touch(path.join(tmp, "package.json"));

    const result = resolveConfigRoot(path.join(tmp, "src", "index.js"));
    expect(result).toBeNull();
  });

  it("returns null when startPath does not exist", () => {
    const result = resolveConfigRoot(path.join(tmp, "nonexistent", "file.js"));
    expect(result).toBeNull();
  });

  it("works when startPath is a directory", () => {
    mkDebugDir(tmp);
    const result = resolveConfigRoot(tmp);
    expect(result).toBe(tmp);
  });
});

// ---------------------------------------------------------------------------
// resolveBuildRoot
// ---------------------------------------------------------------------------

describe("resolveBuildRoot", () => {
  it("returns workspace root package.json dir (workspace-1: debug dir in subdir)", () => {
    const appDir = path.join(tmp, "first-app");
    touch(path.join(appDir, "index.js"));
    mkDebugDir(appDir);
    touch(path.join(tmp, "package.json"));

    const result = resolveBuildRoot(path.join(appDir, "index.js"));
    expect(result).toBe(tmp);
  });

  it("returns the nearest package.json dir (workspace-2/first-app: same level as debug dir)", () => {
    touch(path.join(tmp, "src", "index.js"));
    touch(path.join(tmp, "package.json"));
    mkDebugDir(tmp);

    const result = resolveBuildRoot(path.join(tmp, "src", "index.js"));
    expect(result).toBe(tmp);
  });

  it("returns the correct build root when debug dir is deeper than package.json (workspace-2/second-app)", () => {
    const srcDir = path.join(tmp, "src");
    touch(path.join(srcDir, "index.js"));
    mkDebugDir(srcDir);
    touch(path.join(tmp, "package.json"));

    const result = resolveBuildRoot(path.join(srcDir, "index.js"));
    expect(result).toBe(tmp);
  });

  it("returns the build root for third-app (no debug dir)", () => {
    touch(path.join(tmp, "src", "index.js"));
    touch(path.join(tmp, "package.json"));

    const result = resolveBuildRoot(path.join(tmp, "src", "index.js"));
    expect(result).toBe(tmp);
  });

  it("finds Cargo.toml as build root for Rust apps", () => {
    touch(path.join(tmp, "src", "main.rs"));
    touch(path.join(tmp, "Cargo.toml"));

    const result = resolveBuildRoot(path.join(tmp, "src", "main.rs"));
    expect(result).toBe(tmp);
  });

  it("returns null when neither package.json nor Cargo.toml exists", () => {
    touch(path.join(tmp, "src", "index.js"));

    const result = resolveBuildRoot(path.join(tmp, "src", "index.js"));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ensureDebugDir
// ---------------------------------------------------------------------------

describe("ensureDebugDir", () => {
  it("creates .fastedge-debug/ directory when it does not exist", () => {
    ensureDebugDir(tmp);

    const dirPath = path.join(tmp, ".fastedge-debug");
    expect(fs.existsSync(dirPath)).toBe(true);
    expect(fs.statSync(dirPath).isDirectory()).toBe(true);
  });

  it("is a no-op when .fastedge-debug/ already exists", () => {
    const dirPath = path.join(tmp, ".fastedge-debug");
    fs.mkdirSync(dirPath);
    // Place a file inside to verify it's not wiped
    fs.writeFileSync(path.join(dirPath, "app.wasm"), "fake", "utf8");

    ensureDebugDir(tmp);

    expect(fs.existsSync(path.join(dirPath, "app.wasm"))).toBe(true);
  });

  it("after ensureDebugDir at activeFile dir, resolveConfigRoot finds that dir", () => {
    // Simulates the third-app flow: no debug dir found, so we create one
    // co-located with the active file (not at the build root).
    const srcDir = path.join(tmp, "src");
    touch(path.join(srcDir, "index.js"));
    touch(path.join(tmp, "package.json")); // build root is tmp, not srcDir

    // Caller creates debug dir next to the active file
    ensureDebugDir(srcDir);

    const result = resolveConfigRoot(path.join(srcDir, "index.js"));
    expect(result).toBe(srcDir);  // srcDir, not tmp
  });
});

// ---------------------------------------------------------------------------
// .fastedge-debug exists as a file (not a directory)
// ---------------------------------------------------------------------------

describe("resolveConfigRoot — .fastedge-debug is a file", () => {
  it("skips a file named .fastedge-debug and returns null when no directory marker exists", () => {
    touch(path.join(tmp, ".fastedge-debug")); // file, not directory
    touch(path.join(tmp, "index.js"));

    const result = resolveConfigRoot(path.join(tmp, "index.js"));
    expect(result).toBeNull();
  });

  it("skips a file named .fastedge-debug and finds the real directory marker above", () => {
    const child = path.join(tmp, "app");
    touch(path.join(child, ".fastedge-debug")); // file in child
    touch(path.join(child, "index.js"));
    mkDebugDir(tmp); // real directory marker one level up

    const result = resolveConfigRoot(path.join(child, "index.js"));
    expect(result).toBe(tmp);
  });
});

describe("ensureDebugDir — .fastedge-debug is a file", () => {
  it("throws a clear error when .fastedge-debug already exists as a file", () => {
    touch(path.join(tmp, ".fastedge-debug")); // file, not directory

    expect(() => ensureDebugDir(tmp)).toThrowError(
      /already exists as a file/,
    );
  });

  it("does not remove the blocking file", () => {
    touch(path.join(tmp, ".fastedge-debug"));

    try { ensureDebugDir(tmp); } catch { /* expected */ }

    // The file should still be there — ensureDebugDir must not delete it
    expect(fs.existsSync(path.join(tmp, ".fastedge-debug"))).toBe(true);
    expect(fs.statSync(path.join(tmp, ".fastedge-debug")).isFile()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Config root vs build root split — workspace-1 scenario end-to-end
// ---------------------------------------------------------------------------

describe("config root vs build root split (workspace-1)", () => {
  it("configRoot is the app subdir, buildRoot is the workspace root", () => {
    const appDir = path.join(tmp, "first-app");
    touch(path.join(appDir, "index.js"));
    mkDebugDir(appDir);
    touch(path.join(tmp, "package.json"));

    const activeFile = path.join(appDir, "index.js");
    expect(resolveConfigRoot(activeFile)).toBe(appDir);
    expect(resolveBuildRoot(activeFile)).toBe(tmp);
  });

  it("two apps in same workspace get different configRoots but same buildRoot", () => {
    const firstApp = path.join(tmp, "first-app");
    const secondApp = path.join(tmp, "second-app");
    touch(path.join(firstApp, "index.js"));
    mkDebugDir(firstApp);
    touch(path.join(secondApp, "index.js"));
    mkDebugDir(secondApp);
    touch(path.join(tmp, "package.json"));

    expect(resolveConfigRoot(path.join(firstApp, "index.js"))).toBe(firstApp);
    expect(resolveConfigRoot(path.join(secondApp, "index.js"))).toBe(secondApp);
    expect(resolveBuildRoot(path.join(firstApp, "index.js"))).toBe(tmp);
    expect(resolveBuildRoot(path.join(secondApp, "index.js"))).toBe(tmp);
  });
});

// ---------------------------------------------------------------------------
// resolveDebuggerRoot: the search stops at the workspace folder
//
//   tmp/                      ← package.json, .fastedge-debug/ (outside the opened folder)
//   └── opened/               ← the VS Code workspace folder (the boundary)
//       └── wasm/app.wasm
// ---------------------------------------------------------------------------

describe("resolveDebuggerRoot", () => {
  it("never goes above the workspace folder: no match inside it gives the folder itself", () => {
    touch(path.join(tmp, "package.json"));
    mkDebugDir(tmp);
    const opened = path.join(tmp, "opened");
    const wasm = path.join(opened, "wasm", "app.wasm");
    touch(wasm);

    expect(resolveDebuggerRoot(wasm, opened)).toBe(opened);
  });

  it("finds .fastedge-debug/ inside the workspace folder first", () => {
    const opened = path.join(tmp, "opened");
    const app = path.join(opened, "app");
    mkDebugDir(app);
    touch(path.join(opened, "package.json"));
    touch(path.join(app, "src", "index.js"));

    expect(resolveDebuggerRoot(path.join(app, "src", "index.js"), opened)).toBe(app);
  });

  it("finds a package.json / Cargo.toml inside the workspace folder next", () => {
    const opened = path.join(tmp, "opened");
    const crate = path.join(opened, "crate");
    touch(path.join(crate, "Cargo.toml"));
    touch(path.join(crate, "src", "lib.rs"));

    expect(resolveDebuggerRoot(path.join(crate, "src", "lib.rs"), opened)).toBe(crate);
  });

  it("checks the workspace folder itself", () => {
    const opened = path.join(tmp, "opened");
    mkDebugDir(opened);
    touch(path.join(opened, "a", "b", "app.wasm"));

    expect(resolveDebuggerRoot(path.join(opened, "a", "b", "app.wasm"), opened)).toBe(opened);
  });

  it("stops at the workspace folder even when its path is not written like the file's (trailing separator)", () => {
    touch(path.join(tmp, "package.json"));
    mkDebugDir(tmp);
    const opened = path.join(tmp, "opened");
    const wasm = path.join(opened, "wasm", "app.wasm");
    touch(wasm);

    const root = resolveDebuggerRoot(wasm, opened + path.sep);
    expect(root && path.relative(opened, root)).toBe("");
  });

  it("without a workspace folder, walks up without a limit", () => {
    touch(path.join(tmp, "package.json"));
    touch(path.join(tmp, "x", "app.wasm"));

    expect(resolveDebuggerRoot(path.join(tmp, "x", "app.wasm"))).toBe(tmp);
  });
});
