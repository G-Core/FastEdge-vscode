# Debugger Architecture - FastEdge VSCode Extension

This document describes how the FastEdge VSCode extension implements VS Code's Debug Adapter Protocol to enable debugging of FastEdge applications.

---

## Overview

The debugger architecture consists of three main components:

1. **Debug Configuration Provider** - Validates and resolves launch configurations
2. **Debug Adapter Factory** - Creates debug adapter instances
3. **Debug Session** - Implements Debug Adapter Protocol (DAP)

---

## Debug Adapter Protocol (DAP)

### What is DAP?

**Debug Adapter Protocol** is a standardized protocol between VS Code and debuggers:
- **Abstract**: Language/runtime agnostic
- **JSON-based**: Messages sent as JSON-RPC
- **Bidirectional**: Client (VS Code) ↔ Server (Debug Adapter)
- **Event-driven**: Launch, breakpoints, pause, continue, terminate, etc.

**VS Code perspective**:
- VS Code is the **debug client**
- Extension provides the **debug adapter** (server)
- Communication via DAP messages

### DAP Message Types

**Three message types**:

1. **Requests** (VS Code → Debug Adapter)
   - `launch` - Start debugging
   - `attach` - Attach to running process
   - `setBreakpoints` - Set breakpoints (if supported)
   - `continue`, `pause`, `stepIn`, `stepOut`, etc.
   - `disconnect` - End debug session

2. **Responses** (Debug Adapter → VS Code)
   - Reply to requests with success/failure
   - Includes result data

3. **Events** (Debug Adapter → VS Code)
   - `initialized` - Debug adapter ready
   - `output` - Send text to debug console
   - `terminated` - Debugging ended
   - `exited` - Process exited with code

**FastEdge implementation**:
- Primarily uses `launch`, `disconnect` requests
- Sends `output` events for console logging
- Sends `terminated`/`exited` events when process ends
- Does NOT support breakpoints/stepping (not applicable to WASM edge runtime)

---

## Component 1: Debug Configuration Provider

**File**: `src/BinaryDebugConfigurationProvider.ts`

### Purpose

Validates and enhances debug configurations before they're used to launch a debug session.

### Interface

Implements `vscode.DebugConfigurationProvider`:
```typescript
class BinaryDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    token?: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DebugConfiguration>
}
```

### Key Responsibilities

1. **Validate configuration**
   - Ensure `type: "fastedge"`
   - Check required fields present
   - Validate types of fields

2. **Resolve placeholders**
   - Convert `entrypoint: "workspace"` to actual workspace path
   - Convert `entrypoint: "file"` to current active file
   - Resolve `${workspaceFolder}` variables

3. **Provide defaults**
   - If launch.json missing, provide minimal default config
   - Set default values for optional fields

4. **Enhance configuration**
   - Add computed values (e.g., binary path if already known)
   - Merge with defaults

### Return Values

- **Valid config object** - Proceed with debug session
- **undefined** - Cancel debug session (invalid config)
- **null** - Use configuration as-is (no changes)

### Example Flow

**User's launch.json**:
```json
{
  "type": "fastedge",
  "request": "launch",
  "entrypoint": "workspace"
}
```

**Provider resolves to**:
```json
{
  "type": "fastedge",
  "request": "launch",
  "entrypoint": "/absolute/path/to/workspace",
  "port": 8181,
  "memoryLimit": 10000000,
  "dotenv": true
}
```

---

## Component 2: Debug Adapter Factory

**File**: `src/FastEdgeDebugAdapterDescriptorFactory.ts`

### Purpose

Creates debug adapter instances for each debug session.

### Interface

Implements `vscode.DebugAdapterDescriptorFactory`:
```typescript
class FastEdgeDebugAdapterDescriptorFactory
  implements vscode.DebugAdapterDescriptorFactory {

  createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    executable: vscode.DebugAdapterExecutable | undefined
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor>
}
```

### Key Responsibilities

1. **Create debug session instance**
   - Instantiate `FastEdgeDebugSession`

2. **Return inline adapter**
   - Wrap session in `DebugAdapterInlineImplementation`
   - Runs in extension host process (no separate process)

3. **Session isolation**
   - Each debug session gets its own instance
   - State is not shared between sessions

### Example Implementation

```typescript
createDebugAdapterDescriptor(session: vscode.DebugSession) {
  const debugSession = new FastEdgeDebugSession();
  return new vscode.DebugAdapterInlineImplementation(debugSession);
}
```

**Why inline?**
- Simpler deployment (no separate debug adapter binary)
- Faster communication (no IPC overhead)
- Easier debugging (same process)

---

## Component 3: Debug Session

**File**: `src/FastEdgeDebugSession.ts`

### Purpose

Implements the Debug Adapter Protocol to manage the debug lifecycle.

### Base Class

Extends `@vscode/debugadapter` `DebugSession`:
```typescript
class FastEdgeDebugSession extends DebugSession {
  // Override DAP request handlers
}
```

**Provided by `@vscode/debugadapter` package** (official VS Code debug adapter library)

