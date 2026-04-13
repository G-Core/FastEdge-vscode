# Debugger Architecture - FastEdge VSCode Extension

**Last Updated**: April 13, 2026
**Current Version**: Webview-based bundled debugger architecture

This document describes how the FastEdge VSCode extension provides debugging capabilities through an embedded fastedge-debugger server and webview UI.

---

## Overview

The FastEdge extension uses a **bundled debugger** approach instead of the traditional Debug Adapter Protocol (DAP). This provides:
- ✅ Zero external setup required
- ✅ Works without Node.js installed on user's machine
- ✅ Visual debugging interface via webview
- ✅ REST API for programmatic access
- ✅ Real-time logging via WebSocket

---

## Architecture Components

### 1. Bundled Debugger Server

**Location**: `dist/debugger/server.js` (915KB bundled file)

**Source**: fastedge-debugger repository (bundled during extension build)

**Runtime**:
- Runs as a separate Node.js process
- Forked using VSCode's built-in Node.js runtime
- Serves on `localhost:5179`
- Exposes REST API and serves web UI

**Key Features**:
- Load and test WASM binaries
- Execute HTTP requests against WASM
- Real-time logging via WebSocket
- Configuration management
- Health check endpoint

### 2. DebuggerServerManager

**File**: `src/debugger/DebuggerServerManager.ts`

**Purpose**: Manages the debugger server lifecycle

**Responsibilities**:
- Start/stop server process
- Discover port via port file (`.fastedge-debug/.debug-port`)
- Handle server crashes/failures
- Provide server status to extension

**Key Methods**:

```typescript
class DebuggerServerManager {
  async start(): Promise<void>
  async stop(): Promise<void>
  isRunning(): boolean
  getServerUrl(): string
}
```

**Process Management**:
```typescript
// Fork the bundled server using VSCode's Node.js
const bundledServerPath = path.join(
  this.extensionPath,
  'dist/debugger/server.js'
);

this.serverProcess = fork(bundledServerPath, [], {
  cwd: path.dirname(bundledServerPath),
  execPath: process.execPath, // VSCode's Node.js!
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: {
    ...process.env,
    // No PORT env var — fastedge-test picks its own port
    // via auto-increment (5179-5188) and writes it to
    // <configRoot>/.fastedge-debug/.debug-port
  },
});
```

**Port Discovery**:

