import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveConfigRoot, resolveBuildRoot, ensureConfigFile } from "./resolveAppRoot";

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

// ---------------------------------------------------------------------------
// Fixtures
//
// workspace-1: fastedge-config.test.json in subdir, package.json at root
//
//   tmp/
//   ├── first-app/
//   │   ├── index.js
//   │   └── fastedge-config.test.json
//   ├── second-app/
//   │   ├── index.js
//   │   └── fastedge-config.test.json
//   └── package.json
//
// workspace-2/first-app: config and package.json at same level
//
//   tmp/
//   ├── src/index.js
//   ├── package.json
//   └── fastedge-config.test.json
//
// workspace-2/second-app: config inside src/, package.json one level up
//
//   tmp/
//   ├── src/
//   │   ├── index.js
//   │   └── fastedge-config.test.json
//   └── package.json
//
// workspace-2/third-app: no config file, package.json at root (auto-create case)
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
  it("returns the dir containing fastedge-config.test.json (workspace-1 first-app)", () => {
    const configDir = path.join(tmp, "first-app");
    touch(path.join(configDir, "fastedge-config.test.json"));
    touch(path.join(configDir, "index.js"));
    touch(path.join(tmp, "package.json"));

    const result = resolveConfigRoot(path.join(configDir, "index.js"));
    expect(result).toBe(configDir);
  });

  it("returns the dir containing fastedge-config.test.json (workspace-2/second-app — config in src/)", () => {
    const srcDir = path.join(tmp, "src");
    touch(path.join(srcDir, "index.js"));
    touch(path.join(srcDir, "fastedge-config.test.json"));
    touch(path.join(tmp, "package.json"));

    const result = resolveConfigRoot(path.join(srcDir, "index.js"));
    expect(result).toBe(srcDir);
  });

  it("returns the dir when config and package.json are at the same level (workspace-2/first-app)", () => {
    touch(path.join(tmp, "src", "index.js"));
    touch(path.join(tmp, "package.json"));
    touch(path.join(tmp, "fastedge-config.test.json"));

    const result = resolveConfigRoot(path.join(tmp, "src", "index.js"));
    expect(result).toBe(tmp);
  });

  it("returns null when no fastedge-config.test.json exists (third-app)", () => {
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
    touch(path.join(tmp, "fastedge-config.test.json"));
    const result = resolveConfigRoot(tmp);
    expect(result).toBe(tmp);
  });
});

// ---------------------------------------------------------------------------
// resolveBuildRoot
// ---------------------------------------------------------------------------

describe("resolveBuildRoot", () => {
  it("returns workspace root package.json dir (workspace-1: config in subdir)", () => {
    const appDir = path.join(tmp, "first-app");
    touch(path.join(appDir, "index.js"));
    touch(path.join(appDir, "fastedge-config.test.json"));
    touch(path.join(tmp, "package.json"));

    const result = resolveBuildRoot(path.join(appDir, "index.js"));
    expect(result).toBe(tmp);
  });

  it("returns the nearest package.json dir (workspace-2/first-app: same level as config)", () => {
    touch(path.join(tmp, "src", "index.js"));
    touch(path.join(tmp, "package.json"));
    touch(path.join(tmp, "fastedge-config.test.json"));

    const result = resolveBuildRoot(path.join(tmp, "src", "index.js"));
    expect(result).toBe(tmp);
  });

  it("returns the correct build root when config is deeper than package.json (workspace-2/second-app)", () => {
    const srcDir = path.join(tmp, "src");
    touch(path.join(srcDir, "index.js"));
    touch(path.join(srcDir, "fastedge-config.test.json"));
    touch(path.join(tmp, "package.json"));

    const result = resolveBuildRoot(path.join(srcDir, "index.js"));
    expect(result).toBe(tmp);
  });

  it("returns the build root for third-app (no config file)", () => {
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
// ensureConfigFile
// ---------------------------------------------------------------------------

describe("ensureConfigFile", () => {
  it("creates fastedge-config.test.json with {} when it does not exist", () => {
    ensureConfigFile(tmp);

    const filePath = path.join(tmp, "fastedge-config.test.json");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe("{}");
  });

  it("does not overwrite an existing fastedge-config.test.json", () => {
    const filePath = path.join(tmp, "fastedge-config.test.json");
    const existing = '{"type":"cdn"}';
    fs.writeFileSync(filePath, existing, "utf8");

    ensureConfigFile(tmp);

    expect(fs.readFileSync(filePath, "utf8")).toBe(existing);
  });

  it("after ensureConfigFile at activeFile dir, resolveConfigRoot finds that dir", () => {
    // Simulates the third-app flow: no config found, so we create one
    // co-located with the active file (not at the build root).
    const srcDir = path.join(tmp, "src");
    touch(path.join(srcDir, "index.js"));
    touch(path.join(tmp, "package.json")); // build root is tmp, not srcDir

    // Caller places config next to the active file
    ensureConfigFile(srcDir);

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
    touch(path.join(appDir, "fastedge-config.test.json"));
    touch(path.join(tmp, "package.json"));

    const activeFile = path.join(appDir, "index.js");
    expect(resolveConfigRoot(activeFile)).toBe(appDir);
    expect(resolveBuildRoot(activeFile)).toBe(tmp);
  });

  it("two apps in same workspace get different configRoots but same buildRoot", () => {
    const firstApp = path.join(tmp, "first-app");
    const secondApp = path.join(tmp, "second-app");
    touch(path.join(firstApp, "index.js"));
    touch(path.join(firstApp, "fastedge-config.test.json"));
    touch(path.join(secondApp, "index.js"));
    touch(path.join(secondApp, "fastedge-config.test.json"));
    touch(path.join(tmp, "package.json"));

    expect(resolveConfigRoot(path.join(firstApp, "index.js"))).toBe(firstApp);
    expect(resolveConfigRoot(path.join(secondApp, "index.js"))).toBe(secondApp);
    expect(resolveBuildRoot(path.join(firstApp, "index.js"))).toBe(tmp);
    expect(resolveBuildRoot(path.join(secondApp, "index.js"))).toBe(tmp);
  });
});
