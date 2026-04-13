# FastEdge VSCode Extension - Changelog

**IMPORTANT**: Do not read this file linearly. Use grep to search for keywords.

**Example searches**:
```bash
grep -i "dotenv" context/CHANGELOG.md
grep -i "fix.*bug" context/CHANGELOG.md
grep "## \[2026-" context/CHANGELOG.md
```

See `SEARCH_GUIDE.md` for more search patterns.

---

## [2026-04-13] - App root resolution aligned: fall back to build manifest, not source file directory

### Overview
All debug entry points (`buildAndDebug`, `loadWasmInDebugger`, `loadConfigInDebugger`) now fall back to `resolveBuildRoot()` (nearest `package.json`/`Cargo.toml`) instead of `dirname(activeFile)` when no existing `.fastedge-debug/` is found. This aligns with industry convention (artifacts next to build manifest) and matches the CLI's new walk-up resolution in `fastedge-test`.

### What Changed

#### `src/commands/runDebugger.ts`
- **`buildAndDebug()`**: `portAnchor` fallback changed from `dirname(activeFilePath)` + `ensureDebugDir()` to `buildRoot`
- **`loadWasmInDebugger()`**: `appRoot` fallback changed from `wasmDir` to `resolveBuildRoot(wasmPath) ?? wasmDir`
- **`loadConfigInDebugger()`**: `appRoot` fallback changed from `configDir` to `resolveBuildRoot(configPath) ?? configDir`
- **Removed**: `ensureDebugDir` import (server's `writePortFile()` creates the directory)

### Context Docs Updated
- `context/architecture/DEBUGGER_ARCHITECTURE.md` — port file comment updated

---

## [2026-04-13] - Port resolution moved to fastedge-test; extension discovers port via port file

### Overview
The `resolvePort()` method was removed from `DebuggerServerManager.ts`. Port auto-increment (5179-5188) is now handled entirely by fastedge-test's `startServer()`. The extension no longer passes `PORT` in the env when forking the server. Instead, after forking, it calls `waitForPortFile()` to watch for `.fastedge-debug/.debug-port`, reads the port fastedge-test chose, and confirms health. This replaces the old `waitForHealthy()` method.

### What Changed

#### 1. `DebuggerServerManager.ts`
- **Removed**: `resolvePort()` method (port scanning 5179-5188 with identity check)
- **Removed**: `PORT` env var from `fork()` call — server spawned without it
- **Removed**: `waitForHealthy()` method
- **Added**: `waitForPortFile()` — watches for `.fastedge-debug/.debug-port` to appear, reads port, confirms health

#### 2. Port selection responsibility
- **Before**: Extension scanned ports 5179-5188, passed chosen port via `PORT` env var
- **After**: fastedge-test's `startServer()` picks its own port via auto-increment, writes it to `.debug-port`; extension discovers it

### Context Docs Updated
- `context/architecture/DEBUGGER_ARCHITECTURE.md` — fork snippet updated (no PORT env), port discovery section added, error handling updated
- `context/architecture/EXTENSION_LIFECYCLE.md` — debugger flow step 6 updated (resolvePort -> waitForPortFile), error handling updated
- `context/BUNDLED_DEBUGGER.md` — architecture diagram and server startup code updated
- `context/features/CROSS_PLATFORM.md` — port scanning row updated to port discovery
- `context/features/COMMANDS.md` — server start step updated
- `context/CONTEXT_INDEX.md` — DebuggerServerManager description updated
- `context/PROJECT_OVERVIEW.md` — debug session flow step updated

---

## [2026-04-02] - Discriminated union config schema: appType + path/url split for /api/execute

> **Source**: Bundled debugger (fastedge-test). No changes to extension `src/` — the extension hosts the debugger via `dist/debugger/` and is unaware of the config schema. See `context/BUNDLED_DEBUGGER.md` for the bundling architecture.

### Overview
The config schema now uses a discriminated union on `appType` (`"proxy-wasm"` or `"http-wasm"`). HTTP WASM configs use `request.path` (path only, e.g. `"/api/hello?q=1"`) instead of the previous `request.url`. CDN/proxy-WASM configs continue to use `request.url` (full URL). The server `/api/execute` endpoint accepts both `path` (preferred for HTTP) and `url` (legacy/CDN). The frontend API client now sends `{ path }` for HTTP WASM execute calls and `{ url }` for CDN.

### What Changed (in bundled debugger)
- Config schema: `appType` field is now explicit — `"proxy-wasm"` or `"http-wasm"`
- HTTP WASM: `request.path` replaces `request.url` (path-only, e.g. `"/api/hello?q=1"`)
- CDN / Proxy-WASM: `request.url` remains (full URL, e.g. `"https://example.com/page"`)
- Server `/api/execute`: accepts both `path` and `url` fields
- Frontend API client: sends `{ path }` for HTTP WASM, `{ url }` for CDN

### Context Docs Updated
- `context/architecture/DEBUGGER_ARCHITECTURE.md` — `/api/execute` examples updated to show both formats

---

## [2026-04-01] - configDir in filePickerResult for relative dotenv path resolution

### Overview
The extension now sends `configDir` (the directory of the config file) alongside `content` and `fileName` in `filePickerResult` messages. This allows the debugger frontend to resolve relative `dotenv.path` values (e.g., `"./fixtures"`) against the config file's directory instead of the server CWD.

### What Was Completed

#### 1. `DebuggerWebviewProvider.ts`
- `openFilePicker` handler now includes `configDir: path.dirname(uris[0].fsPath)` in the `filePickerResult` message
- `sendConfig()` method accepts an optional `configDir` parameter and forwards it in the message

#### 2. `runDebugger.ts`
- `loadConfigInDebugger()` passes `path.dirname(configPath)` to `sendConfig()` for auto-load flow

**Files Modified:**
- `src/debugger/DebuggerWebviewProvider.ts` — `configDir` in `filePickerResult` + `sendConfig()` signature
- `src/commands/runDebugger.ts` — passes `configDir` to `sendConfig()`

### Notes
- The bridge HTML already forwards the full `event.data` object, so `configDir` passes through to the iframe automatically
- This is a cross-repo change coordinated with fastedge-test (which consumes `configDir` in `ConfigButtons.tsx`)
- See fastedge-test `context/features/DOTENV.md` → "Relative Path Resolution" for the full flow

---

## [2026-03-20] - Explorer context menu commands for loading WASM and config files

### Overview
Added two right-click context menu commands in the VSCode file explorer as the supported alternative to drag-and-drop (which cannot work in VSCode webviews — VSCode intercepts all file drag events at the application level before the webview sees them).

### 🎯 What Was Completed

- **FastEdge: Load in Debugger** on `.wasm` files — resolves app root from the file's directory, starts the server, loads the binary directly (no build step)
- **FastEdge: Load Config in Debugger** on `*test.json` files — starts the debugger for that app's directory, reads the JSON file, sends via the existing `filePickerResult` message path that `ConfigButtons` already handles (auto-loads WASM if `wasm.path` is in the config)
- Added `provider.sendConfig(content, fileName)` to `DebuggerWebviewProvider` — waits for WebSocket client before posting, avoiding the timing race that affects WASM loads

**Files Modified:**
- `package.json` — `contributes.commands` (2 new entries) + `contributes.menus.explorer/context`
- `src/commands/runDebugger.ts` — `loadWasmInDebugger()`, `loadConfigInDebugger()` (exported)
- `src/debugger/DebuggerWebviewProvider.ts` — `sendConfig()` public method
- `src/extension.ts` — registered both new commands

### 📝 Notes
- Drag-and-drop was investigated thoroughly and is fundamentally unsupported in VSCode webviews. See `context/BUNDLED_DEBUGGER.md` → "Drag-and-Drop Limitation" for the full investigation summary.
- The `*test.json` when-clause (`resourceFilename =~ /test\\.json$/`) surfaces the command on `fastedge-config.test.json` and any other `*test.json` files.

---

## [2026-03-18] - DotenvPanel: show resolved app root as default path label

### Overview
The dotenv path default display was showing `"workspace root (default)"` — a misleading label, since the actual default is the app root (resolved via `resolveConfigRoot`: nearest `.fastedge-debug/` directory, or `package.json`/`Cargo.toml`). Now the panel requests the real path from the extension on mount and displays it when no custom path is set.

### 🎯 What Was Completed

- Added `getAppRoot` / `appRootResult` message round-trip
  - `DotenvPanel` sends `getAppRoot` on mount (VSCode mode only)
  - Extension host handles it and responds with `this.serverManager.getAppRoot()`
  - Webview wrapper script forwards both directions (same pattern as folder/file pickers)
- Default display now shows the actual resolved path (dimmed italic `.defaultPath` style), falling back to `"app root (default)"` while awaiting the response
- All `"workspace root"` references updated to `"app root"` (label, tooltip, placeholder)
- Fixed vertical alignment: `.pathRow` changed from `align-items: center` to `align-items: baseline` (label is 13px, path value is 12px — different sizes caused subtle misalignment)
- Added `.defaultPath` CSS class (color `#707070`) to visually distinguish default from user-set path

**Files Modified:**
- `src/debugger/DebuggerWebviewProvider.ts` — `getAppRoot` message handler + wrapper script forwarding
- *(fastedge-test)* `frontend/src/components/common/DotenvPanel/DotenvPanel.tsx`
- *(fastedge-test)* `frontend/src/components/common/DotenvPanel/DotenvPanel.module.css`

### 📝 Notes
- The message pattern is the same three-layer chain as other pickers: iframe → wrapper script → extension host → wrapper script → iframe. Both outbound (`getAppRoot`) and inbound (`appRootResult`) forwarding were added to the wrapper script.
- `resolvedRoot` state in `DotenvPanel` is populated once on mount and never changes — the app root is stable for the lifetime of the webview panel.
- The `WORKSPACE_PATH` env var fallback in the server still applies when `dotenvPath` is null at runtime — this change only affects the UI label.

---

## [2026-03-18] - Fix: openFolderPicker/folderPickerResult missing from webview wrapper script

### Overview
The Browse button in the `DotenvPanel` was silently broken despite the extension-side handler existing. Root cause: the webview HTML wrapper script (the bridge between the React iframe and the extension host) was not forwarding `openFolderPicker` outbound or `folderPickerResult` inbound.

### 🎯 What Was Completed

- Added `openFolderPicker` forwarding in the wrapper script: `window.addEventListener('message')` → `vscode.postMessage({ command: 'openFolderPicker' })`
- Added `folderPickerResult` forwarding back to iframe: extension host response → `iframe.contentWindow.postMessage(event.data, '*')`
- Mirrors the existing `openFilePicker`/`filePickerResult` and `openSavePicker`/`savePickerResult` pairs

**Files Modified:**
- `src/debugger/DebuggerWebviewProvider.ts`

### 📝 Notes
- The webview uses a three-layer message chain: React app (iframe) → wrapper script HTML (holds `vscodeApi`) → extension host. Every new command needs BOTH a forwarding rule in the wrapper script AND a handler in `onDidReceiveMessage`. The March 17 work added only the extension handler — the wrapper bridge was missing.
- Pattern for adding future commands: add outbound forwarding (`vscode.postMessage`) + inbound forwarding (`iframe.contentWindow.postMessage`) in the wrapper script alongside the existing pairs.

---

## [2026-03-17] - Debugger webview: openFolderPicker for dotenvPath

### Overview
Added `openFolderPicker` webview message handler in `DebuggerWebviewProvider.ts` to support the new `.env directory` picker in the debugger UI. When the user clicks "Browse…" in the `DotenvPanel`, the webview posts `openFolderPicker` — the extension intercepts it and opens a native OS folder dialog, then returns the selected path back to the webview via `folderPickerResult`.

### 🎯 What Was Completed

- Added `openFolderPicker` handler in `DebuggerWebviewProvider.ts` alongside the existing `openFilePicker` / `openSavePicker` handlers
- Uses `vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, defaultUri: appRoot })`
- On selection: posts `{ command: 'folderPickerResult', folderPath: uris[0].fsPath }` back to webview
- On cancel: posts `{ command: 'folderPickerResult', canceled: true }`

**Files Modified:**
- `src/debugger/DebuggerWebviewProvider.ts`

### 📝 Notes
- **⚠️ Wrapper script bridge was missing — Browse button was broken until the March 18 fix above.**
- This is the VSCode side of the dotenvPath feature implemented in fastedge-test. The full feature spans both repos.
- The extension's own dotenv auto-discovery system (`src/dotenv/index.ts`, documented in `context/features/DOTENV_SYSTEM.md`) is a separate mechanism — it always-on discovers `.env` files from `configRoot`. The folder picker here controls the *debugger server's* `dotenvPath`, not the extension's discovery system.
- When no path is selected, the debugger server falls back to `WORKSPACE_PATH` (set as an env var when the server process is spawned) — workspace root is always the correct default for extension users.

---

## [2026-03-17] - Command Cleanup + Rename

### Overview
Removed four legacy/redundant commands and renamed the workspace command to better reflect what it actually does. Cleaned up dead schema, dead types, unused deps, and the now-obsolete `launchJson.ts` file.

### 🎯 What Was Completed

#### Commands Removed
- `fastedge.generate-launch-json` (`FastEdge: Generate launch.json`) — F5 works without launch.json; the generated config contained ~10 fields (`port`, `dotenv`, `env`, etc.) that the extension never read, creating false expectations
- `fastedge.start-debugger-server` (`FastEdge: Start Debugger Server`) — redundant; every debug command auto-starts the server
- `fastedge.stop-debugger-server` (`FastEdge: Stop Debugger Server`) — redundant; closing the panel auto-stops the server
- `fastedge.debug-app` (`FastEdge: Debug Application`) — incomplete (had a TODO for compiler integration); fell back to manual WASM file picker, making it a broken duplicate of `run-file`

#### Command Renamed
- `Debug: FastEdge App (Workspace)` → **`Debug: FastEdge App (Package Entry)`** — the old name implied multi-app or multi-folder behaviour; it actually builds from the `package.json` `"main"` field (JS only)

#### F5 handler updated
- Now accepts both `"entrypoint": "package"` (new) and `"entrypoint": "workspace"` (backward compat) to route to `runWorkspace()`

#### Dead code removed
- `src/commands/launchJson.ts` — deleted
- `src/commands/index.ts` — removed `launchJson` re-export
- `src/extension.ts` — removed `startDebuggerServer`, `stopDebuggerServer`, `debugFastEdgeApp`, `getActiveAppRoot` functions and their imports (`createLaunchJson`, `resolveConfigRoot`, `resolveBuildRoot`, `ensureDebugDir`)
- `src/types.ts` — removed `LaunchConfiguration` interface (unused)
- `package.json` — removed dead `configurationAttributes` fields (kept only `entrypoint`); removed unused deps `@vscode/debugadapter`, `@vscode/debugprotocol`

**Files Modified:**
- `package.json` — removed 4 commands, renamed workspace command, cleaned debuggers schema, removed 2 deps
- `src/extension.ts` — removed 4 command registrations, 4 functions, 4 imports
- `src/commands/index.ts` — removed launchJson re-export
- `src/commands/launchJson.ts` — deleted
- `src/types.ts` — removed `LaunchConfiguration`

---

## [2026-03-12] - Config Root vs Build Root Split + .fastedge-debug/ Directory

### Overview
Refactored app root resolution to separate two previously conflated concerns: where the build runs (build root = `package.json` / `Cargo.toml`) and which directory anchors per-app isolation (config root = `.fastedge-debug/` directory). Moved `.debug-port` from `.fastedge/.debug-port` to `{configRoot}/.fastedge-debug/.debug-port`. For apps with no `.fastedge-debug/` directory, one is auto-created next to the active file rather than at the build root.

### Background

The old `resolveAppRoot()` returned the first directory containing any of `fastedge-config.test.json` / `package.json` / `Cargo.toml`. In workspaces where `fastedge-config.test.json` lives in a subdirectory below `package.json` (e.g. `workspace-1` with per-app subdirs under a shared `package.json`), the build command was running from the wrong directory.

### 🎯 What Was Completed

#### 1. `resolveAppRoot.ts` — split into three exports

- `resolveConfigRoot(startPath)` — walks up to find `.fastedge-debug/` directory; returns `null` if not found
- `resolveBuildRoot(startPath)` — walks up to find `package.json` or `Cargo.toml`
- `ensureDebugDir(dir)` — creates `.fastedge-debug/` directory if it doesn't exist (no-op otherwise)

Old `resolveAppRoot()` export removed entirely.

#### 2. Call site updates

- `rustBuild.ts` / `jsBuild.ts` — build `cwd` and `package.json` reads now use `resolveBuildRoot()`; `.fastedge-debug/` WASM output uses `resolveConfigRoot() ?? buildRoot`
- `runDebugger.ts` / `extension.ts:getActiveAppRoot()` — port anchor uses `resolveConfigRoot()`; falls back to creating config at `path.dirname(activeFile)` (the active file's directory, not the build root)

#### 3. `.debug-port` moved into `.fastedge-debug/`

- **Before**: `{configRoot}/.fastedge/.debug-port`
- **After**: `{configRoot}/.fastedge-debug/.debug-port` (inside the `.fastedge-debug/` directory)
- `writePortFile()` in `fastedge-test/server/server.ts` no longer needs to `mkdirSync` for the port file
- `PORT_FILE_DIR` constant removed from `DebuggerServerManager.ts`

#### 4. Third-app fallback: config created at active file's directory

When no `.fastedge-debug/` directory is found, one is created co-located with the active file (`path.dirname(activeFilePath)`). This makes that directory its own configRoot, giving the app its own `.fastedge-debug/.debug-port` without assuming anything about project structure.

#### 5. Tests added

- `src/utils/resolveAppRoot.test.ts` — 17 vitest tests covering all workspace layouts (workspace-1, workspace-2 variants, Rust/Cargo.toml, null cases, `ensureDebugDir` idempotency)
- `vitest ^2.1.9` added to devDependencies; `pnpm test` script added

**Files Modified:**
- `src/utils/resolveAppRoot.ts` — replaced with two functions + helper
- `src/utils/resolveAppRoot.test.ts` — created
- `src/commands/runDebugger.ts` — build root / config root split, fallback to active file dir
- `src/extension.ts` — same split in `getActiveAppRoot()`
- `src/compiler/jsBuild.ts` — build root for cwd/entrypoint, config root for WASM output
- `src/compiler/rustBuild.ts` — same pattern
- `src/debugger/DebuggerServerManager.ts` — port file path updated, `PORT_FILE_DIR` constant removed
- `fastedge-test/server/server.ts` — port file path updated, `mkdirSync` removed from `writePortFile`
- `context/BUNDLED_DEBUGGER.md` — updated throughout
- `package.json` — vitest added

---

## [2026-03-11] - Config File Rename + Native Load/Save Dialogs

### Overview
Updated to use the renamed `fastedge-config.test.json` (previously `test-config.json`) as the app root marker (later replaced by `.fastedge-debug/` directory as the marker). Implemented native VSCode load and save file dialogs for the debugger's config buttons — previously all dialog strategies failed silently in the sandboxed iframe context.

### Background

The debugger UI runs inside an `<iframe>` embedded in a `WebviewPanel`. This double-sandboxed context blocks the browser's native file APIs (`showSaveFilePicker`, `showOpenDialog`, `prompt`). The load button opened at `~` with no way to target the app root, and the save button produced only console errors.

### Fix

Both load and save detect `window !== window.top` and delegate to the extension host via `postMessage`. The outer webview HTML acts as a bridge, forwarding messages in both directions.

### 🎯 What Was Completed

#### 1. App Root Marker Rename
- `resolveAppRoot.ts`: marker updated from `test-config.json` → `fastedge-config.test.json`
- Error messages in `runDebugger.ts`, `extension.ts`, `jsBuild.ts`, `rustBuild.ts` updated

#### 2. Load Config — Native Open Dialog
- Extension handler: `openFilePicker` → `vscode.window.showOpenDialog({ defaultUri: appRoot })` → reads file → posts `filePickerResult` back
- Dialog opens at the app's root directory

#### 3. Save Config — Native Save Dialog
- Extension handler: `openSavePicker` → `vscode.window.showSaveDialog({ defaultUri: appRoot/.fastedge-debug/fastedge-config.test.json })` → posts `savePickerResult` back
- Frontend calls `POST /api/config/save-as` with the returned path; server writes the file
- Defaults to `.fastedge-debug/fastedge-config.test.json` inside the app's debug directory

#### 4. Webview HTML Bridge
- Forwards `openFilePicker`, `openSavePicker` from iframe → extension host
- Forwards `filePickerResult`, `savePickerResult` from extension host → iframe

**Files Modified:**
- `src/utils/resolveAppRoot.ts` — marker + comment
- `src/commands/runDebugger.ts` — error message
- `src/extension.ts` — error message
- `src/compiler/jsBuild.ts` — error message
- `src/compiler/rustBuild.ts` — error message
- `src/debugger/DebuggerWebviewProvider.ts` — `readFile` import, two new `onDidReceiveMessage` handlers, webview HTML message forwarding

---

## [2026-03-10] - Multi-App Workspace Support

### Overview
Replaced the single shared debugger server model with per-app-root isolation. Each app folder in a workspace now gets its own server, port, and debug panel. Fixes two independent bugs: (1) config/state bleed between apps when multiple VSCode windows or a multi-root workspace are in use, and (2) HTTP WASM build failures in multi-root workspaces because the build was resolving `fastedge-build` from the workspace root instead of the app root.

### Background
The original architecture created one global `DebuggerServerManager` from `workspaceFolders[0]` at extension activation. This worked for single-app workspaces but broke in two common scenarios:
- **Two VSCode windows** each debugging a different app: config changes in one bled into the other via the shared server state.
- **Multi-root workspace** (`/my-cdn-app` + `/my-http-app` in one window): the build always ran from the workspace root, so `npx fastedge-build` and `cargo build` couldn't find the correct `node_modules/.bin/fastedge-build` or `Cargo.toml` for child apps. HTTP WASM builds failed entirely.

The isolation boundary is the **app folder** — the nearest ancestor directory containing `.fastedge-debug/`, `package.json`, or `Cargo.toml`.

### 🎯 What Was Completed

#### 1. `resolveAppRoot()` utility (`src/utils/resolveAppRoot.ts`) — NEW FILE
- Walks up from a file path, checking each directory for (in priority order): `.fastedge-debug/` → `package.json` → `Cargo.toml`
- All three markers checked at each level before moving up (avoids false positives from nested manifests)
- Returns `null` if no marker found (surfaced as user-visible error)
- Used by build, server, and panel code as the single source of app identity

#### 2. Build root fix (`src/compiler/jsBuild.ts`, `rustBuild.ts`, `compiler/index.ts`)
- `compileJavascriptBinary`: replaces `workspaceFolders[0]` with `resolveAppRoot(activeFilePath)` for CWD, bin dir, and `package.json` entry point lookup
- `compileRustAndFindBinary`: `cwd` for `cargo build` and `.fastedge-debug/` copy destination now use app root
- `compiler/index.ts`: workspace mode no longer anchors to `workspaceFolders[0]`; always derives root from active file

#### 3. Per-app `DebuggerServerManager` (`src/debugger/DebuggerServerManager.ts`)
- Constructor now takes `appRoot` instead of `workspacePath`
- `start()` reads `<appRoot>/.fastedge-debug/.debug-port`, health-checks the port, reuses if healthy or spawns fresh if stale/missing
- `stop()` sends SIGTERM and deletes the port file
- Spawns server with `WORKSPACE_PATH: appRoot` (used by server for dotenv and port file)
- On unexpected process exit: port file is deleted

#### 4. Per-app panel + extension wiring (`src/extension.ts`, `src/commands/runDebugger.ts`)
- `extension.ts` maintains `Map<appRoot, DebuggerServerManager>` and `Map<appRoot, DebuggerWebviewProvider>`
- `getOrCreateForAppRoot(appRoot)` lazily creates manager+provider pairs
- All commands resolve app root from the active file before acting
- `runDebugger.ts` accepts a factory function (`AppDebuggerFactory`) instead of module-level singletons
- Panel title shows app name: `"FastEdge Debugger — my-cdn-app"`

#### 5. Panel close = stop server (`src/debugger/DebuggerWebviewProvider.ts`)
- `panel.onDidDispose` now calls `serverManager.stop()` — closing the panel kills the server and cleans its port file
- Guard: skips stop if `isRunning()` is false (prevents double-stop when command closes the panel explicitly)

#### 6. Stop command picker (`src/extension.ts`)
- `FastEdge: Stop Debugger Server` shows a quick-pick listing running apps by name when multiple servers are running
- Single server: stops immediately without a picker
- After stop: closes the panel and removes the manager from the map

#### 7. Build terminal auto-close (`src/commands/runDebugger.ts`)
- On successful build: `setTimeout(() => terminal.dispose(), 3000)` — terminal disappears after 3s
- On failed build: terminal stays open so the user can read the error

### 🧪 Testing Scenarios Verified
- Single app, single window: existing behaviour unchanged
- Two apps in a multi-root workspace: independent servers (5179, 5180), independent panels, no state bleed
- HTTP WASM build in child app folder: `fastedge-build` resolved from app root ✅
- Closing panel: server stops, port file deleted
- Stop command with two running: picker shows both; stopping one leaves the other running
- Stale port file: detected and cleaned up on next `start()`

### 📝 Key Design Decisions
- **App root = nearest manifest ancestor**: `.fastedge-debug/` wins over `package.json`/`Cargo.toml` because it is always at the FastEdge app root by convention. Language manifests may exist in parent directories (monorepo root `package.json`, cargo workspace).
- **Port file owned by the server, read by the extension**: server writes it after `httpServer.listen()`, deletes on shutdown. Extension reads it at start time only.
- **Agents never spawn servers**: if an agent finds no port file for the app it's working in, it should prompt the user to open the debug panel first. (T010/T011 in fastedge-plugin — not yet implemented.)

**Files Modified:**
- `src/utils/resolveAppRoot.ts` — NEW
- `src/compiler/jsBuild.ts`
- `src/compiler/rustBuild.ts`
- `src/compiler/index.ts`
- `src/debugger/DebuggerServerManager.ts`
- `src/debugger/DebuggerWebviewProvider.ts`
- `src/extension.ts`
- `src/commands/runDebugger.ts`

**Coordinated change in `fastedge-test`:**
- `server/server.ts` — port file write/delete (see fastedge-test CHANGELOG 2026-03-10)
- `server/runner/PortManager.ts` — async OS-level port check
- `server/runner/HttpWasmRunner.ts` — await allocate

---

## [2026-03-03] - Debugger Bundling Fixes + Port Hardening

### Overview
Two categories of fixes: (1) `dist/lib/` was being incorrectly included in the VSCode bundle (bloat from the npm library build), and (2) `DebuggerServerManager` was trusting any process on port 5179, which caused silent failures when a stale or foreign process occupied the port.

### 🎯 What Was Completed

#### 1. Exclude `lib/` from VSCode Bundle
The `fastedge-test` build script (`pnpm run build`) now runs both `build:debugger` and `build:lib` in parallel, causing `dist/lib/` (the `@gcoredev/fastedge-test` npm package output) to appear in the debugger's dist. This was being swept up by the bundle script and the GitHub Actions workflow.

**Files Modified:**
- `../scripts/bundle-debugger-for-vscode.sh` — added `lib` to the exclusion list in the catch-all copy loop
- `.github/workflows/download-debugger.yml` — added "Remove lib folder" step after extraction, before verification

#### 2. DebuggerServerManager: Identity Check + Port Scanning

**Root cause of the webview bug**: A stale `node dist/server.js` process (running from `fastedge-debugger-OLD_LEGACY`) was occupying port 5179. `isHealthy()` returned true, the extension reused it, but that server had wrong `__dirname` paths — serving 404s on the frontend and failing to find the `fastedge-run` CLI.

**Fixes:**
- `isHealthy()` now validates `data.service === "fastedge-debugger"` — foreign processes fail this check
- New `resolvePort()` method scans ports 5179–5188 on every `start()` call:
  - Reuses port immediately if our own server is found
  - Skips ports occupied by foreign processes (logs a warning)
  - Returns the first free port found
- `this.port` is updated to the resolved port before forking, so `getUrl()` and `getPort()` remain accurate

**Files Modified:**
- `src/debugger/DebuggerServerManager.ts` — `isHealthy()`, new `resolvePort()`, updated `start()`

**Files Modified in fastedge-test (coordinated change):**
- `server/server.ts` — `/health` now returns `{"status":"ok","service":"fastedge-debugger"}`

### 🧪 Testing
- Verified webview loads correctly after killing stale server
- Bundled debugger `dist/debugger/` confirmed to contain: `server.js`, `frontend/`, `fastedge-cli/` — no `lib/`

### 📝 Notes
- The `lib/` exclusion affects both local dev workflow and the production GitHub Actions CI path
- Port scanning window is 10 ports (5179–5188); throws a clear error if all are occupied
- This hardening benefits all users: port 5179 may legitimately be in use by other local services

---

## [2026-02-11] - Bundled Debugger Implementation

### Overview
Complete architectural improvement: debugger is now fully bundled with the extension. No external setup required, no Node.js required, works immediately after installation. Perfect for Rust developers and zero-configuration experience.

### 🎯 What Was Completed

#### 1. Debugger Bundling System
**New Approach**:
- fastedge-debugger bundles its own server with esbuild
- Coordinator script copies pre-built files
- Extension packages bundled debugger in .vsix

**Key Achievement**: Single server.js file (915KB) with ALL dependencies bundled!

**Files Modified/Created**:
- `fastedge-debugger/esbuild-bundle-server.js` - NEW - Server bundling script
- `fastedge-debugger/package.json` - Added `build:bundle` script, esbuild dependency
- `coordinator/scripts/bundle-debugger-for-vscode.sh` - NEW - Copy script
- `package.json` - Added `bundle:debugger` script, prebuild hook

#### 2. Updated Server Manager
**File**: `src/debugger/DebuggerServerManager.ts`

**Changed**:
- Before: `spawn('npm', ['start'])` - required npm in PATH
- After: `fork('server.js')` - uses VSCode's Node.js directly

**Benefits**:
- No external Node.js required
- Uses `process.execPath` (VSCode's Node)
- Works for Rust developers without Node.js
- Separate process for better isolation

#### 3. Removed External Configuration
**Files Modified**:
- `src/extension.ts` - Removed `findDebuggerPath()` function
- `src/extension.ts` - Removed sibling directory detection
- `package.json` - Removed `fastedge.debuggerPath` setting

**Why**: Always use bundled debugger at `dist/debugger/`

#### 4. Build Process Integration
**Files Modified**:
- `package.json` - Added prebuild hook to auto-bundle debugger
- `.vscodeignore` - Include debugger bundle, exclude node_modules

**Build Flow**:
```
npm run package
  └─→ npm run bundle:debugger (prebuild)
      └─→ Builds debugger with esbuild
      └─→ Copies to dist/debugger/
  └─→ npm run build
  └─→ vsce package
```

### 📊 Bundle Statistics

**Before (External Debugger)**:
- Extension size: N/A (debugger separate)
- Required: Manual clone, npm install, Node.js
- Setup: ~5-10 minutes
- Works offline: No

**After (Bundled Debugger)**:
- Extension size: 529KB (.vsix compressed)
- Debugger size: 1.3MB uncompressed
- Server file: 915KB (all deps bundled)
- Required: Nothing
- Setup: 0 seconds (install extension)
- Works offline: Yes ✅

### 🎯 Key Design Decisions

#### Decision 1: Each Repo Owns Its Build
**Why**: Keeps repos independent, debugger can be built standalone

#### Decision 2: Bundle ALL Dependencies
**Why**: No node_modules = no vsce packaging issues, smaller size

#### Decision 3: Coordinator Just Copies
**Why**: Simple, maintainable, can be automated easily

#### Decision 4: Use VSCode's Node.js
**Why**: No user Node.js required, guaranteed compatibility

#### Decision 5: Keep HTTP Server Architecture
**Why**: Agents need REST API, WebSockets need server, proven pattern

### 🚀 User Impact

**Before**:
1. Install extension
2. Clone fastedge-debugger
3. Run `npm install`
4. Configure path in settings
5. Requires Node.js installed
6. Manual setup for Rust developers

**After**:
1. Install extension
2. Done! ✨

### 🧪 Testing Status

**Completed**:
- ✅ Debugger bundles with esbuild
- ✅ Coordinator script copies files
- ✅ Extension builds without errors
- ✅ TypeScript compiles successfully
- ✅ vsce packages without node_modules errors
- ✅ Final .vsix created (529KB)

**Manual Testing Required**:
- ⏳ Install .vsix in VSCode
- ⏳ Start debugger server
- ⏳ Load WASM file
- ⏳ Test on system without Node.js

### 📝 Documentation

**New Files**:
- `context/BUNDLED_DEBUGGER.md` - Complete bundling documentation
- `coordinator/context/VSCODE_DEBUGGER_BUNDLING.md` - Implementation details

**Updated Files**:
- `coordinator/context/REPOSITORIES.md` - Updated FastEdge-vscode section
- `context/CHANGELOG.md` - This entry

### 🔗 Related Changes

**fastedge-debugger**:
- Added `build:bundle` script
- Added esbuild bundling
- Produces single server.bundle.js

**Coordinator**:
- Added bundle script
- Simplified to copy-only operation

**Future**:
- GitHub Actions will download pre-built debugger releases
- Even faster builds, consistent binaries

### 💡 Technical Notes

**esbuild Configuration**:
- Platform: node
- Target: node20
- Bundle: true
- Minify: true
- External: fsevents only (Mac-only, optional)

**No Longer Externalized**:
- wasi-shim (now bundled)
- express (now bundled)
- ws (now bundled)
- All other dependencies (now bundled)

**Result**: Zero node_modules in extension bundle!

---

## [2026-02-10] - Debugger Integration via Webview

### Overview
Replaced custom Debug Adapter Protocol (DAP) implementation with modern webview-based debugger integration. Extension now manages fastedge-debugger server lifecycle and displays debugger UI in native VSCode webview.

### 🎯 What Was Completed

#### 1. Removed Custom DAP Implementation
**Files Deleted** (~300 lines total):
- `src/BinaryDebugConfigurationProvider.ts`
- `src/FastEdgeDebugAdapterDescriptorFactory.ts`
- `src/FastEdgeDebugSession.ts` (284 lines)

**Why Removed**:
- Complex maintenance burden
- Duplicate functionality with debugger server
- Limited features compared to web UI

#### 2. Created Debugger Webview Provider
**Files Created**:
- `src/debugger/DebuggerServerManager.ts` (150+ lines)
  - Start/stop debugger server
  - Health check monitoring
  - Process lifecycle management
  - Port forwarding (5179)

- `src/debugger/DebuggerWebviewProvider.ts` (200+ lines)
  - Create webview panel with debugger UI
  - Load WASM via REST API
  - Configure environment variables
  - Communicate with debugger server

- `src/debugger/index.ts`
  - Exports for both providers

**Architecture**:
```typescript
// Start server
await debuggerServerManager.start();

// Load WASM
await debuggerWebviewProvider.loadWasm(wasmPath);

// Show UI in webview panel
const panel = vscode.window.createWebviewPanel(...);
panel.webview.html = `<iframe src="http://localhost:5179" />`;
```

#### 3. Updated Extension Commands
**File Modified**: `src/extension.ts` (major refactor)
- Removed DAP registration
- Added debugger server management
- Integrated webview provider

**New Commands**:
- `fastedge.start-debugger-server` - Start debugger in background
- `fastedge.stop-debugger-server` - Stop debugger server
- `fastedge.debug-app` - Build WASM, start debugger, open webview

**File Modified**: `package.json`
- Added new command definitions
- Added configuration: `fastedge.debuggerPath`

### Implementation Details

**Server Manager Features**:
- Auto-detection of debugger path
- Health check polling (`GET /health`)
- Graceful startup/shutdown
- Process management
- Error handling

**Webview Provider Features**:
- Iframe embedding of debugger UI
- REST API integration
- WASM loading automation
- Configuration management
- Clean disposal

**Configuration**:
```json
{
  "fastedge.debuggerPath": "/path/to/fastedge-debugger"
}
```

### Impact
- **Cleaner Architecture**: Removed 300+ lines of DAP code
- **Better UX**: Native debugger UI in VSCode
- **Easier Maintenance**: Standard REST API vs custom protocol
- **More Features**: Full debugger UI capabilities
- **Better Integration**: Managed server lifecycle

**Code Changes**:
- Lines added: ~400 (new debugger integration)
- Lines removed: ~300 (DAP implementation)
- Net: +100 lines
- Files created: 3
- Files deleted: 3
- Files modified: 2

### Testing
**Manual Testing Required** (extension needs to be built):
```bash
# 1. Build extension
npm run build

# 2. Open in VSCode development host
# Press F5

# 3. Test commands
# Command Palette > "FastEdge: Start Debugger Server"
# Command Palette > "FastEdge: Debug Application"

# 4. Verify
# - Debugger server starts on port 5179
# - Webview panel opens with debugger UI
# - Can load WASM and test
```

**Part of**: FastEdge Ecosystem Refactoring - Phase 4: VSCode Extension Integration

### Notes
- Requires fastedge-debugger to be available (sibling directory or configured path)
- Uses standard REST API for all debugger communication
- Debugger server managed by extension (start/stop/health checks)
- F5 debugging still available for traditional workflow
- TODO: Integrate with existing compiler system for automatic builds

---

## Format for New Entries

```markdown
## [YYYY-MM-DD] - Feature/Fix Name

### Overview
Brief description of what was accomplished

### 🎯 What Was Completed

#### 1. Component/Feature Name
- Detail 1
- Detail 2

**Files Modified:**
- path/to/file.ts - What changed

**Files Created:**
- path/to/file.ts - Purpose

### 🧪 Testing
How to test the changes

### 📝 Notes
Any important context, decisions, or gotchas
```

---

> Entries before [2026-02-10] (DAP era, initial context setup) → see `context/archived/ARCHIVED_CHANGE_LOG.md`

---

**Note**: Add new entries at the TOP of this file (reverse chronological order)
