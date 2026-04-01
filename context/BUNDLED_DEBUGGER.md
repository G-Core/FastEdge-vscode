# Bundled Debugger Implementation

**Last Updated**: March 12, 2026
**Version**: 0.1.19+
**Status**: ✅ Implemented & Packaged

---

## Overview

The FastEdge-vscode extension includes a **fully bundled fastedge-debugger** that requires zero external setup. Users can install the extension and immediately start debugging FastEdge applications without Node.js installed.

---

## Architecture

### How It Works

```
FastEdge Extension Install
    ↓
Extension contains bundled debugger (dist/debugger/)
    ↓
User opens a file in an app folder and runs "FastEdge: Run File"
    ↓
Extension resolves config root (nearest .fastedge-debug/ directory) and build root (nearest package.json / Cargo.toml)
    ↓
Extension reads <configRoot>/.fastedge-debug/.debug-port (if present) → health-checks
    ↓
If healthy: reuse existing server   If missing/stale: fork new server on next free port
    ↓
Server writes port to <configRoot>/.fastedge-debug/.debug-port
    ↓
Per-app webview panel opens ("FastEdge Debugger — <appName>")
```

Multiple apps open simultaneously each get their own server on separate ports (5179, 5180, …) and their own panel.

### Key Components

**1. Bundled Server** (`dist/debugger/server.js`)
- Single file: 915KB
- All dependencies bundled with esbuild
- Includes Express, ws, wasi-shim, and all runtime dependencies
- No node_modules needed

**2. Bundled Frontend** (`dist/debugger/frontend/`)
- React-based UI
- Connects to server on port 5179
- Real-time logs via WebSocket

**3. Extension Integration**
- `src/utils/resolveAppRoot.ts` - Two functions: `resolveConfigRoot()` (finds `.fastedge-debug/` directory) and `resolveBuildRoot()` (finds `package.json` / `Cargo.toml`). `ensureDebugDir()` creates the `.fastedge-debug/` directory when none exists (third-app case).
- `DebuggerServerManager.ts` - Manages server lifecycle **per app root** — one instance per app
- `extension.ts` - Maintains `Map<appRoot, DebuggerServerManager>` and `Map<appRoot, DebuggerWebviewProvider>`
- Uses `child_process.fork()` to spawn server
- Uses VSCode's Node.js runtime (`process.execPath`)
- No external Node.js required

---

## User Experience

### Before (Old Approach)
❌ Install extension
❌ Clone fastedge-debugger repo
❌ Run `npm install` in debugger
❌ Configure path in settings
❌ Required Node.js installed
❌ Manual setup for Rust developers

### After (Bundled Approach)
✅ Install extension
✅ Ready to debug!

**That's it.** No configuration, no Node.js, no manual steps.

---

## Build Process

### For Extension Developers

The extension build automatically bundles the debugger:

```bash
npm run package
  └─→ prebuild hook runs
      └─→ npm run bundle:debugger
          └─→ Runs ../scripts/bundle-debugger-for-vscode.sh
              └─→ Builds fastedge-debugger with build:bundle
              └─→ Copies server.bundle.js to dist/debugger/
              └─→ Copies frontend to dist/debugger/
  └─→ Builds extension code
  └─→ Packages into .vsix (529KB)
```

### Build Commands

**Full build and package:**
```bash
npm run package
```

**Just bundle debugger:**
```bash
npm run bundle:debugger
```

**Build without bundling debugger:**
```bash
npm run build
```

---

## Technical Details

### Server Startup

**File**: `src/debugger/DebuggerServerManager.ts`

```typescript
// Path to bundled server
const bundledServerPath = path.join(
  this.extensionPath,
  'dist/debugger/server.js'
);

// Fork using VSCode's Node.js
this.serverProcess = fork(bundledServerPath, [], {
  cwd: path.dirname(bundledServerPath),
  execPath: process.execPath, // VSCode's Node!
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: {
    ...process.env,
    PORT: '5179',
  },
});
```

### Key Design Decisions

**1. Use fork() instead of spawn()**
- Before: `spawn('npm', ['start'])` - required npm/node in PATH
- After: `fork('server.js')` - uses VSCode's Node directly

**2. No external path configuration**
- Before: `fastedge.debuggerPath` setting for external debugger
- After: Always use bundled debugger at `dist/debugger/`

**3. All dependencies bundled**
- Before: Copied node_modules (vsce packaging issues)
- After: esbuild bundles everything into single server.js

