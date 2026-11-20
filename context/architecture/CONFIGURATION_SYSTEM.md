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

**Role**: Primary config file for a FastEdge app. Serves as the **runtime config store** — env vars, secrets, headers, port, memory limits.

**Note**: The per-app isolation marker is the `.fastedge-debug/` directory, not this file. See App Root Resolution below for how the debugger root (`configRoot`) is found.

**Location**: Any directory in the project, typically inside `.fastedge-debug/`. The config file is **not** auto-created; only the `.fastedge-debug/` directory is created automatically on first debug. Users create the config via the debugger UI's save dialog.

**Loaded/saved via**: Native VSCode file dialogs (`vscode.window.showOpenDialog` / `vscode.window.showSaveDialog`), not browser file APIs. The extension bridges iframe postMessages to the extension host to work around the sandboxed webview context.

**If not found**: `ensureDebugDir(dir)` creates `.fastedge-debug/` at `path.dirname(activeFilePath)`.

---

## App Root Resolution

Two roots, from `src/utils/resolveAppRoot.ts`:

| Root | Found by | Used by |
|------|----------|---------|
| Debugger root (`configRoot`) | `debuggerRootFor(file)` (`src/utils/debuggerRoot.ts`) → `resolveDebuggerRoot(file, workspaceFolder)`: the nearest `.fastedge-debug/` folder, else the nearest `package.json` / `Cargo.toml` folder, searching **no higher than the VS Code workspace folder** holding the file, else that workspace folder | The server's app root (`FASTEDGE_APP_ROOT`), port anchor, panel isolation, WASM output dir |
| Build root | `resolveBuildRoot(file)`: the nearest `package.json` / `Cargo.toml`, with no limit | Build CWD, entrypoint resolution |

The server gets both: `WORKSPACE_PATH` = the VS Code workspace folder holding the debugger root (the limit on every path it reads, and where resource files live, so a resource can use apps from sibling folders), and `FASTEDGE_APP_ROOT` = the debugger root (`DebuggerServerManager`, set from `extension.ts`). A debugger root outside every workspace folder is both.

The debugger never reaches above the folder the user opened: opening `app/proto/` with no marker inside it gives `app/proto/` as the root, even when `app/` has `.fastedge-debug/`. A file whose path differs from the folder's spelling (its real path while the folder was opened through a symlink, or other letter case on macOS) belongs to that folder: matched by real path (the deepest folder, as VS Code does) and searched in the folder's spelling. A root that leaves the folder through a symlink is replaced by the folder, as the server does (it ignores such an app root and writes its port file in the workspace root). A file outside every workspace folder (picked through a file dialog) is searched without a limit. The build root has no limit because a build may need a manifest above the opened folder.

These are deliberately separate — in a monorepo the `package.json` may be several levels above the app's own `fastedge-config.test.json`.

**`.debug-port` file**: Written by fastedge-test's `startServer()` at `{configRoot}/.fastedge-debug/.debug-port` after picking a port via auto-increment (5179-5188) and calling `httpServer.listen()`. The extension discovers the port by calling `waitForPortFile()` after forking the server — it does not pass a `PORT` env var.

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
| `fastedge.debugger.allowedFolders` | string[] (`application` scope) | The debugger's allowed folders: read-only folders outside the workspace |

`fastedge.debugger.allowedFolders` is passed to the debugger server as `FASTEDGE_ALLOWED_FOLDERS` (a JSON array, always set, `~` expanded) when it starts; `start()` replaces a running server whose list differs from the setting, so a change applies the next time the debugger is opened. Only the user setting is read (`inspect().globalValue`): the `application` scope already keeps it out of a workspace's `.vscode/settings.json`, and no folders are passed in an untrusted workspace. The server asks before its first read of each folder in a session by sending `{ type: "fastedge:approve-folder", id, folder }` over the fork's IPC channel; `DebuggerServerManager` shows a modal warning and replies `{ type: "fastedge:folder-approval", id, approved }`. Nothing on the server's HTTP API can approve a folder.

---

**Related Documentation**:
- `features/DOTENV_SYSTEM.md` — dotenv file format and discovery
- `BUNDLED_DEBUGGER.md` — how fastedge-config.test.json is loaded in the debugger UI
- `features/COMMANDS.md` — F5 entrypoint routing
- `archived/ARCHIVED_CONFIGURATION_SYSTEM.md` — DAP-era three-tier hierarchy (historical)

---

**Last Updated**: March 2026
