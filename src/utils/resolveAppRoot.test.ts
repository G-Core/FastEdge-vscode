import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveConfigRoot, resolveBuildRoot, ensureDebugDir } from "./resolveAppRoot";

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
