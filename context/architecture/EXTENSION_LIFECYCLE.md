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
- `src/debugger/DebuggerServerManager.ts` - Manages server lifecycle
- `src/debugger/DebuggerWebviewProvider.ts` - Provides debugging UI

**Initialization** (in `activate()`):
```typescript
// Initialize debugger components with bundled debugger
debuggerServerManager = new DebuggerServerManager(context.extensionPath);
debuggerWebviewProvider = new DebuggerWebviewProvider(
  context,
  debuggerServerManager
);
```

**Purpose**:
- `DebuggerServerManager` - Manages bundled debugger server process
- `DebuggerWebviewProvider` - Provides webview panel with debugging UI
- Both components work together to provide visual debugging

**Key Features**:
- Server runs on localhost:5179
- Webview displays React-based UI
- REST API for programmatic access
- Real-time logs via WebSocket

**See**: `DEBUGGER_ARCHITECTURE.md` for complete architecture details

### 2. Commands

**File**: `src/commands/index.ts` and `src/extension.ts`

**Registered commands**:

| Command ID | Implementation | User-Facing Name |
|------------|----------------|------------------|
| `fastedge.run-file` | `commands/runDebugger.ts` | Debug: FastEdge App (Current File) |
| `fastedge.run-workspace` | `commands/runDebugger.ts` | Debug: FastEdge App (Workspace) |
| `fastedge.generate-launch-json` | `commands/launchJson.ts` | FastEdge (Generate launch.json) |
| `fastedge.generate-mcp-json` | `commands/mcpJson.ts` | FastEdge (Generate mcp.json) |
| `fastedge.setup-codespace-secret` | `commands/codespaceSecrets.ts` | FastEdge (Setup Codespace Secrets) |
| `fastedge.start-debugger-server` | `extension.ts` | FastEdge: Start Debugger Server |
| `fastedge.stop-debugger-server` | `extension.ts` | FastEdge: Stop Debugger Server |
| `fastedge.debug-app` | `extension.ts` | FastEdge: Debug Application |

**Registration pattern**:
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('fastedge.run-file', runFile),
  vscode.commands.registerCommand('fastedge.start-debugger-server', startDebuggerServer),
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
   - For debug commands: Start debug session via `vscode.debug.startDebugging()`
   - For generator commands: Create files, show messages
4. **Results displayed** to user (debug console, info messages)

### Debugger Flow

1. **User starts debugger** (Command: "FastEdge: Debug Application")
2. **Server check**: Extension checks if debugger server is running
3. **Start server** (if not running): `debuggerServerManager.start()`
   - Forks bundled server process
   - Server listens on localhost:5179
4. **Show webview**: `debuggerWebviewProvider.show()`
   - Displays React-based debugging UI
   - Connects to server REST API
5. **User loads WASM** through UI (POST /api/load)
6. **User executes requests** through UI (POST /api/execute)
7. **Real-time logs** stream via WebSocket
8. **Session ends** when user closes webview or stops server

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
- `type: "fastedge"` - Used in launch.json configurations
- Supported languages: rust, javascript
- Configuration attributes define available launch.json properties

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

1. ✅ **Create providers first**
   - Debug configuration provider
   - Debug adapter factory

2. ✅ **Register providers with VS Code**
   - Must be registered before first use
   - Add to context.subscriptions

3. ✅ **Register commands**
   - After providers (commands may trigger debug sessions)

4. ✅ **Initialize async operations**
   - CLI version detection (can run in background)
   - File watchers (if needed)

**Current implementation follows this order**

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

**Debug session errors**:
- Handled in `FastEdgeDebugSession`
- Sent to debug console
- Session terminates cleanly

---

## Multi-Root Workspaces

**Current behavior**:
- Extension supports multi-root workspaces
- Each folder can have its own launch.json
- Debug sessions are scoped to specific folder
- Commands operate on active workspace folder

**No special handling needed**:
- VS Code handles multi-root routing automatically
- Debug configurations are per-folder
- Commands use `vscode.workspace.workspaceFolders`

---

## Extension Host

**Where does the extension run?**
- Extension Host process (separate from main VS Code window)
- Node.js environment
- Access to full Node.js APIs
- Isolated from VS Code UI for stability

**Debug adapter runs inline**:
- Same process as extension
- No separate debug adapter process
- Faster communication (no IPC overhead)
- Simpler deployment (no separate binary)

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
- `DEBUGGER_ARCHITECTURE.md` - How debug adapter works
- `CONFIGURATION_SYSTEM.md` - How settings are managed
- `features/COMMANDS.md` - Individual command implementations

---

**Last Updated**: February 11, 2026
