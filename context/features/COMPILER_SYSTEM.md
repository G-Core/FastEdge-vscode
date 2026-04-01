# Compiler System - FastEdge VSCode Extension

This document describes how the extension compiles Rust, JavaScript, and AssemblyScript code into WASM binaries for FastEdge applications.

---

## Overview

The compiler system is responsible for:
1. Detecting project language (Rust, JavaScript, or AssemblyScript)
2. Locating build configuration files
3. Running language-specific build tools
4. Placing compiled WASM binary at the standard output location

**Files**:
- `src/compiler/index.ts` - Orchestration and language detection
- `src/compiler/rustBuild.ts` - Rust compilation logic
- `src/compiler/rustConfig.ts` - Cargo target resolution
- `src/compiler/jsBuild.ts` - JavaScript compilation logic
- `src/compiler/asBuild.ts` - AssemblyScript compilation logic
- `src/utils/resolveAppRoot.ts` - Shared root resolution utilities

---

## Root Resolution

All three compilers use two root concepts resolved by `src/utils/resolveAppRoot.ts`:

**`resolveBuildRoot(activeFilePath)`** — walks up from the active file to find the nearest directory containing `package.json` or `Cargo.toml`. This is where build commands run (CWD for spawned processes).

**`resolveConfigRoot(activeFilePath)`** — walks up to find the nearest directory containing `.fastedge-debug/`. This is the per-app anchor: the debugger server's `WORKSPACE_PATH`, and where `.fastedge-debug/app.wasm` is written. Falls back to `buildRoot` if not found.

The separation of build root vs config root is what allows multiple apps in the same workspace to have isolated debug ports without interfering with each other.

---

## Language Detection

**Determined by VSCode language ID + project structure**:

- Active file has language ID `rust` → **Rust**
- Active file has language ID `javascript`/`typescript`/`javascriptreact`/`typescriptreact` AND `asconfig.json` exists at `buildRoot` → **AssemblyScript**
- Active file has language ID `javascript`/`typescript`/etc. AND no `asconfig.json` → **JavaScript**

**Key insight**: VSCode reports AssemblyScript files as `typescript`. The `asconfig.json` check at `buildRoot` is what distinguishes an AS project from a JS/TS project — this is consistent with how `rustBuild` uses `Cargo.toml` as the indicator for Rust.

**Detection in `src/compiler/index.ts`**:
```typescript
function getActiveFileLanguage(activeFile: string): ExtLanguage | null {
  const languageId = vscode.window.activeTextEditor?.document.languageId ?? "";
  const jsIds = ["javascript", "typescript", "javascriptreact", "typescriptreact"];

  if (jsIds.includes(languageId)) {
    const buildRoot = resolveBuildRoot(activeFile);
    if (buildRoot && fs.existsSync(path.join(buildRoot, "asconfig.json"))) {
      return "assemblyscript";
    }
    return "javascript";
  } else if (languageId === "rust") {
    return "rust";
  }
  return null;
}
```

---

## Rust Compilation