### Key Methods

#### 1. `initializeRequest()`

**Called**: First request when debug session starts

**Purpose**:
- Respond with adapter capabilities
- Tell VS Code what features we support

**Response**:
```typescript
{
  supportsConfigurationDoneRequest: true,
  // Other capabilities (breakpoints, stepping, etc.) - false/not set
}
```

**FastEdge capabilities**:
- Supports launch (not attach)
- Does NOT support breakpoints
- Does NOT support stepping/pausing
- Does NOT support variable inspection

**Why limited capabilities?**
- FastEdge-run is a process runner, not a debugger
- WASM runs in edge runtime, not traditional debugger
- Focus is on local testing, not interactive debugging

#### 2. `launchRequest()`

**Called**: When user starts debugging (F5 or command)

**Purpose**:
- Compile code (Rust or JS)
- Launch FastEdge-run with WASM binary
- Stream output to debug console

**Flow**:
```typescript
async launchRequest(response, args) {
  try {
    // 1. Validate configuration
    // 2. Determine language (Rust or JS)
    // 3. Compile code to WASM
    // 4. Collect configuration (dotenv, env vars, etc.)
    // 5. Locate FastEdge-run CLI
    // 6. Build CLI arguments
    // 7. Spawn FastEdge-run process
    // 8. Stream stdout/stderr to debug console
    // 9. Handle process exit
    // 10. Send success response
  } catch (error) {
    // Send error response
    // Send terminated event
  }
}
```

**Compilation**:
- Uses `src/compiler/index.ts` to orchestrate
- Rust: `rustBuild.ts` - `cargo build --target wasm32-wasip1`
- JS: `jsBuild.ts` - `fastedge-build <input> <output>`

**Configuration collection**:
- Load dotenv files (if enabled) via `src/dotenv/index.ts`
- Merge with launch.json settings
- Build FastEdge-run arguments

**Process spawning**:
- Uses Node.js `child_process.spawn()`
- Captures stdout/stderr
- Sends output as DAP `output` events

**Output events**:
```typescript
this.sendEvent(new OutputEvent('Serving on http://localhost:8181\n', 'stdout'));
```

#### 3. `disconnectRequest()`

**Called**: When user stops debugging or session ends

**Purpose**:
- Terminate FastEdge-run process
- Clean up resources
- End debug session

**Flow**:
```typescript
async disconnectRequest(response, args) {
  // 1. Kill FastEdge-run process (if running)
  // 2. Clean up file watchers (if any)
  // 3. Send terminated event
  // 4. Send success response
}
```

**Process termination**:
- Uses `tree-kill` package to kill process tree
- Ensures child processes are also terminated
- Handles cases where process already exited

#### 4. `configurationDoneRequest()`

**Called**: After initialization complete, before launch

**Purpose**:
- Signal that configuration is finalized
- Debug session can proceed

**Current implementation**:
- Simple acknowledgment
- No special setup needed

---

## Debug Flow (Complete Lifecycle)

### 1. User Starts Debugging

**Trigger**: F5, Debug: Start Debugging, or command

### 2. Configuration Provider Validates

`BinaryDebugConfigurationProvider.resolveDebugConfiguration()`:
- Validate config
- Resolve entrypoint
- Provide defaults

### 3. Factory Creates Adapter

`FastEdgeDebugAdapterDescriptorFactory.createDebugAdapterDescriptor()`:
- Instantiate `FastEdgeDebugSession`
- Return inline adapter

### 4. Debug Session Initializes

DAP messages flow:
```
VS Code → initialize request
Debug Adapter → initialize response (capabilities)
VS Code → launch request
```

### 5. Launch Request Handling

`FastEdgeDebugSession.launchRequest()`:
- Compile code
- Collect configuration
- Launch FastEdge-run
- Stream output

**Console output appears**:
```
Compiling...
Build successful
Serving on http://localhost:8181
```

### 6. Process Runs

- FastEdge-run serves WASM application
- stdout/stderr streamed to debug console
- User can access app at localhost:8181

### 7. Process Ends

**Exit scenarios**:
- User stops debugging (Stop button)
- Process crashes or exits naturally
- Error during launch

**Handling**:
```typescript
process.on('exit', (code) => {
  this.sendEvent(new TerminatedEvent());
  this.sendEvent(new ExitedEvent(code));
});
```

### 8. Session Cleanup

`FastEdgeDebugSession.disconnectRequest()`:
- Kill process
- Send terminated event
- Close session

### 9. VS Code Updates UI

- Debug console shows exit code
- Debug toolbar disappears
- Extension ready for next session

---

## Configuration Arguments

**Launch.json configuration** is passed to `launchRequest()` as `args`:

```typescript
interface FastEdgeLaunchArgs {
  binary?: string;              // WASM binary path (auto-detected)
  cliPath?: string;             // FastEdge-run path (auto-detected)
  dotenv?: boolean | string;    // Dotenv support
  entrypoint?: string;          // "file" or "workspace"
  env?: Record<string, string>; // Environment variables
  secrets?: Record<string, string>;
  headers?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  port?: number;                // Default: 8181
  memoryLimit?: number;         // Default: 10000000
  geoIpHeaders?: boolean;
  traceLogging?: boolean;
  args?: string[];              // Additional CLI args
}
```

