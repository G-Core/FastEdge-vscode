import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Must be hoisted above the compiler imports so they pick up the mock.
const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ spawn: spawnMock }));

import { compileJavascriptBinary } from "./jsBuild";
import { compileAssemblyScriptBinary } from "./asBuild";
import { compileRustAndFindBinary } from "./rustBuild";

// ---------------------------------------------------------------------------
// The payload from the vulnerability report. With shell: true this executed;
// every assertion below exists to prove it now arrives as inert argv data.
// ---------------------------------------------------------------------------
const PAYLOAD = "index.js; touch /tmp/VSCODE_PWNED #";

const noop = () => {};

/**
 * Stand in for a build tool that succeeds: write the .wasm it was asked for,
 * then exit 0. The compilers reject a zero exit that produced no binary, so a
 * mock that only exits 0 is not a faithful success.
 */
function fakeSuccessfulBuild(args: string[]) {
  const outFile = (args ?? []).find((a) => typeof a === "string" && a.endsWith(".wasm"));
  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  }
  return fakeChild();
}

function fakeChild(exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => child.emit("close", exitCode));
  return child;
}

/** Minimal project with a locally installed build tool. */
function mkProject(pkg: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fastedge-spawn-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg));
  return root;
}

function installTool(root: string, name: string, binName: string): string {
  const pkgDir = path.join(root, "node_modules", ...name.split("/"));
  fs.mkdirSync(path.join(pkgDir, "bin"), { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name, version: "1.0.0", bin: { [binName]: `./bin/${binName}.js` } }),
  );
  const binPath = path.join(pkgDir, "bin", `${binName}.js`);
  fs.writeFileSync(binPath, "");
  return binPath;
}

let tmpRoots: string[] = [];
afterEach(() => {
  tmpRoots.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  tmpRoots = [];
});
beforeEach(() => spawnMock.mockReset());

describe("compiler spawns are not shell-parsed", () => {
  it("javascript: package.json main payload stays one literal argv element", async () => {
    const root = mkProject({ name: "pwn", main: PAYLOAD });
    tmpRoots.push(root);
    const binPath = installTool(root, "@gcoredev/fastedge-sdk-js", "fastedge-build");
    spawnMock.mockImplementation((...call: unknown[]) =>
      fakeSuccessfulBuild(call[1] as string[]),
    );

    await compileJavascriptBinary(path.join(root, "index.js"), "workspace", noop);

    const [command, args, options] = spawnMock.mock.calls[0];
    // Not npx, and not npx.cmd — patched Node rejects .cmd without a shell.
    expect(command).toBe(process.execPath);
    expect(args[0]).toBe(binPath);
    expect(options.shell).toBeFalsy();
    // The payload is one argument, still carrying its metacharacters, unexecuted.
    expect(args[1]).toBe(path.join(root, PAYLOAD));
    expect(args.filter((a: string) => a.includes("touch"))).toHaveLength(1);
  });

  it("assemblyscript: metacharacters in the output path stay one literal argv element", async () => {
    const root = mkProject({ name: "as-app" });
    tmpRoots.push(root);
    // A directory name a hostile repo can commit.
    const appDir = path.join(root, 'app"; touch /tmp/PWNED; #');
    fs.mkdirSync(path.join(appDir, ".fastedge-debug"), { recursive: true });
    fs.writeFileSync(path.join(appDir, "package.json"), "{}");
    fs.writeFileSync(path.join(appDir, "asconfig.json"), "{}");
    const binPath = installTool(root, "assemblyscript", "asc");
    // The tool resolves from the nested build root, so install it there too.
    fs.cpSync(path.join(root, "node_modules"), path.join(appDir, "node_modules"), {
      recursive: true,
    });
    spawnMock.mockImplementation((...call: unknown[]) =>
      fakeSuccessfulBuild(call[1] as string[]),
    );

    await compileAssemblyScriptBinary(path.join(appDir, "index.ts"), noop);

    const [command, args, options] = spawnMock.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(path.basename(args[0])).toBe(path.basename(binPath));
    expect(options.shell).toBeFalsy();
    const outFile = args[args.indexOf("--outFile") + 1];
    expect(outFile).toContain('"; touch');
    expect(outFile).toBe(path.join(appDir, ".fastedge-debug", "app.wasm"));
  });

  it("rust: a .cargo/config.toml target stays one literal argv element", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fastedge-spawn-"));
    tmpRoots.push(root);
    fs.writeFileSync(path.join(root, "Cargo.toml"), "[package]\nname='x'\n");
    fs.mkdirSync(path.join(root, ".cargo"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".cargo", "config.toml"),
      '[build]\ntarget = "wasm32-wasip1; touch /tmp/PWNED"\n',
    );
    spawnMock.mockImplementation(() => fakeChild(1));

    await expect(
      compileRustAndFindBinary(path.join(root, "src", "lib.rs"), noop),
    ).rejects.toThrow();

    const [command, args, options] = spawnMock.mock.calls[0];
    expect(command).toBe("cargo");
    expect(options.shell).toBeFalsy();
    expect(args).toContain("--target=wasm32-wasip1; touch /tmp/PWNED");
  });
});

describe("package.json main containment", () => {
  it("rejects a main field that escapes the build root", async () => {
    const root = mkProject({ name: "pwn", main: "../../../../etc/passwd" });
    tmpRoots.push(root);
    installTool(root, "@gcoredev/fastedge-sdk-js", "fastedge-build");

    await expect(
      compileJavascriptBinary(path.join(root, "index.js"), "workspace", noop),
    ).rejects.toThrow(/resolves outside the project/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects when the build exits 0 but produces no binary", async () => {
    // fastedge-build does exactly this when NODE_ENV=test: prints
    // "Build success!!", exits 0, writes nothing. Resolving here would send the
    // debugger off to load a stale binary instead of surfacing the failure.
    const root = mkProject({ name: "app", main: "index.js" });
    tmpRoots.push(root);
    installTool(root, "@gcoredev/fastedge-sdk-js", "fastedge-build");
    spawnMock.mockImplementation(() => fakeChild(0));

    await expect(
      compileJavascriptBinary(path.join(root, "index.js"), "workspace", noop),
    ).rejects.toThrow(/reported success but produced no binary/);
  });

  it("fails with an actionable message when the build tool is not installed", async () => {
    const root = mkProject({ name: "app", main: "index.js" });
    tmpRoots.push(root);

    await expect(
      compileJavascriptBinary(path.join(root, "index.js"), "workspace", noop),
    ).rejects.toThrow(/Add "@gcoredev\/fastedge-sdk-js" as a development dependency/);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
