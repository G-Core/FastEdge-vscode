# Bundled Debugger Implementation

**Last Updated**: March 11, 2026
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
Extension resolves app root (nearest test-config.json / package.json / Cargo.toml)
    ↓
Extension reads <appRoot>/.fastedge/.debug-port (if present) → health-checks
    ↓
If healthy: reuse existing server   If missing/stale: fork new server on next free port
    ↓
Server writes port to <appRoot>/.fastedge/.debug-port
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
- `src/utils/resolveAppRoot.ts` - Finds app root from active file (walks up for `test-config.json` → `package.json` → `Cargo.toml`)
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
- After: One server per app folder; port file at `<appRoot>/.fastedge/.debug-port` for discovery
- Isolation boundary: nearest ancestor dir containing `test-config.json`, `package.json`, or `Cargo.toml`
- Closing the debug panel stops that app's server and deletes its port file

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
body: JSON.stringify({ wasmPath, dotenvEnabled: true })
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
| `/api/config` | GET | Get configuration |
| `/api/config` | POST | Update configuration |
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

The extension provides these commands for debugger control:

**Start/Stop Server:**
- `FastEdge: Start Debugger Server` - Manually start server
- `FastEdge: Stop Debugger Server` - Stop running server

**Debug Application:**
- `FastEdge: Debug Application` - Open debugger with optional WASM
- `Debug: FastEdge App (Current File)` - Build and debug current file
- `Debug: FastEdge App (Workspace)` - Build and debug workspace

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
   cat <appRoot>/.fastedge/.debug-port
   lsof -i :<port>
   ```

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
- Pass launch.json config to debugger automatically
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
