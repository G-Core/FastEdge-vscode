# Configuration System — FastEdge VSCode Extension

This document describes the current (post-Feb 2026) configuration architecture.

> **Historical note**: The old DAP-era three-tier hierarchy (launch.json → dotenv → defaults, `FastEdgeDebugSession`, `BinaryDebugConfigurationProvider`) is documented in `context/archived/ARCHIVED_CONFIGURATION_SYSTEM.md`.

---

## Overview

Runtime configuration is split into two independent concerns:

1. **App test config** (`fastedge-config.test.json`) — env vars, secrets, headers, port, memory limits. Managed entirely in the debugger UI.
2. **Dotenv files** (`.env`, `.env.variables`, `.env.secrets`, `.env.req_headers`, `.env.rsp_headers`) — auto-discovered by the server from the app root. See `features/DOTENV_SYSTEM.md`.

The extension itself reads only one launch config field: **`"entrypoint"`** (`"file"` or `"package"`), used by the F5 debug config provider to choose between `runFile()` and `runWorkspace()`.

---

## fastedge-config.test.json

**Role**: Primary config file for a FastEdge app. Serves a dual purpose:
1. **App root marker** — `resolveConfigRoot()` walks up from the active file to find it; the directory containing it becomes the `configRoot` for per-app isolation
2. **Runtime config store** — env vars, secrets, headers, port, memory limits

**Location**: Any directory in the project, co-located with the app entry file. Auto-created (as `{}`) at the active file's directory when no config file is found on first debug.

**Loaded/saved via**: Native VSCode file dialogs (`vscode.window.showOpenDialog` / `vscode.window.showSaveDialog`), not browser file APIs. The extension bridges iframe postMessages to the extension host to work around the sandboxed webview context.

**If not found**: `ensureConfigFile(dir)` creates `{}` at `path.dirname(activeFilePath)`.

---

## App Root Resolution

Two separate utilities in `src/utils/resolveAppRoot.ts`:

| Function | Walks up for | Used by |
|----------|-------------|---------|
| `resolveConfigRoot(startPath)` | `fastedge-config.test.json` | Port anchor, panel isolation, WASM output dir |
| `resolveBuildRoot(startPath)` | `package.json` or `Cargo.toml` | Build CWD, entrypoint resolution |

These are deliberately separate — in a monorepo the `package.json` may be several levels above the app's own `fastedge-config.test.json`.

**`.debug-port` sidecar**: Written by the server at `{configRoot}/.debug-port` (direct sibling of `fastedge-config.test.json`) after `httpServer.listen()`. The extension reads it at startup to find the per-app server port.

---

## Dotenv Files

Auto-discovered by the server from `configRoot`. See `features/DOTENV_SYSTEM.md` for full file format and parsing.

Discovery walks up from `configRoot`, loading the first directory that contains any dotenv file. Supports `.env` (with `FASTEDGE_VAR_` prefixes) and specialized files (`.env.variables`, `.env.secrets`, `.env.req_headers`, `.env.rsp_headers`).

---

## F5 / launch.json

The only part of `launch.json` the extension reads is the **`"entrypoint"` field**:

```json
{
  "type": "fastedge",
  "request": "launch",
  "name": "FastEdge App",
  "entrypoint": "file"
}
```

| Value | Behaviour |
|-------|-----------|
| `"file"` | Builds the active editor file |
| `"package"` | Builds from `package.json` `"main"` field (JS only) |
| `"workspace"` | Backward-compat alias for `"package"` |

All other launch.json properties (`port`, `env`, `secrets`, `headers`, etc.) are **ignored** — they were DAP-era and removed in [2026-03-17]. Configure those in the debugger UI via `fastedge-config.test.json`.

---

## Extension Settings

| Setting | Type | Description |
|---------|------|-------------|
| `fastedge.cliVersion` | string (read-only) | Bundled FastEdge-run version, shown in Settings UI |
| `fastedge.apiUrl` | string | Default API URL used by `Generate mcp.json` command |

Neither setting affects debug execution.

---

**Related Documentation**:
- `features/DOTENV_SYSTEM.md` — dotenv file format and discovery
- `BUNDLED_DEBUGGER.md` — how fastedge-config.test.json is loaded in the debugger UI
- `features/COMMANDS.md` — F5 entrypoint routing
- `archived/ARCHIVED_CONFIGURATION_SYSTEM.md` — DAP-era three-tier hierarchy (historical)

---

**Last Updated**: March 2026
