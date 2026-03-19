# Cross-Platform Support

## Target Platforms

The extension ships as three platform-specific VSIX packages — one binary bundled per package:

| Platform | VS Code target | fastedge-run binary |
|----------|---------------|---------------------|
| Linux x64 | `linux-x64` | `fastedge-run-linux-x64` |
| macOS ARM64 | `darwin-arm64` | `fastedge-run-darwin-arm64` |
| Windows x64 | `win32-x64` | `fastedge-run.exe` |

Platform detection in TypeScript: use `os.platform()` or `process.platform`. Both return `"linux"` / `"darwin"` / `"win32"`.

**Dev workflow** (`pnpm run bundle:debugger`, `bundle-debugger-for-vscode.sh`) is **Linux/macOS only**. Windows developer support is not a current requirement.

---

## Platform-Specific Code

### Rust compilation — `src/compiler/rustBuild.ts`

Shell is selected based on platform before spawning cargo:

```typescript
const isWindows = os.platform() === "win32";
const shell = isWindows ? "cmd.exe" : "sh";
spawn("cargo", [...], { shell, ... });
```

### JS / AssemblyScript compilation — `src/compiler/jsBuild.ts`, `asBuild.ts`

Both use `shell: true`, which delegates to the system default shell on every platform (cmd.exe on Windows, sh on Unix). No explicit branching needed.

### MCP Docker command generation — `src/commands/mcpJson.ts`

`getPlatformDockerCommand()` branches on `os.platform()`:

- **win32**: `cmd /c docker run ...` with `%VAR%` env var syntax. `--user` flag omitted (not supported on Docker Desktop for Windows).
- **linux / darwin**: `bash -c "docker run ..."` with `$VAR` env var syntax. `--user` flag included.

If you add new shell-invoked commands to mcp.json generation, follow the same branching pattern.

---

## Rules for New Code

### File paths — always use `path` module or `vscode.Uri`

```typescript
// ✅ correct — extension-side file ops
import path from "path";
path.join(configRoot, ".fastedge", "bin", "debugger.wasm");

// ✅ correct — VS Code API file ops
vscode.Uri.joinPath(workspaceFolder.uri, ".vscode", "mcp.json");

// ❌ wrong — breaks on Windows
configRoot + "/" + ".fastedge/bin/debugger.wasm";
```

### Temp files — always use `os.tmpdir()`

```typescript
// ✅ correct
import { tmpdir } from "os";
path.join(tmpdir(), "temp-file");

// ❌ wrong
const tmp = "/tmp/temp-file";
```

### Process spawning — pick the right shell strategy

| Use case | Pattern |
|----------|---------|
| `cargo`, `npx`, `asc` — cross-platform CLI tools | `shell: true` or explicit `cmd.exe` / `sh` |
| Shell syntax (`&&`, `|`, `&`) in the command string | **Dev scripts only** — not in production code |
| Generating shell commands for config files | Branch on `os.platform()` — see `mcpJson.ts` |

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
| Rust spawn shell (cmd vs sh) | `src/compiler/rustBuild.ts:16` | ✅ |
| JS/AS spawn | `src/compiler/jsBuild.ts`, `asBuild.ts` — `shell: true` | ✅ |
| MCP Docker command | `src/commands/mcpJson.ts:getPlatformDockerCommand()` | ✅ |
| File path handling | Throughout — `path.join()` and `vscode.Uri.joinPath()` | ✅ |
| Server fork | `src/debugger/DebuggerServerManager.ts` — `process.execPath` | ✅ |
| Port scanning | `DebuggerServerManager.resolvePort()` — HTTP fetch, platform-agnostic | ✅ |

---

## CI / Build Pipeline

All three VSIX packages are built on `ubuntu-latest` — `vsce package --target <os_target>` handles cross-compilation for darwin and win32. The binary is not compiled during packaging; it's downloaded as a pre-built artifact from the fastedge-test release.

Pipeline flow (see `.github/workflows/`):
1. `create-release.yml` — triggered on `v*` tag; calls workflows 2 and 3
2. `download-debugger.yml` — downloads fastedge-debugger zip; matrix job filters to one binary per platform, uploads three artifacts
3. `build-extension.yml` — called once per platform; downloads its artifact, builds and packages the VSIX, uploads to GitHub Release

---

## Known Limitations

- **`bundle-debugger-for-vscode.sh`**: Unix shell script — Windows developers cannot use the local bundling workflow. Run on Linux/macOS, or use the CI artifacts.
- **CI build host**: All extension packaging runs on `ubuntu-latest` regardless of target platform. This is intentional (`vsce` handles cross-packaging), but means the CI never validates native build-tool behavior on macOS or Windows.
- **Windows Docker Desktop**: `--user` flag is omitted from the generated MCP Docker command. If Docker Desktop for Windows adds support, update `mcpJson.ts:getPlatformDockerCommand()`.

---

**Last Updated**: March 2026
