# Extension Lifecycle - FastEdge VSCode Extension

This document describes how the FastEdge VSCode extension activates, registers components, and manages its lifecycle.

---

## Overview

The extension follows VS Code's standard extension lifecycle:

1. **Activation** - Extension loads and initializes
2. **Registration** - Commands and providers are registered
3. **Runtime** - Extension responds to user actions
4. **Deactivation** - Extension cleans up resources

---

## Activation

### Activation Event

**Configured in `package.json`:**
```json
"activationEvents": [
  "onStartupFinished"
]
```

**What this means:**
- Extension activates when VS Code finishes startup
- Loads after core VS Code features are ready
- Non-blocking - doesn't slow down VS Code startup
- Extension is always available when user needs it

### Activation Function

**Entry point**: `src/extension.ts` - `activate()` function

```typescript
export function activate(context: vscode.ExtensionContext) {
  // 1. Initialize debugger components
  // 2. Register commands
  // 3. Display CLI version
  // 4. Initialize autorun features
}
```

**Key responsibilities:**
1. Create and register all extension components
2. Add disposables to `context.subscriptions` for cleanup
3. Initialize debugger server manager and webview provider
4. Display FastEdge-run CLI version in settings

---

## Registration

### 1. Debugger Components

**Files**:
- `src/debugger/DebuggerServerManager.ts` - Per-app server lifecycle
- `src/debugger/DebuggerWebviewProvider.ts` - Webview panel with debugger UI

**Initialization** (in `activate()`):

Extension maintains lazy per-app maps rather than a global singleton:
```typescript
const serverManagers = new Map<string, DebuggerServerManager>();
const webviewProviders = new Map<string, DebuggerWebviewProvider>();

function getOrCreateForAppRoot(appRoot: string) { ... }
```

**Key Features**:
- Per-app isolation — each `configRoot` gets its own server + panel
- Server port range 5179–5188 with identity check (`service === "fastedge-debugger"`)
- Server forked using `process.execPath` (VSCode's bundled Node, no external Node needed)
- Closing a panel stops its server and removes it from the map

**See**: `BUNDLED_DEBUGGER.md` for complete architecture details

### 2. Commands

**File**: `src/commands/index.ts` and `src/extension.ts`

**Registered commands**:

| Command ID | Implementation | User-Facing Name |
|------------|----------------|------------------|
| `fastedge.run-file` | `commands/runDebugger.ts` | Debug: FastEdge App (Current File) |
| `fastedge.run-workspace` | `commands/runDebugger.ts` | Debug: FastEdge App (Package Entry) |
| `fastedge.generate-mcp-json` | `commands/mcpJson.ts` | FastEdge (Generate mcp.json) |
| `fastedge.setup-codespace-secret` | `commands/codespaceSecrets.ts` | FastEdge (Setup Codespace Secrets) |

**Registration pattern**:
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('fastedge.run-file', runFile),
  vscode.commands.registerCommand('fastedge.run-workspace', runWorkspace),
  // ... etc
);
```

**All commands are disposable** - automatically cleaned up on deactivation

### 4. CLI Version Display

**Purpose**: Show FastEdge-run CLI version in settings UI

**Implementation**:
```typescript
// Read bundled CLI version
const cliVersion = await getCliVersion();