**SDK**: [FastEdge-sdk-rust](https://github.com/G-Core/FastEdge-sdk-rust)

### Requirements

**User must have**:
```bash
rustup target add wasm32-wasip1
```

### Build Process

**File**: `src/compiler/rustBuild.ts`

**Steps**:
1. Resolve `buildRoot` (directory containing `Cargo.toml`)
2. Resolve `configRoot` (falls back to `buildRoot`)
3. Read WASI target from `.cargo/config.toml` via `rustConfigWasiTarget()` — falls back to `wasm32-wasip1`
4. Spawn `cargo build --message-format=json --target=<wasiTarget>` at `buildRoot`
5. Parse JSON output line-by-line; find the `compiler-artifact` entry with a `.wasm` filename
6. Copy WASM to `<configRoot>/.fastedge-debug/app.wasm`

**Note**: `cargo build` stderr (human-readable progress) is piped to the build console. The `--message-format=json` stdout is consumed internally for artifact path extraction.

### Build Configuration

**Cargo.toml** must be configured for WASM:
```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
fastedge = "0.3"
```

### Common Errors

**"target 'wasm32-wasip1' may not be installed"**:
- Solution: `rustup target add wasm32-wasip1`

**"cargo build succeeded but no .wasm artifact found"**:
- Ensure `crate-type = ["cdylib"]` is set in Cargo.toml

---

## JavaScript Compilation

**SDK**: [FastEdge-sdk-js](https://github.com/G-Core/FastEdge-sdk-js)

### Requirements

```bash
npm install --save-dev @gcoredev/fastedge-sdk-js
```

### Build Process

**File**: `src/compiler/jsBuild.ts`

**Steps**:
1. Resolve `buildRoot` (directory containing `package.json`)
2. Resolve `configRoot` (falls back to `buildRoot`)
3. Create `<configRoot>/.fastedge-debug/` directory
4. Determine entry point:
   - **File mode**: active file path
   - **Workspace mode**: `package.json` `main` field resolved relative to `buildRoot`
5. Spawn `npx fastedge-build <entryPoint> <configRoot>/.fastedge-debug/app.wasm` at `buildRoot`

### Entrypoint Modes

**File mode**: active editor file is the entry point — useful for quick iteration.

**Workspace mode**: uses `package.json` `main` field — standard project build.

### Common Errors

**"fastedge-build not found"**: `npm install --save-dev @gcoredev/fastedge-sdk-js`

**"Main entrypoint not found"** (workspace mode): add `"main"` field to `package.json`

---

## AssemblyScript Compilation

**SDK**: [proxy-wasm-sdk-as](https://github.com/G-Core/proxy-wasm-sdk-as)

Used for **CDN/Proxy-WASM applications** (HTTP request/response manipulation via the proxy-wasm model). This is a different app model from the FastEdge HTTP SDK — AS apps extend `RootContext`/`Context` and register via `registerRootContext()`.

### Requirements

```bash
npm install --save-dev assemblyscript @assemblyscript/wasi-shim
```

The `asc` compiler is provided by the `assemblyscript` package — no global install needed; `npx asc` resolves it from `node_modules`.

### Project Structure

An AssemblyScript app must have:
```
my-app/
├── package.json
├── asconfig.json        ← required — triggers AS detection
└── assembly/
    └── index.ts         ← entry point (always this path)
```

**`asconfig.json`** must define a `release` target with optimization settings:
```json
{
  "extends": "./node_modules/@assemblyscript/wasi-shim/asconfig.json",
  "targets": {
    "release": {
      "outFile": "build/app.wasm",
      "optimizeLevel": 3,
      "shrinkLevel": 0,
      "noAssert": false
    }
  },
  "options": {
    "use": "abort=abort_proc_exit"
  }
}
```

**Note**: The `outFile` in `asconfig.json` is overridden by the extension — output always goes to `.fastedge-debug/app.wasm`.

### Build Process

**File**: `src/compiler/asBuild.ts`

**Steps**:
1. Resolve `buildRoot` (directory containing `package.json`)
2. Verify `asconfig.json` exists at `buildRoot` — throws if missing
3. Resolve `configRoot` (falls back to `buildRoot`)
4. Create `<configRoot>/.fastedge-debug/` directory
5. Spawn: `npx asc assembly/index.ts --target release --outFile <configRoot>/.fastedge-debug/app.wasm` at `buildRoot`

The `--target release` flag picks up optimization settings from `asconfig.json` (shrink level, no-assert, etc.). `--outFile` overrides only the output path to the standard debugger location.

**No entrypoint modes**: AS apps always use `assembly/index.ts` — the convention is universal across all proxy-wasm-sdk-as projects.

### Common Errors

**"asconfig.json not found"**: project is missing `asconfig.json` — either not an AS project, or the file hasn't been created yet

**"asc: command not found"** (via npx): `npm install --save-dev assemblyscript`

**"abort is not defined"**: `asconfig.json` is missing `"use": "abort=abort_proc_exit"` in `options`

---

## Compilation Orchestration

**File**: `src/compiler/index.ts`

**Main export**: `compileActiveEditorsBinary(debugContext, logDebugConsole): Promise<BinaryInfo>`

Returns `BinaryInfo: { path: string; lang: ExtLanguage }` where `ExtLanguage = "javascript" | "rust" | "assemblyscript"`.

**Flow**:
1. Get active editor file path
2. Call `getActiveFileLanguage(activeFile)` — detects language via VSCode language ID + `asconfig.json` check
3. Dispatch to `compileJavascriptBinary`, `compileRustAndFindBinary`, or `compileAssemblyScriptBinary`
4. Return `BinaryInfo` with WASM path and language

**Called from**: `src/commands/runDebugger.ts` → `buildAndDebug()`

---

## Standard Output Location

All three compilers write to the same path:
```
<configRoot>/.fastedge-debug/app.wasm
```

`configRoot` is the directory containing `.fastedge-debug/` (or `buildRoot` if none exists). This path is what the debugger server receives via `POST /api/load` and serves via `/api/workspace-wasm`.

`.fastedge-debug/` can be safely gitignored.

---

## Build Optimization Notes

| Language | Build mode | Incremental |
|---|---|---|
| Rust | `cargo build` (debug) | Yes — Cargo caches in `target/` |
| JavaScript | `npx fastedge-build` | No — rebuilds from scratch |
| AssemblyScript | `npx asc --target release` | No — rebuilds from scratch |

AssemblyScript always builds in release mode because the AS `--target release` settings in `asconfig.json` are what produce a valid proxy-wasm binary. Debug builds may produce larger output but are otherwise equivalent for local testing.

---

## Key Takeaways

1. **Three languages** — Rust, JavaScript, AssemblyScript; each has a dedicated build file
2. **AS ≠ JS** — AssemblyScript detected by `asconfig.json` at `buildRoot`, not language ID (VSCode reports AS as `typescript`)
3. **Two root concepts** — `buildRoot` (where build runs) and `configRoot` (where output goes), allowing multi-app workspaces
4. **Fixed AS entry point** — always `assembly/index.ts`; no file vs workspace mode
5. **Uniform output** — all three compilers write to `<configRoot>/.fastedge-debug/app.wasm`

---

**Related Documentation**:
- `PROJECT_OVERVIEW.md` - Supported languages overview
- `DEBUGGER_ARCHITECTURE.md` - How compiled binary is used
- `development/IMPLEMENTATION_GUIDE.md` - Adding language support

---

**Last Updated**: March 2026