**Used to**:
- Determine compilation strategy
- Build FastEdge-run command line
- Configure runtime behavior

---

## FastEdge-run Integration

### Locating the CLI

**Bundled in extension**:
```
FastEdge-vscode/fastedge-cli/fastedge-run
```

**Resolution**:
```typescript
const cliPath = path.join(context.extensionPath, 'fastedge-cli', 'fastedge-run');
```

**Platform-specific**:
- Extension bundles correct binary for platform
- Windows: `fastedge-run.exe`
- macOS/Linux: `fastedge-run`

### Command Line Arguments

**Example command**:
```bash
fastedge-run \
  --wasm /path/to/app.wasm \
  --port 8181 \
  --memory-limit 10000000 \
  --env KEY=value \
  --secret API_KEY=secret \
  --req-header X-Custom=value \
  --rsp-header X-Custom=value
```

**Built from configuration**:
1. Required: `--wasm <binary-path>`
2. Optional: `--port`, `--memory-limit`
3. For each env var: `--env KEY=value`
4. For each secret: `--secret KEY=value`
5. For each header: `--req-header KEY=value`
6. For each response header: `--rsp-header KEY=value`
7. If geoIpHeaders: add sample geo headers
8. If traceLogging: add `--trace-logging`
9. Any additional args from `args[]`

### Output Parsing

**FastEdge-run output**:
```
[INFO] Compiling...
[INFO] Build successful
[INFO] Serving on http://localhost:8181
[REQUEST] GET / 200 45ms
[ERROR] Something went wrong
```

**Streamed to debug console**:
- stdout → console (white text)
- stderr → console (red text)
- No parsing/filtering currently

---

## Error Handling

### Compilation Errors

**If compilation fails**:
```typescript
try {
  const binary = await compile(config);
} catch (error) {
  this.sendEvent(new OutputEvent(`Compilation failed: ${error.message}\n`, 'stderr'));
  this.sendErrorResponse(response, {
    id: 1,
    format: 'Compilation failed',
    showUser: true
  });
  this.sendEvent(new TerminatedEvent());
  return;
}
```

**User sees**:
- Error in debug console
- Error notification
- Debug session ends

### Runtime Errors

**If FastEdge-run fails to start**:
```typescript
process.on('error', (error) => {
  this.sendEvent(new OutputEvent(`Failed to start: ${error.message}\n`, 'stderr'));
  this.sendEvent(new TerminatedEvent());
});
```

**User sees**:
- Error message in console
- Debug session terminates

### Process Crashes

**If FastEdge-run crashes**:
```typescript
process.on('exit', (code) => {
  if (code !== 0) {
    this.sendEvent(new OutputEvent(`Process exited with code ${code}\n`, 'stderr'));
  }
  this.sendEvent(new ExitedEvent(code));
  this.sendEvent(new TerminatedEvent());
});
```

**User sees**:
- Exit code in console
- Session ends

---

## Multiple Debug Sessions

**VS Code supports concurrent debug sessions**:
- Each gets its own `FastEdgeDebugSession` instance
- Each has its own FastEdge-run process
- Different ports must be used to avoid conflicts

**Current behavior**:
- Extension allows multiple sessions
- User must configure different ports in launch.json
- Otherwise, second session fails (port in use)

**Best practice**:
- Use different launch configurations with different ports
- Or stop first session before starting second

---

## Debugging the Debugger

**How to debug the debug adapter itself**:

1. Open FastEdge-vscode in VS Code
2. Set breakpoints in `FastEdgeDebugSession.ts`
3. Press F5 to launch Extension Development Host
4. In new window, open FastEdge project
5. Start debugging FastEdge app
6. Breakpoints hit in original window

**Extension runs in Extension Host**:
- Can debug with VS Code's debugger
- Console output shows debug adapter messages
- Can inspect DAP message flow

**Useful for**:
- Understanding DAP flow
- Debugging configuration issues
- Testing error handling

---

## Key Takeaways

1. **DAP is the standard** - VS Code debug protocol used by all debuggers
2. **Three components** - Provider, Factory, Session work together
3. **Inline adapter** - Runs in extension host for simplicity
4. **Limited capabilities** - Focus on process launching, not interactive debugging
5. **FastEdge-run is the runtime** - Adapter orchestrates compilation and execution
6. **Output events drive UI** - Debug console updated via events
7. **Error handling is critical** - Graceful failures with clear messages

---

**Related Documentation**:
- `EXTENSION_LIFECYCLE.md` - How adapter is registered
- `CONFIGURATION_SYSTEM.md` - How launch.json is processed
- `features/DEBUG_SESSION.md` - Implementation details
- `features/COMPILER_SYSTEM.md` - Compilation logic

---

**Last Updated**: February 2026