**4. One server per app root (March 2026)**
- Before: Single global server on port 5179 shared by all apps
- After: One server per app folder; port file at `<configRoot>/.fastedge-debug/.debug-port` for discovery
- Isolation boundary: nearest ancestor dir containing `.fastedge-debug/` (`configRoot`)
- If no `.fastedge-debug/` directory exists, one is auto-created **co-located with the active file** on first run — making that directory its own configRoot
- Closing the debug panel stops that app's server and deletes its port file

**8. Config root vs build root split (March 2026)**
- Before: Single `resolveAppRoot()` used for both build CWD and per-app identity — `fastedge-config.test.json` could override the build root incorrectly
- After: `resolveConfigRoot()` finds the per-app anchor; `resolveBuildRoot()` finds where build commands run
- Example — workspace-1: `first-app/fastedge-config.test.json` → configRoot = `first-app/`; `package.json` at workspace root → buildRoot = `workspace-1/`
- WASM output (`<configRoot>/.fastedge-debug/app.wasm`) is written to configRoot's `.fastedge-debug/` so the server can find it via `WORKSPACE_PATH`

**6. Wait for WebSocket client before loading WASM (March 2026)**
- Before: extension called `POST /api/load` immediately after creating the webview panel → `wasm_loaded` event fired before UI WebSocket connected → UI missed it, stayed blank
- After: extension polls `GET /api/client-count` until count > 0 before loading
- See [WASM Loading Flow](#wasm-loading-flow)

**7. Path-based loading in extension (March 2026)**
- Before: `loadWasm()` read the WASM file into a buffer and sent as base64 → server had no filename, used placeholder `"binary.wasm"` → `wasmPath` in UI store was wrong
- After: sends `wasmPath` directly; server reads the file and returns `resolvedPath` in the `wasm_loaded` event

**5. Build runs from app root (March 2026)**
- Before: `jsBuild` and `rustBuild` used `workspaceFolders[0]` as CWD → broke multi-root workspaces
- After: `resolveAppRoot(activeFilePath)` derives the correct CWD for both build and output paths

---

## Config File Load/Save — Native VSCode Dialogs

### Why browser file APIs fail in the debugger iframe

The debugger UI runs inside an `<iframe>` sandboxed inside a `WebviewPanel`. This double-sandboxed context blocks all browser file dialog APIs:
- `window.showSaveFilePicker()` → `SecurityError: Cross origin sub frames aren't allowed to show a file picker`
- `prompt()` → silently ignored (missing `allow-modals` sandbox permission)
- `<input type="file">` opens at `~` with no way to target a specific directory

### The postMessage bridge

Both load and save delegate to the extension host via a three-hop message chain:

```
Debugger iframe
  → window.parent.postMessage({ command })
    → Outer webview HTML (bridge)
      → vscode.postMessage → Extension host
        → vscode.window.showOpenDialog / showSaveDialog
      ← panel.webview.postMessage(result) ← Extension host
    ← Outer webview HTML forwards to iframe
  ← iframe handles result
```

### Load config (`openFilePicker`)

1. `ConfigButtons.tsx` detects `window !== window.top`, posts `{ command: "openFilePicker" }`
2. Extension calls `vscode.window.showOpenDialog({ defaultUri: appRoot, filters: { 'JSON Files': ['json'] } })`
3. Reads selected file, posts `{ command: "filePickerResult", content, fileName }` back
4. Iframe parses content and loads config into store; auto-loads WASM if `wasm.path` present

### Save config (`openSavePicker`)

1. `ConfigEditorModal.tsx` Strategy 0 detects `window !== window.top`, posts `{ command: "openSavePicker", suggestedName: "fastedge-config.test.json" }`
2. Extension calls `vscode.window.showSaveDialog({ defaultUri: path.join(appRoot, suggestedName) })`
3. Posts `{ command: "savePickerResult", filePath }` back
4. Iframe calls `POST /api/config/save-as` with `{ config, filePath }` — server writes the file

### Why save goes through the server

The iframe has no filesystem write access. The server (`localhost:5179`) does. By getting a path from the native dialog and passing it to `POST /api/config/save-as`, the server writes the file at the correct location. This also means the saved file is immediately available to the server's `GET /api/config` endpoint.

### Relevant files

- `src/debugger/DebuggerWebviewProvider.ts` — `onDidReceiveMessage` handlers + webview HTML bridge
- `fastedge-debugger/frontend/src/components/common/ConfigButtons/ConfigButtons.tsx` — load path
- `fastedge-debugger/frontend/src/components/ConfigEditorModal/ConfigEditorModal.tsx` — save Strategy 0

---

## WASM Loading Flow

### Why the extension calls /api/load directly

The extension builds the WASM binary and then loads it into the debugger server via `POST /api/load`. It does **not** ask the UI to load it, because the UI runs in a webview iframe and has no filesystem access to the built binary.

### The timing problem and fix

The extension creates the webview panel, then immediately needs to load the WASM. But loading before the UI's WebSocket connects means the `wasm_loaded` event fires before anyone is listening — the UI misses it and stays on "Load a WASM binary to get started."

**Fix**: Before calling `POST /api/load`, the extension polls `GET /api/client-count` until the UI's WebSocket is connected (count > 0), then loads. Polls every 50ms, 5s timeout.

```typescript
// DebuggerWebviewProvider.ts
private async waitForWebSocketClient(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { count } = await fetch(`${url}/api/client-count`).then(r => r.json());
    if (count > 0) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  // timeout — proceed anyway (load is better than no load)
}
```

Typical wait: under 500ms (iframe load + React mount + WebSocket handshake).

### Path-based loading

`DebuggerWebviewProvider.loadWasm()` sends the file **path** to the server, not the binary content:

```typescript
body: JSON.stringify({ wasmPath, dotenv: { enabled: true } })
```

The server is local, so it reads the file itself. This avoids reading a potentially large WASM binary into the extension process just to POST it back to localhost. It also means the server knows the real filename and absolute path, which are included in the `wasm_loaded` event so the UI can display and re-use the path correctly.

### How the UI updates

The server emits a `wasm_loaded` WebSocket event after every `POST /api/load`. When the event arrives from a non-UI source (source `!== "ui"`), the UI calls `setWasmLoaded(resolvedPath, wasmType, fileSize)` — a store action that sets `wasmPath`/`wasmType`/`fileSize` directly without making another API call.

---

## API Endpoints

The bundled server exposes the same REST API:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check — returns `{"status":"ok","service":"fastedge-debugger"}` |
| `/api/client-count` | GET | Returns `{ count: N }` connected WebSocket clients — used by extension to wait for UI before loading |
| `/api/load` | POST | Load WASM binary (accepts `wasmPath` or `wasmBase64`) |
| `/api/execute` | POST | Execute test request |
| `/api/config` | GET | Get configuration (reads `fastedge-config.test.json`) |
| `/api/config` | POST | Update configuration (writes `fastedge-config.test.json`) |
| `/api/config/save-as` | POST | Save config to a specified path — used by VSCode save dialog flow |
| `/api/reload-workspace-wasm` | POST | Trigger UI reload via WebSocket event (used for F5 rebuilds after initial load) |
| `/` | GET | Serve frontend UI |
| `ws://` | WebSocket | Real-time logs and state events |

Agents and external tools can still access these endpoints normally.

---

## File Structure

```
dist/
├── extension.js              (19KB - extension code)
└── debugger/                 (1.3MB - bundled debugger)
    ├── server.js             (915KB - bundled with all deps!)
    ├── frontend/             (~300KB - React UI)
    │   ├── index.html
    │   └── assets/
    │       ├── index-*.css
    │       └── index-*.js
    ├── fastedge-cli/         (platform-specific fastedge-run binary)
    └── fastedge-host/        (WASI host utilities)
```

Note: `lib/` (the `@gcoredev/fastedge-test` npm package output) is explicitly **excluded** from the bundle — it is not needed by the VSCode extension.

**Total**: 1.3MB uncompressed, 529KB in .vsix

---

## Commands

The extension provides debug commands and explorer context menu commands. Servers are started and stopped automatically — no manual server control needed.

### Debug commands (F5 / command palette)

- `Debug: FastEdge App (Current File)` — Build active file → start server → open debugger panel
- `Debug: FastEdge App (Package Entry)` — Build `package.json` main entry (JS only) → start server → open debugger panel

### Explorer context menu commands

Right-click files in the VSCode file explorer to load them directly into the debugger without a build step:

- **FastEdge: Load in Debugger** — appears on `.wasm` files. Resolves app root from the file's directory, starts the server, and loads the binary directly (skips compile step). Useful for loading pre-built WASM binaries.
- **FastEdge: Load Config in Debugger** — appears on `*test.json` files (e.g. `fastedge-config.test.json`). Opens the debugger for that app, then sends the config content via the existing `filePickerResult` message path that `ConfigButtons` already handles. Auto-loads WASM if `wasm.path` is set in the config.

**Implementation**: `src/commands/runDebugger.ts` — `loadWasmInDebugger()` and `loadConfigInDebugger()`. The config command uses `provider.sendConfig()` which waits for the React app's WebSocket to connect (same `waitForWebSocketClient` poll) before posting the message, avoiding the timing problem that affects initial WASM loads.

---

## Drag-and-Drop Limitation

**Drag-and-drop of files onto the debugger webview panel is not supported in VSCode.**

### Why it cannot work

VSCode intercepts all file drag events at the application level before the webview's HTML document ever receives them. When a file is dragged over any editor area (including webview panels), VSCode shows a "Hold Shift to drop into editor" indicator and handles the drop itself. The webview renderer never fires `dragenter`, `dragover`, or `drop` events — even with capture-phase listeners on `document`.

This is by design in VSCode's Electron shell and cannot be bypassed from a webview or extension.

### Investigation summary (March 2026)

Several approaches were tried and confirmed not to work:
- `document.addEventListener('dragenter', ..., true)` (capture phase) — never fires
- Full-screen transparent overlay `<div>` above the iframe — never receives events
- `dataTransfer` interception in the outer webview shell — outer shell also never sees drag events

### Standalone mode (fastedge-test direct)

When the debugger frontend is accessed directly in a browser (not via the VSCode webview), drag-and-drop **does work**. The `DragDropZone` component in the React app handles `.wasm` and `.json` drops natively.

### Workaround for VSCode users

Use the explorer context menu commands described above. Right-clicking is one action and is arguably more discoverable than drag-and-drop.

---

## Configuration

No configuration needed! But these settings are available:

**Removed Settings:**
- `fastedge.debuggerPath` - No longer needed (always uses bundled)

**Remaining Settings:**
- `fastedge.cliVersion` - Shows FastEdge CLI version (read-only)
- `fastedge.apiUrl` - Default API URL for MCP server

---

## Troubleshooting

### Server doesn't start

**Check:**
1. Is the bundled server present?
   ```bash
   ls dist/debugger/server.js
   ```

2. Check extension logs:
   - Open: Help → Toggle Developer Tools → Console

3. Check for the port file — it tells you which port this app's server is on:
   ```bash
   cat <configRoot>/.fastedge-debug/.debug-port   # e.g. cat first-app/.fastedge-debug/.debug-port
   lsof -i :<port>
   ```
   `configRoot` is the directory containing `.fastedge-debug/` for the app you're debugging.

### Extension won't install

**Issue**: Old node_modules in bundle

**Solution**: This was fixed - no node_modules in bundle anymore!

### WASM won't load

**Check:**
1. WASM file is valid
2. Server is running (check port 5179)
3. Check debugger console logs

---

## Future Enhancements

### GitHub Actions Integration

Currently: Coordinator script builds and copies debugger

Future: GitHub Actions will:
1. Build fastedge-debugger in CI
2. Create release with bundled server
3. Extension downloads pre-built bundle
4. Faster builds, consistent binaries

### Potential Features

- Auto-detect WASM files in workspace
- Better build integration (compile → load)
- ~~Pass launch.json config to debugger~~ — N/A; runtime config now lives in `fastedge-config.test.json`
- ~~Multi-instance support (multiple debuggers)~~ ✅ Done March 2026 — per-app servers

---

## Benefits

### For Users
✅ **Zero setup** - Install and go
✅ **No Node.js required** - Works for Rust developers
✅ **Automatic updates** - Debugger updates with extension
✅ **No configuration** - Works out of the box

### For Developers
✅ **Simple architecture** - Clear separation of concerns
✅ **Easy to maintain** - Each repo owns its build
✅ **CI/CD ready** - Can be fully automated
✅ **Testable** - Can test debugger independently

### For the Project
✅ **Professional UX** - Enterprise-grade experience
✅ **Scalable** - Can distribute via marketplace
✅ **Independent repos** - Debugger stays standalone
✅ **Proven pattern** - Standard VSCode extension approach

---

## Related Documentation

**Coordinator Level:**
- `/context/VSCODE_DEBUGGER_BUNDLING.md` - Implementation details
- `/context/REPOSITORIES.md` - Repository relationships
- `/scripts/bundle-debugger-for-vscode.sh` - Bundle script

**Debugger:**
- `fastedge-debugger/esbuild-bundle-server.js` - Bundling script
- `fastedge-debugger/context/` - Debugger documentation

**Extension:**
- `src/debugger/DebuggerServerManager.ts` - Server management
- `src/debugger/DebuggerWebviewProvider.ts` - UI integration
- `package.json` - Build scripts

---

**Version**: 0.1.14
**Package Size**: 529KB (.vsix)
**Debugger Size**: 1.3MB (uncompressed)
**Server Size**: 915KB (bundled)