// Update configuration (visible in settings)
vscode.workspace.getConfiguration('fastedge').update(
  'cliVersion',
  cliVersion,
  vscode.ConfigurationTarget.Global
);
```

**User visibility**:
- Settings UI → Extensions → FastEdge Launcher → CLI Version
- Read-only setting
- Helps users verify which runtime version they have

---

## Runtime Behavior

### Command Execution Flow

1. **User triggers command** (palette, keybinding, F5)
2. **VS Code routes to registered handler**
3. **Command executes**:
   - For debug commands: Resolve app root → build WASM → start/reuse server → open webview
   - For generator commands: Create files, show messages
4. **Results displayed** to user (webview panel, info/error messages)

### Debugger Flow

1. **User triggers debug command** (F5, `run-file`, or `run-workspace`)
2. **App root resolved** from active file via `resolveConfigRoot()` / `resolveBuildRoot()`
3. **Per-app manager lookup**: `Map<appRoot, DebuggerServerManager>` — creates lazily if not present
4. **Build**: Compiler runs (Rust/JS/AS), output to `{configRoot}/.fastedge/bin/debugger.wasm`
5. **Server start**: `debuggerServerManager.start()` forks bundled `dist/debugger/server.js` using `process.execPath`
6. **Port resolved**: `resolvePort()` scans 5179–5188, reuses own server or picks free port
7. **Webview opened**: Panel titled `"FastEdge Debugger — {appName}"` loads debugger UI in iframe
8. **WASM auto-loaded** into debugger via REST API
9. **Session ends** when user closes the panel — `onDidDispose` calls `serverManager.stop()`

**See**: `DEBUGGER_ARCHITECTURE.md` for complete debugger architecture

### Event Handling

**File watching** (autorun feature):
- `src/autorun/triggerFileHandler.ts`
- Watches files for changes
- Can trigger rebuild/rerun automatically
- Registered if autorun is enabled

**Configuration changes**:
- Extension can react to settings changes via `vscode.workspace.onDidChangeConfiguration`
- Currently: Minimal runtime configuration watching

---

## Deactivation

### Deactivation Function

**Entry point**: `src/extension.ts` - `deactivate()` function

```typescript
export function deactivate() {
  // Cleanup code
}
```

**What happens**:
1. VS Code calls `deactivate()` when extension unloads
2. All disposables in `context.subscriptions` are automatically disposed
3. Active debug sessions are terminated
4. File watchers are stopped
5. Command registrations are removed

**Current implementation**: Empty function
- Cleanup happens automatically via disposables
- No explicit cleanup currently needed

### Disposables Pattern

**All registered components use disposables**:
```typescript
context.subscriptions.push(
  vscode.debug.registerDebugConfigurationProvider(...),
  vscode.debug.registerDebugAdapterDescriptorFactory(...),
  vscode.commands.registerCommand(...),
  // ... etc
);
```

**Why this matters**:
- VS Code automatically disposes all items in array on deactivation
- Prevents memory leaks
- Ensures clean shutdown
- No manual cleanup needed

---

## Extension Context

### What is ExtensionContext?

**Provided by VS Code** to `activate()` function:
```typescript
function activate(context: vscode.ExtensionContext) {
  // context contains:
  // - subscriptions: Disposable[]
  // - extensionPath: string
  // - globalState: Memento
  // - workspaceState: Memento
  // - etc.
}
```

**Key properties used**:

| Property | Usage |
|----------|-------|
| `subscriptions` | Array of disposables for cleanup |
| `extensionPath` | Path to extension directory (for bundled CLI) |
| `globalState` | Persistent storage across workspaces |
| `workspaceState` | Persistent storage for current workspace |

**Current usage**:
- `subscriptions` - All component registrations
- `extensionPath` - Locating bundled `fastedge-cli` directory
- States - Minimal usage currently

---

## Package.json Contributions

### Debugger Contribution

**Defines the `fastedge` debugger type**:
```json
"contributes": {
  "debuggers": [
    {
      "type": "fastedge",
      "label": "FastEdge App Launcher",
      "program": "./dist/extension.js",
      "languages": ["rust", "javascript"]
    }
  ]
}
```

**Key points**:
- `type: "fastedge"` - Registers the F5 debug provider; enables `.vscode/launch.json` with `"type": "fastedge"`
- The only useful launch.json property is `"entrypoint": "file"` or `"package"` — all other config attributes were removed in [2026-03-17]
- Supported languages: rust, javascript

### Commands Contribution

**Makes commands visible in Command Palette**:
```json
"contributes": {
  "commands": [
    {
      "command": "fastedge.run-file",
      "title": "Debug: FastEdge App (Current File)"
    }
  ]
}
```

**Without contribution**:
- Command can still be registered programmatically
- But won't appear in Command Palette
- Won't be discoverable by users

### Configuration Contribution

**Defines extension settings**:
```json
"contributes": {
  "configuration": {
    "properties": {
      "fastedge.cliVersion": {
        "type": "string",
        "readOnly": true
      }
    }
  }
}
```

**Visible in**: Settings UI → Extensions → FastEdge Launcher

---

## Initialization Order

**Order matters during activation**:

1. ✅ **Register debug configuration provider**
   - Handles F5 `"entrypoint"` routing
   - Must be registered before first F5 press

2. ✅ **Register commands**
   - `run-file`, `run-workspace`, `generate-mcp-json`, `setup-codespace-secret`

3. ✅ **Initialize async operations**
   - CLI version detection (runs in background, updates `fastedge.cliVersion` setting)

Per-app `DebuggerServerManager` / `DebuggerWebviewProvider` instances are created lazily on first debug command for each `appRoot` — not during activation.

---

## Error Handling

### Activation Errors

**If activation fails**:
- VS Code shows error notification
- Extension is marked as failed
- Commands/features are unavailable
- User must reload window to retry

**Best practices**:
- Catch errors in activate()
- Log to extension output channel
- Show user-friendly error messages
- Don't throw unless truly critical

### Runtime Errors

**Command errors**:
- Caught and shown via `vscode.window.showErrorMessage()`
- Don't crash extension
- User can retry

**Debugger server errors**:
- Startup failures surfaced via `vscode.window.showErrorMessage()`
- Server crashes detected on process exit; port file deleted automatically
- Port exhaustion (all 5179–5188 occupied) throws clear error

---

## Multi-Root Workspaces

**Current behavior**:
- Each app folder gets its own isolated server + webview panel
- App root resolved from the active file — not from `workspaceFolders[0]`
- Build CWD uses `resolveBuildRoot()` to find the nearest `package.json` / `Cargo.toml`
- Config isolation uses `resolveConfigRoot()` to find the nearest `fastedge-config.test.json`
- Two apps can debug simultaneously on different ports (5179, 5180, etc.)

---

## Extension Host

**Where does the extension run?**
- Extension Host process (separate from main VS Code window)
- Node.js environment
- Access to full Node.js APIs
- Isolated from VS Code UI for stability

**Debugger server runs as a child process**:
- Forked from Extension Host using `process.execPath` (VSCode's Node)
- Separate process for isolation; crash doesn't affect extension
- Communicates via REST + WebSocket on localhost

---

## Key Takeaways

1. **Activation is automatic** - `onStartupFinished` ensures extension is ready
2. **Registration happens once** - During activation, all components registered
3. **Disposables handle cleanup** - No manual deactivation logic needed
4. **Commands and providers are independent** - Can be tested separately
5. **Extension context provides utilities** - Path resolution, state storage
6. **Package.json contributions expose features** - Commands, debuggers, settings

---

**Related Documentation**:
- `BUNDLED_DEBUGGER.md` - Bundled server architecture, per-app isolation
- `CONFIGURATION_SYSTEM.md` - Config files and app root resolution
- `features/COMMANDS.md` - Individual command implementations

---

**Last Updated**: March 2026