The extension no longer selects the port. After forking the server, it calls `waitForPortFile()` which watches for `<appRoot>/.fastedge-debug/.debug-port` to appear (written by fastedge-test's `startServer()`). The extension reads the chosen port from this file and confirms the server is healthy before proceeding.

**App Root Resolution** (shared contract with CLI):
All entry points resolve the app root using the same priority:
1. Walk up from the starting path to find an existing `.fastedge-debug/` directory (explicit user anchor)
2. Walk up to find the nearest `package.json` or `Cargo.toml` (build manifest = app identity)
3. Fall back to the starting directory

This ensures `.fastedge-debug/` always lands next to the build manifest, regardless of whether the developer uses `npx fastedge-debug`, VSCode F5, or the Package Entry command.

**Why fork() instead of spawn()**:
- Uses VSCode's built-in Node.js (no external dependency)
- No need for npm or node in user's PATH
- Perfect for Rust developers without Node.js
- Cleaner IPC communication

### 3. DebuggerWebviewProvider

**File**: `src/debugger/DebuggerWebviewProvider.ts`

**Purpose**: Provides webview panel showing debugger UI

**Responsibilities**:
- Create and manage webview panel
- Load debugger frontend (from bundled files)
- Connect webview to debugger server
- Handle webview lifecycle

**Key Features**:
- Embedded React-based UI
- Connects to server on localhost:5179
- Displays WASM execution results
- Real-time log streaming
- Request/response inspection

**Webview Content**:
```typescript
// Points to bundled frontend
const frontendPath = path.join(
  extensionPath,
  'dist/debugger/frontend/index.html'
);

// Webview displays the UI and connects to REST API
webview.html = getWebviewContent(frontendPath, serverUrl);
```

---

## How It Works

### Startup Flow

1. **Extension Activation** (`src/extension.ts`):
   ```typescript
   export function activate(context: vscode.ExtensionContext) {
     // Initialize debugger components
     debuggerServerManager = new DebuggerServerManager(context.extensionPath);
     debuggerWebviewProvider = new DebuggerWebviewProvider(
       context,
       debuggerServerManager
     );
   }
   ```

2. **User Starts Debugger** (Command: "FastEdge: Start Debugger Server"):
   ```typescript
   async function startDebuggerServer() {
     await debuggerServerManager.start();
     // Server now running on localhost:5179
   }
   ```

3. **User Opens Debug UI** (Command: "FastEdge: Debug Application"):
   ```typescript
   async function debugFastEdgeApp() {
     // Ensure server is running
     if (!debuggerServerManager.isRunning()) {
       await debuggerServerManager.start();
     }

     // Show webview panel
     debuggerWebviewProvider.show();
   }
   ```

4. **Webview Connects**:
   - Frontend loads in webview
   - JavaScript connects to `http://localhost:5179`
   - UI displays and ready for interaction

### Debugging Flow

1. **Load WASM Binary**:
   ```bash
   POST http://localhost:5179/api/load
   {
     "wasmBase64": "...",
     "dotenv": { "enabled": true }
   }
   ```
   - Binary auto-detected as HTTP-WASM or Proxy-WASM
   - Configuration loaded from .env files
   - WASM module initialized

2. **Execute Request**:

   The request format depends on the app type (`appType` in config):

   **HTTP WASM** (`appType: "http-wasm"`) — uses `path` (preferred):
   ```http
   POST http://localhost:5179/api/execute
   Content-Type: application/json

   {
     "method": "GET",
     "path": "/api/hello?q=1",
     "headers": {},
     "body": ""
   }
   ```

   **CDN / Proxy-WASM** (`appType: "proxy-wasm"`) — uses `url` (full URL):
   ```http
   POST http://localhost:5179/api/execute
   Content-Type: application/json

   {
     "method": "GET",
     "url": "https://example.com/page",
     "headers": {},
     "body": ""
   }
   ```

   The server accepts both `path` and `url` fields; `path` is preferred for HTTP WASM, `url` for CDN/proxy-WASM. The frontend API client sends `{ path }` for HTTP and `{ url }` for CDN.

   - Request processed by WASM
   - Response captured
   - Logs streamed via WebSocket

3. **View Results**:
   - Webview displays response headers, body, status
   - Real-time logs shown in UI
   - Can inspect request/response details

### Shutdown Flow

1. **User Stops Server** (Command: "FastEdge: Stop Debugger Server"):
   ```typescript
   async function stopDebuggerServer() {
     await debuggerServerManager.stop();
   }
   ```

2. **Process Cleanup**:
   - Server process receives SIGTERM
   - Graceful shutdown (close connections, cleanup)
   - Process exits
   - Extension updates server status

---

## REST API Endpoints

The bundled server exposes these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Check if server is ready |
| `/api/load` | POST | Load WASM binary |
| `/api/execute` | POST | Execute HTTP request |
| `/api/call` | POST | Call specific WASM function |
| `/api/send` | POST | Send data to WASM |
| `/api/config` | GET | Get current configuration |
| `/api/config` | POST | Update configuration |
| `/` | GET | Serve frontend UI |
| `ws://` | WebSocket | Real-time log streaming |

**Example Usage** (from extension or external tools):
```typescript
// Load WASM
const wasmBuffer = fs.readFileSync('app.wasm');
const wasmBase64 = wasmBuffer.toString('base64');

await fetch('http://localhost:5179/api/load', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ wasmBase64, dotenv: { enabled: true } })
});

// Execute request — HTTP WASM (uses path)
const response = await fetch('http://localhost:5179/api/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    method: 'GET',
    path: '/api/hello?q=1',
    headers: {},
    body: ''
  })
});

// Execute request — CDN / Proxy-WASM (uses url)
const cdnResponse = await fetch('http://localhost:5179/api/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    method: 'GET',
    url: 'https://example.com/page',
    headers: {},
    body: ''
  })
});
```

---

## File Structure

```
dist/
├── extension.js              (Extension code)
└── debugger/                 (Bundled debugger - 1.3MB total)
    ├── server.js             (915KB - all dependencies bundled!)
    ├── frontend/             (~300KB - React UI)
    │   ├── index.html
    │   └── assets/
    │       ├── index-*.css
    │       └── index-*.js
    ├── fastedge-host/        (Utilities)
    ├── runner/               (WASM execution)
    ├── utils/                (Helpers)
    └── websocket/            (Real-time logs)
```

**Build Process**:
```bash
npm run package
  └─→ prebuild hook
      └─→ npm run bundle:debugger
          └─→ Runs ../scripts/bundle-debugger-for-vscode.sh
              ├─→ Builds fastedge-debugger (esbuild bundles to single file)
              ├─→ Copies server.bundle.js → dist/debugger/server.js
              └─→ Copies frontend/ → dist/debugger/frontend/
  └─→ Builds extension code
  └─→ Packages into .vsix (529KB compressed)
```

---

## Extension Commands

The two debug commands trigger the full build → server start → webview flow:

| Command | ID | Purpose |
|---------|-----|---------|
| Debug: FastEdge App (Current File) | `fastedge.run-file` | Build active file → start per-app server → open webview |
| Debug: FastEdge App (Package Entry) | `fastedge.run-workspace` | Build `package.json` main → start per-app server → open webview |

Server start/stop is automatic — servers start when a debug command runs and stop when the webview panel is closed. There are no manual start/stop commands.

---

## Benefits Over DAP Approach

### Old Approach (DAP-based)
❌ Required implementing Debug Adapter Protocol
❌ Limited to text-based debug console
❌ No visual UI for request/response inspection
❌ Complex protocol implementation (300+ lines)
❌ Limited flexibility for FastEdge-specific features

### New Approach (Webview-based)
✅ Visual debugging interface with React UI
✅ REST API allows programmatic access
✅ Real-time logs via WebSocket
✅ Reuses existing fastedge-debugger (battle-tested)
✅ Can be used standalone (localhost:5179)
✅ Zero external dependencies
✅ Works without Node.js on user's machine
✅ Simpler architecture (fork server, show webview)

---

## Error Handling

### Server Startup Failures

**If server fails to start**:
```typescript
try {
  await debuggerServerManager.start();
} catch (error) {
  vscode.window.showErrorMessage(
    `Failed to start debugger server: ${error.message}`
  );
}
```

**Common Issues**:
- Port range 5179–5188 exhausted → fastedge-test throws clear error
- Port file not appearing → Server failed to start (check logs)
- Bundled server missing → Extension installation corrupted
- Node.js runtime issue → VSCode problem (very rare)

### Server Crashes

**Process exit handling**:
```typescript
serverProcess.on('exit', (code) => {
  if (code !== 0) {
    vscode.window.showErrorMessage(
      `Debugger server crashed with code ${code}`
    );
  }
  this.serverProcess = null;
});
```

**Auto-restart**: Currently not implemented (user must manually restart)

### Webview Errors

**If webview fails to connect**:
- Check if server is running (health check)
- Verify port 5179 is accessible
- Show error in webview with retry button

---

## Development and Testing

### Running Extension in Development

1. Open FastEdge-vscode in VS Code
2. Press F5 to launch Extension Development Host
3. In new window, use debugger commands
4. Server output visible in original window console

### Testing Debugger Server

**Manual testing**:
```bash
# In fastedge-debugger repo
npm start

# In browser
open http://localhost:5179

# Test API
curl http://localhost:5179/health
```

**Extension testing**:
1. Build extension with bundled debugger: `npm run package`
2. Install .vsix in VS Code
3. Test commands: Start Server, Debug Application
4. Verify webview displays correctly
5. Test WASM loading and execution

---

## Future Enhancements

### Potential Improvements

1. **Auto-restart on crash** - Automatically restart server if it crashes
2. **Multiple instances** - Support multiple debugger servers on different ports
3. **Build integration** - Automatically compile and load WASM when file changes
4. **Agent REST API access** - Agents reading `.fastedge-debug/.debug-port` to hit the REST API directly (tracked in fastedge-plugin)
5. **GitHub Actions automation** - Download pre-built debugger bundles from releases

---

## Comparison: Old vs New Architecture

| Aspect | Old (DAP) | New (Webview + Server) |
|--------|-----------|------------------------|
| **Protocol** | Debug Adapter Protocol | REST API + WebSocket |
| **UI** | Debug console (text only) | React webview (visual) |
| **Execution** | Inline in extension | Separate server process |
| **Dependencies** | None | Bundled server (1.3MB) |
| **Flexibility** | Limited by DAP | Full control via API |
| **Reusability** | Extension-only | Can use server standalone |
| **External Access** | No | Yes (localhost:5179) |
| **Real-time Logs** | No | Yes (WebSocket) |
| **Node.js Required** | No | No (uses VSCode's Node) |

---

## Key Takeaways

1. **Webview-based architecture** - Visual debugging UI instead of text console
2. **Bundled server** - fastedge-debugger included in extension, zero setup
3. **Separate process** - Server runs independently, better isolation
4. **REST API + WebSocket** - Flexible access, real-time logs
5. **No external dependencies** - Uses VSCode's Node.js, works offline
6. **Reusable** - Server can be accessed by other tools
7. **Production-ready** - Tested and working as of February 2026

---

## Related Documentation

**Extension Context**:
- `BUNDLED_DEBUGGER.md` - Implementation details and build process
- `EXTENSION_LIFECYCLE.md` - How components are registered
- `features/COMMANDS.md` - Debugger command implementations

**Coordinator Context**:
- `/context/VSCODE_DEBUGGER_BUNDLING.md` - Bundling architecture
- `/context/REPOSITORIES.md` - Repository relationships

**Debugger Repository**:
- `fastedge-debugger/docs/API.md` - Complete API documentation
- `fastedge-debugger/context/` - Debugger-specific documentation

---

**Last Updated**: April 13, 2026
**Architecture Version**: Webview-based (v0.1.14+)
**Status**: ✅ Production-ready
