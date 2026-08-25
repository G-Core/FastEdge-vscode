# Cross-Platform Support

## Target Platforms

The extension ships as three platform-specific VSIX packages — one binary bundled per package:

| Platform | VS Code target | fastedge-run binary |
|----------|---------------|---------------------|
| Linux x64 | `linux-x64` | `fastedge-run-linux-x64` |
| macOS ARM64 | `darwin-arm64` | `fastedge-run-darwin-arm64` |
| Windows x64 | `win32-x64` | `fastedge-run.exe` |

Platform detection in TypeScript: use `os.platform()` or `process.platform`. Both return `"linux"` / `"darwin"` / `"win32"`.

**Dev workflow**: the debugger is no longer built locally. Download a pre-built `fastedge-debugger.zip` from a fastedge-test release and unzip it into `dist/debugger/`, then run `pnpm run build` to build the extension. Windows developer support is not a current requirement.

---

## Platform-Specific Code

**No child process in this extension is spawned through a shell.** Shell invocation made workspace-controlled values (`package.json` `main`, `.cargo/config.toml` target, directory names) executable — see the CWE-78 entry in `CHANGELOG.md`. Every spawn uses an argv array.

### Rust compilation — `src/compiler/rustBuild.ts`

`spawn("cargo", [...])` with no `shell` option and no platform branching. `cargo` is a native executable, so Windows resolves `cargo.exe` from PATH without a command interpreter.

### JS / AssemblyScript compilation — `src/compiler/jsBuild.ts`, `asBuild.ts`

Neither uses `npx`. `utils/resolveBin.ts` resolves the tool's real JS entry point from the project (`createRequire` from `buildRoot` → the package's `bin` field), and it is launched as `spawn(process.execPath, [binPath, ...args])`.

Do **not** "fix" Windows by spawning `npx.cmd`: patched Node rejects `.bat`/`.cmd` without a shell with `EINVAL` (CVE-2024-27980), and unpatched Node routes it through `cmd.exe` and re-opens argument injection.

Consequences worth knowing:

- The build tool must be a local devDependency. Nothing is downloaded — a missing tool is a clear error, not a silent registry fetch.
- Yarn Plug'n'Play projects are unsupported: their dependency map lives in `.pnp.cjs`, which Node ignores unless preloaded.
- A launch failure now arrives as the child's `"error"` event, not exit code 127. All three compilers attach an `error` handler; a new spawn without one will hang forever.

### MCP Docker command generation — `src/commands/mcpJson.ts`

`getDockerCommand()` does **not** branch on platform. `docker` is invoked directly with an argv array on every platform — no `cmd /c` or `bash -c` wrapper, so the workspace path is never spliced into a shell string.

Environment variables are forwarded with bare `-e GCORE_API_KEY` / `-e GCORE_API_BASE`: docker reads them from its own environment, which the MCP client supplies via the config's `env` block. No `%VAR%` / `$VAR` expansion, so no shell is needed.

If you add new commands to mcp.json generation, keep them platform-independent argv arrays — no shell, no branching.

---

## Rules for New Code

### File paths — always use `path` module or `vscode.Uri`

```typescript
// ✅ correct — extension-side file ops
import path from "path";
path.join(configRoot, ".fastedge-debug", "app.wasm");

// ✅ correct — VS Code API file ops
vscode.Uri.joinPath(workspaceFolder.uri, ".vscode", "mcp.json");

// ❌ wrong — breaks on Windows
configRoot + "/" + ".fastedge-debug/app.wasm";
```

### Temp files — always use `os.tmpdir()`

```typescript
// ✅ correct
import { tmpdir } from "os";
path.join(tmpdir(), "temp-file");

// ❌ wrong
const tmp = "/tmp/temp-file";
```

### Process spawning — never use a shell

| Use case | Pattern |
|----------|---------|
| Native executable (`cargo`, `docker`) | `spawn(name, argvArray)` — no `shell`; Windows resolves the `.exe` from PATH |
| Node CLI tool from the user's project (`fastedge-build`, `asc`) | `resolvePackageBin()` → `spawn(process.execPath, [binPath, ...args])` |
| A `.cmd` / `.bat` shim, including `npx.cmd` | **Never.** Resolve the underlying JS entry point instead — see `utils/resolveBin.ts` |
| Shell syntax (`&&`, `|`, `&`) in the command string | **Dev scripts only** — not in production code |
| Generating commands for config files | Emit an argv array, not a command string — see `mcpJson.ts` |

Anything reaching a child process argument may be workspace-controlled and attacker-authored. Keep it in argv, where metacharacters are inert.

### Process signals — SIGTERM is unreliable on Windows

Node.js translates `SIGINT` to a platform-appropriate signal. `SIGTERM` is not reliably sent on Windows. If you add new child process management:

```typescript
child.kill("SIGINT"); // use this — works on all platforms
// Force-kill fallback (if needed):
if (process.platform === "win32") {
  execSync(`taskkill /F /T /PID ${child.pid}`);
} else {
  child.kill("SIGKILL");
}
```

The debugger server is forked with `process.execPath` (VSCode's embedded Node.js) and stopped via `DebuggerServerManager.stop()` — this already handles cleanup correctly on all platforms.

---

## What Is Already Handled

| Concern | Location | Status |
|---------|----------|--------|
| VSIX platform targeting | `.github/workflows/build-extension.yml` — `vsce package --target $os_target` | ✅ |
| One binary per VSIX | `.github/workflows/download-debugger.yml` — matrix strips other binaries | ✅ |
| `chmod +x` on Unix, skip on Windows | download-debugger.yml matrix step | ✅ |
| Rust spawn | `src/compiler/rustBuild.ts` — bare `cargo`, argv array, no shell | ✅ |
| JS/AS spawn | `src/compiler/jsBuild.ts`, `asBuild.ts` — `process.execPath` + resolved bin, no shell | ✅ |
| MCP Docker command | `src/commands/mcpJson.ts:getDockerCommand()` — argv array, platform-independent | ✅ |
| File path handling | Throughout — `path.join()` and `vscode.Uri.joinPath()` | ✅ |
| Server fork | `src/debugger/DebuggerServerManager.ts` — `process.execPath` | ✅ |
| Port discovery | `DebuggerServerManager.waitForPortFile()` — reads port file written by fastedge-test, platform-agnostic | ✅ |

---

## CI / Build Pipeline

All three VSIX packages are built on `ubuntu-latest` — `vsce package --target <os_target>` handles cross-compilation for darwin and win32. The binary is not compiled during packaging; it's downloaded as a pre-built artifact from the fastedge-test release.

Pipeline flow (see `.github/workflows/`):
1. `create-release.yml` — triggered on `v*` tag; calls workflows 2 and 3
2. `download-debugger.yml` — downloads fastedge-debugger zip; matrix job filters to one binary per platform, uploads three artifacts
3. `build-extension.yml` — called once per platform; downloads its artifact, builds and packages the VSIX, uploads to GitHub Release

---

## Known Limitations

- **Local debugger bundling removed**: `bundle:debugger` / `bundle-debugger-for-vscode.sh` no longer exist. The debugger is sourced from pre-built fastedge-test releases in CI, or downloaded manually for local testing.
- **CI build host**: All extension packaging runs on `ubuntu-latest` regardless of target platform. This is intentional (`vsce` handles cross-packaging), but means the CI never validates native build-tool behavior on macOS or Windows.
- **Windows Docker Desktop**: `--user` flag is omitted from the generated MCP Docker command. If Docker Desktop for Windows adds support, update `mcpJson.ts:getPlatformDockerCommand()`.

---

**Last Updated**: April 2026
