import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { compileJavascriptBinary } from "../../src/compiler/jsBuild";
import { compileAssemblyScriptBinary } from "../../src/compiler/asBuild";
import { compileRustAndFindBinary } from "../../src/compiler/rustBuild";

// ---------------------------------------------------------------------------
// These tests actually launch the build tools. The unit tests in
// src/compiler/compilerSpawn.test.ts mock spawn: they prove the arguments are
// safe, but prove nothing about whether the process starts. That gap matters
// most on Windows, where the build tools are launched as
// `process.execPath <bin>.js` precisely because .cmd shims cannot be spawned
// without a shell.
//
// One fixture per toolchain invocation the extension supports. Run on every OS
// in the CI matrix. They must never skip silently: a missing fixture
// dependency is a failure, not a pass.
// ---------------------------------------------------------------------------

// vitest runs from the repo root. `import.meta.url` would not typecheck under
// this repo's commonjs tsconfig.
const FIXTURES = path.resolve(process.cwd(), "test", "fixtures");

const BUILD_TIMEOUT_MS = 600_000;
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];
const noop = () => {};

// `fastedge-build` silently produces no output — while printing "Build
// success!!" and exiting 0 — when NODE_ENV=test, which is exactly what vitest
// sets. The child inherits our environment, so neutralise it here. This is an
// SDK bug, not a test artifact: any user with NODE_ENV=test in their shell hits
// it. Reported separately.
const originalNodeEnv = process.env.NODE_ENV;
beforeAll(() => {
  process.env.NODE_ENV = "production";
});
afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

/** Fixtures build in place; keep the tree clean between runs. */
function reset(appDir: string, ...alsoRemove: string[]) {
  for (const target of [".fastedge-debug", ...alsoRemove]) {
    fs.rmSync(path.join(appDir, target), { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(appDir, ".fastedge-debug"), { recursive: true });
}

function requireInstalled(appDir: string, packageName: string) {
  const installed = path.join(appDir, "node_modules", ...packageName.split("/"));
  if (!fs.existsSync(installed)) {
    throw new Error(
      `Fixture dependencies missing: ${installed}. Run "npm run fixtures:install" ` +
        `(CI does this in the "Install fixture dependencies" step).`,
    );
  }
}

function expectWasm(wasmPath: string) {
  expect(fs.existsSync(wasmPath)).toBe(true);
  expect(fs.statSync(wasmPath).size).toBeGreaterThan(0);
  // \0asm magic number — a real module, not an empty file left by a tool that
  // reported success without producing anything.
  expect([...fs.readFileSync(wasmPath).subarray(0, 4)]).toEqual(WASM_MAGIC);
}

describe("javascript HTTP app (real process)", () => {
  const appDir = path.join(FIXTURES, "js-app");

  beforeAll(() => {
    requireInstalled(appDir, "@gcoredev/fastedge-sdk-js");
    reset(appDir);
  });
  afterAll(() => reset(appDir));

  it(
    "compiles a wasm binary from the package.json entry point",
    async () => {
      const wasmPath = await compileJavascriptBinary(
        path.join(appDir, "index.js"),
        "workspace",
        noop,
      );
      expectWasm(wasmPath);
    },
    BUILD_TIMEOUT_MS,
  );
});

describe("assemblyscript CDN app (real process)", () => {
  const appDir = path.join(FIXTURES, "as-app");

  beforeAll(() => {
    requireInstalled(appDir, "assemblyscript");
    requireInstalled(appDir, "@gcoredev/proxy-wasm-sdk-as");
    reset(appDir, "build");
  });
  afterAll(() => reset(appDir, "build"));

  it(
    "compiles a proxy-wasm binary with the asc compiler",
    async () => {
      const wasmPath = await compileAssemblyScriptBinary(
        path.join(appDir, "assembly", "index.ts"),
        noop,
      );
      expectWasm(wasmPath);
    },
    BUILD_TIMEOUT_MS,
  );
});

describe("rust HTTP app — wasip1, explicit .cargo/config.toml", () => {
  const appDir = path.join(FIXTURES, "rust-app");

  beforeAll(() => {
    // Fail loudly rather than skip: a silently absent toolchain would make this
    // job green while testing nothing.
    execFileSync("cargo", ["--version"], { stdio: "ignore" });
    reset(appDir, "target");
  });
  afterAll(() => reset(appDir, "target"));

  it(
    "spawns cargo without a shell and finds the wasm artifact",
    async () => {
      const wasmPath = await compileRustAndFindBinary(
        path.join(appDir, "src", "lib.rs"),
        noop,
      );
      expectWasm(wasmPath);
      expect(fs.existsSync(path.join(appDir, "target", "wasm32-wasip1"))).toBe(true);
    },
    BUILD_TIMEOUT_MS,
  );
});

describe("rust CDN proxy-wasm app — wasip1", () => {
  const appDir = path.join(FIXTURES, "rust-app-cdn");

  beforeAll(() => {
    execFileSync("cargo", ["--version"], { stdio: "ignore" });
    reset(appDir, "target");
  });
  afterAll(() => reset(appDir, "target"));

  it(
    "selects the single wasm artifact from a proxy-wasm crate",
    async () => {
      // rustBuild only accepts a compiler-artifact message with exactly one
      // filename; a different crate shape is what would break that.
      const wasmPath = await compileRustAndFindBinary(
        path.join(appDir, "src", "lib.rs"),
        noop,
      );
      expectWasm(wasmPath);
    },
    BUILD_TIMEOUT_MS,
  );
});

describe("rust HTTP app — wasip2, inferred from the wstd dependency", () => {
  const appDir = path.join(FIXTURES, "rust-app-wasi-http");

  beforeAll(() => {
    execFileSync("cargo", ["--version"], { stdio: "ignore" });
    reset(appDir, "target");
  });
  afterAll(() => reset(appDir, "target"));

  it(
    "builds against the inferred wasm32-wasip2 target",
    async () => {
      const wasmPath = await compileRustAndFindBinary(
        path.join(appDir, "src", "lib.rs"),
        noop,
      );
      expectWasm(wasmPath);
      // Proves the inferred target reached cargo, not just that something built.
      expect(fs.existsSync(path.join(appDir, "target", "wasm32-wasip2"))).toBe(true);
    },
    BUILD_TIMEOUT_MS,
  );
});
