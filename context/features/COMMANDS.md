# Commands - FastEdge VSCode Extension

This document describes all VS Code commands provided by the FastEdge extension and their implementations.

---

## Overview

The extension provides **8 commands** accessible via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

| Command | ID | File |
|---------|------|------|
| FastEdge (Generate launch.json) | `fastedge.generate-launch-json` | `commands/launchJson.ts` |
| FastEdge (Generate mcp.json) | `fastedge.generate-mcp-json` | `commands/mcpJson.ts` |
| Debug: FastEdge App (Current File) | `fastedge.run-file` | `commands/runDebugger.ts` |
| Debug: FastEdge App (Workspace) | `fastedge.run-workspace` | `commands/runDebugger.ts` |
| FastEdge (Setup Codespace Secrets) | `fastedge.setup-codespace-secret` | `commands/codespaceSecrets.ts` |
| FastEdge: Start Debugger Server | `fastedge.start-debugger-server` | `extension.ts` |
| FastEdge: Stop Debugger Server | `fastedge.stop-debugger-server` | `extension.ts` |
| FastEdge: Debug Application | `fastedge.debug-app` | `extension.ts` |

---

## Command Registration

**File**: `src/commands/index.ts`

**Registered in** `activate()`:
```typescript
import * as vscode from 'vscode';
import { generateLaunchJson } from './launchJson';
import { generateMcpJson } from './mcpJson';
import { runFile, runWorkspace } from './runDebugger';
import { setupCodespaceSecrets } from './codespaceSecrets';

export function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('fastedge.generate-launch-json', generateLaunchJson),
    vscode.commands.registerCommand('fastedge.generate-mcp-json', generateMcpJson),
    vscode.commands.registerCommand('fastedge.run-file', runFile),
    vscode.commands.registerCommand('fastedge.run-workspace', runWorkspace),
    vscode.commands.registerCommand('fastedge.setup-codespace-secret', setupCodespaceSecrets),
    vscode.commands.registerCommand('fastedge.start-debugger-server', startDebuggerServer),
    vscode.commands.registerCommand('fastedge.stop-debugger-server', stopDebuggerServer),
    vscode.commands.registerCommand('fastedge.debug-app', debugFastEdgeApp)
  );
}
```

**All commands are disposable** - cleaned up on extension deactivation

---

## 1. Generate launch.json

**Command**: `FastEdge (Generate launch.json)`
**ID**: `fastedge.generate-launch-json`
**File**: `src/commands/launchJson.ts`

### Purpose

Creates `.vscode/launch.json` file with default FastEdge debug configuration.

### Implementation

```typescript
export async function generateLaunchJson() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
  const launchPath = path.join(vscodeDir, 'launch.json');

  // Check if already exists
  if (fs.existsSync(launchPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      'launch.json already exists. Overwrite?',
      'Yes', 'No'
    );
    if (overwrite !== 'Yes') {
      return;
    }
  }

  // Create .vscode directory
  fs.mkdirSync(vscodeDir, { recursive: true });

  // Write launch.json
  const config = {
    version: '0.2.0',
    configurations: [
      {
        type: 'fastedge',
        request: 'launch',
        name: 'FastEdge App',
        env: {}
      }
    ]
  };

  fs.writeFileSync(launchPath, JSON.stringify(config, null, 2));

  // Open file
  const doc = await vscode.workspace.openTextDocument(launchPath);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage('Created launch.json');
}
```

### Generated File

**`.vscode/launch.json`**:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "fastedge",
      "request": "launch",
      "name": "FastEdge App",
      "env": {}
    }
  ]
}
```

**Minimal configuration** - user can add additional properties:
- `port`, `memoryLimit`
- `dotenv`, `secrets`, `headers`
- `geoIpHeaders`, `traceLogging`
- See `CONFIGURATION_SYSTEM.md` for all options

### User Experience

1. User runs command from palette
2. If no workspace: Error shown
3. If launch.json exists: Confirmation prompt
4. `.vscode/` directory created (if needed)
5. `launch.json` created with defaults
6. File opened in editor
7. Success message shown

### Edge Cases

**No workspace open**:
- Show error: "No workspace folder open"
- Command exits

**launch.json exists**:
- Prompt: "launch.json already exists. Overwrite?"
- If "No": Command exits (no changes)
- If "Yes": Overwrite with defaults

**Multiple workspace folders**:
- Uses first workspace folder
- Future: Could prompt user to select folder

---

## 2. Generate mcp.json

**Command**: `FastEdge (Generate mcp.json)`
**ID**: `fastedge.generate-mcp-json`
**File**: `src/commands/mcpJson.ts`

### Purpose

Adds FastEdge MCP (Model Context Protocol) server configuration to workspace for Claude Code integration.

### Implementation

```typescript
export async function generateMcpJson() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  // Prompt for API token
  const token = await vscode.window.showInputBox({
    prompt: 'Enter your FastEdge API token',
    password: true,
    placeHolder: 'paste-your-token-here'
  });

  if (!token) {
    return; // User cancelled
  }

  // Get API URL (from settings or default)
  const apiUrl = vscode.workspace.getConfiguration('fastedge').get('apiUrl', 'https://api.gcore.com');

  const claudeDir = path.join(workspaceFolder.uri.fsPath, '.claude');
  const mcpPath = path.join(claudeDir, 'mcp.json');

  // Read existing or create new
  let mcpConfig: any = { mcpServers: {} };
  if (fs.existsSync(mcpPath)) {
    mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  }

  // Add FastEdge server
  mcpConfig.mcpServers['fastedge-assistant'] = {
    command: 'npx',
    args: ['-y', '@gcoredev/fastedge-mcp-server'],
    env: {
      FASTEDGE_API_TOKEN: token,
      FASTEDGE_API_URL: apiUrl
    }
  };

  // Create .claude directory
  fs.mkdirSync(claudeDir, { recursive: true });

  // Write mcp.json
  fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2));

  vscode.window.showInformationMessage('Added FastEdge MCP server to .claude/mcp.json');
}
```

### Generated Configuration

**`.claude/mcp.json`**:
```json
{
  "mcpServers": {
    "fastedge-assistant": {
      "command": "npx",
      "args": ["-y", "@gcoredev/fastedge-mcp-server"],
      "env": {
        "FASTEDGE_API_TOKEN": "user-provided-token",
        "FASTEDGE_API_URL": "https://api.gcore.com"
      }
    }
  }
}
```

**If mcp.json exists**:
- Reads existing configuration
- Adds `fastedge-assistant` server
- Preserves other servers

### User Experience

1. User runs command from palette
2. If no workspace: Error shown
3. Prompt for API token (password input)
4. If cancelled: Command exits
5. `.claude/` directory created (if needed)
6. MCP server config added to mcp.json
7. Success message shown

### FastEdge MCP Server

**Package**: `@gcoredev/fastedge-mcp-server`
**Repository**: [FastEdge-mcp-server](https://github.com/G-Core/FastEdge-mcp-server)

**Provides**:
- Claude Code integration
- FastEdge API access
- Application management
- Deployment capabilities

---

## 3. Debug: FastEdge App (Current File)

**Command**: `Debug: FastEdge App (Current File)`
**ID**: `fastedge.run-file`
**File**: `src/commands/runDebugger.ts`

### Purpose

Starts debug session using **current active file** as entrypoint.

### Implementation

```typescript
export async function runFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active file');
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('File not in workspace');
    return;
  }

  const config: vscode.DebugConfiguration = {
    type: 'fastedge',
    request: 'launch',
    name: 'FastEdge App (Current File)',
    entrypoint: 'file'
  };

  await vscode.debug.startDebugging(workspaceFolder, config);
}
```

### Behavior

**Rust projects**:
- Uses current file location as CWD
- Walks up to find `Cargo.toml`
- Runs `cargo build` from Cargo.toml directory

**JavaScript projects**:
- Uses current file as entrypoint
- Compiles: `fastedge-build current-file.js output.wasm`
- Quick iteration on single files

### User Experience

1. User opens a file (Rust or JS)
2. User runs command from palette
3. Debug session starts immediately
4. Code compiled using current file as entrypoint
5. Application runs on localhost:8181

### Edge Cases

**No active file**:
- Show error: "No active file"
- Command exits

**File not in workspace**:
- Show error: "File not in workspace"
- Command exits

**launch.json exists**:
- Programmatic config overrides launch.json
- Can coexist with launch.json configurations

---

## 4. Debug: FastEdge App (Workspace)

**Command**: `Debug: FastEdge App (Workspace)`
**ID**: `fastedge.run-workspace`
**File**: `src/commands/runDebugger.ts`

### Purpose

Starts debug session using **workspace root** as entrypoint.

### Implementation

```typescript
export async function runWorkspace() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return;
  }

  const config: vscode.DebugConfiguration = {
    type: 'fastedge',
    request: 'launch',
    name: 'FastEdge App (Workspace)',
    entrypoint: 'workspace'
  };

  await vscode.debug.startDebugging(workspaceFolder, config);
}
```

### Behavior

**Rust projects**:
- Uses workspace root as CWD
- Looks for `Cargo.toml` at workspace root
- Standard Rust project build

**JavaScript projects**:
- Uses workspace root as CWD
- Reads `package.json` "main" field for entrypoint
- Compiles: `fastedge-build main-entry output.wasm`

### User Experience

1. User has workspace open
2. User runs command from palette
3. Debug session starts immediately
4. Project compiled from workspace root
5. Application runs on localhost:8181

### Edge Cases

**No workspace open**:
- Show error: "No workspace folder open"
- Command exits

**Multiple workspace folders**:
- Uses first workspace folder
- Future: Could prompt user to select

---

## 5. Setup Codespace Secrets

**Command**: `FastEdge (Setup Codespace Secrets)`
**ID**: `fastedge.setup-codespace-secret`
**File**: `src/commands/codespaceSecrets.ts`

### Purpose

Configures FastEdge API credentials as GitHub Codespaces secrets for secure access.

### Implementation

```typescript
export async function setupCodespaceSecrets() {
  // Check if running in Codespace
  if (!process.env.CODESPACES) {
    vscode.window.showErrorMessage('This command only works in GitHub Codespaces');
    return;
  }

  // Prompt for API token
  const token = await vscode.window.showInputBox({
    prompt: 'Enter your FastEdge API token',
    password: true
  });

  if (!token) {
    return;
  }

  // Prompt for API URL (optional)
  const apiUrl = await vscode.window.showInputBox({
    prompt: 'Enter FastEdge API URL (optional)',
    value: 'https://api.gcore.com'
  });

  try {
    // Use GitHub CLI to set secrets
    await execAsync(`gh codespace secrets set FASTEDGE_API_TOKEN -b "${token}"`);

    if (apiUrl) {
      await execAsync(`gh codespace secrets set FASTEDGE_API_URL -b "${apiUrl}"`);
    }

    vscode.window.showInformationMessage('Codespace secrets configured successfully');
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to set secrets: ${error.message}`);
  }
}
```

### Prerequisites

**Must have**:
- Running in GitHub Codespace
- GitHub CLI (`gh`) installed
- Authenticated with GitHub

### Secrets Set

1. **FASTEDGE_API_TOKEN** - API authentication token
2. **FASTEDGE_API_URL** - API endpoint (optional, defaults to https://api.gcore.com)

**Available in**:
- Terminal sessions
- VS Code tasks
- Extension runtime
- MCP server

### User Experience

1. User runs command in Codespace
2. Prompts for API token (password input)
3. Prompts for API URL (optional)
4. Secrets saved to Codespace
5. Success message shown

### Edge Cases

**Not in Codespace**:
- Show error: "This command only works in GitHub Codespaces"
- Command exits

**GitHub CLI not available**:
- Show error: "GitHub CLI not found"
- Suggest: `sudo apt install gh`

**Not authenticated**:
- Show error from `gh` CLI
- Suggest: `gh auth login`

---

## 6. Start Debugger Server

**Command**: `FastEdge: Start Debugger Server`
**ID**: `fastedge.start-debugger-server`
**File**: `src/extension.ts`

### Purpose

Manually start the bundled debugger server process.

### Implementation

```typescript
async function startDebuggerServer() {
  if (!debuggerServerManager) {
    vscode.window.showErrorMessage(
      "Debugger not available. Extension may not be installed correctly."
    );
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Starting FastEdge Debugger Server...",
        cancellable: false,
      },
      async () => {
        await debuggerServerManager.start();
      }
    );

    vscode.window.showInformationMessage(
      `FastEdge Debugger server started on port ${debuggerServerManager.getPort()}`
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to start debugger server: ${error.message}`
    );
  }
}
```

### Behavior

1. Checks if `debuggerServerManager` is initialized
2. Shows progress notification during startup
3. Forks bundled server process using VSCode's Node.js
4. Server listens on `localhost:5179`
5. Shows success message with port number

### User Experience

1. User runs command from palette
2. Progress notification appears: "Starting FastEdge Debugger Server..."
3. Server starts in background (separate process)
4. Success message: "FastEdge Debugger server started on port 5179"
5. Server is now accessible at `http://localhost:5179`

### Edge Cases

**Server already running**:
- Command succeeds (no-op)
- Shows "server started" message even if already running

**Port 5179 in use**:
- Server fails to start
- Error message shown: "Failed to start debugger server: Port 5179 already in use"
- User must stop conflicting process

**Extension not initialized**:
- Shows error: "Debugger not available. Extension may not be installed correctly."
- Indicates extension activation failed

### When to Use

- Before using debugger features
- When debugger server crashed and needs restart
- When explicitly wanting server accessible before opening UI

**Note**: The "FastEdge: Debug Application" command auto-starts the server if not running, so manual start is optional.

---

## 7. Stop Debugger Server

**Command**: `FastEdge: Stop Debugger Server`
**ID**: `fastedge.stop-debugger-server`
**File**: `src/extension.ts`

### Purpose

Manually stop the running debugger server process.

### Implementation

```typescript
async function stopDebuggerServer() {
  if (!debuggerServerManager) {
    vscode.window.showWarningMessage("Debugger server is not configured");
    return;
  }

  try {
    await debuggerServerManager.stop();
    vscode.window.showInformationMessage("FastEdge Debugger server stopped");
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to stop debugger server: ${error.message}`
    );
  }
}
```

### Behavior

1. Checks if `debuggerServerManager` is initialized
2. Calls `debuggerServerManager.stop()`
3. Sends SIGTERM to server process
4. Waits for graceful shutdown
5. Shows success message

### User Experience

1. User runs command from palette
2. Server process receives termination signal
3. Server closes connections and cleans up
4. Process exits
5. Success message: "FastEdge Debugger server stopped"

### Edge Cases

**Server not running**:
- Command succeeds (no-op)
- Shows success message even if server wasn't running

**Server hangs during shutdown**:
- Timeout after reasonable period (e.g., 5 seconds)
- Force kill server process
- Error message shown if force kill fails

**Extension not initialized**:
- Shows warning: "Debugger server is not configured"
- No action taken

### When to Use

- Free up port 5179 for other uses
- Stop server to conserve resources
- Before restarting server with different configuration
- Debugging server issues (stop and restart)

---

## 8. Debug Application

**Command**: `FastEdge: Debug Application`
**ID**: `fastedge.debug-app`
**File**: `src/extension.ts`

### Purpose

Open the debugger webview UI, optionally building the current file to WASM first.

### Implementation

```typescript
async function debugFastEdgeApp() {
  if (!debuggerWebviewProvider) {
    vscode.window.showErrorMessage(
      "Debugger not available. Extension may not be installed correctly."
    );
    return;
  }

  try {
    // Get active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active file to debug");
      return;
    }

    // Prompt for build mode
    const shouldBuild = await vscode.window.showQuickPick(
      [
        {
          label: "Build and Debug",
          description: "Compile to WASM and load into debugger",
          build: true,
        },
        {
          label: "Debug Only",
          description: "Open debugger without building",
          build: false,
        },
      ],
      { placeHolder: "Choose debug mode" }
    );

    if (!shouldBuild) {
      return; // User cancelled
    }

    let wasmPath: string | undefined;

    if (shouldBuild.build) {
      // Prompt for WASM file (build integration TODO)
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        filters: { 'WASM Files': ['wasm'] },
        title: 'Select WASM file to debug'
      });

      if (result && result[0]) {
        wasmPath = result[0].fsPath;
      }
    }

    // Ensure server is running
    if (debuggerServerManager && !debuggerServerManager.isRunning()) {
      await debuggerServerManager.start();
    }

    // Show webview
    await debuggerWebviewProvider.show(wasmPath);

  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to start debugger: ${error.message}`
    );
  }
}
```

### Behavior

1. Checks if active file is open
2. Prompts user to choose mode:
   - **Build and Debug**: Compile to WASM first
   - **Debug Only**: Just open debugger UI
3. If "Build and Debug": Prompts for WASM file path
4. Auto-starts server if not running
5. Opens webview panel with debugger UI
6. Optionally pre-loads WASM file

### User Experience

1. User runs command from palette
2. Quick pick appears: "Build and Debug" vs "Debug Only"
3. If building: File picker for WASM binary
4. Server starts automatically (if not running)
5. Webview panel opens with React debugging UI
6. If WASM provided: Auto-loaded into debugger
7. User can execute requests and view results

### Edge Cases

**No active file**:
- Error: "No active file to debug"
- Command exits

**User cancels quick pick**:
- Command exits silently (no error)

**User cancels file picker**:
- Debugger opens without pre-loaded WASM
- User can manually load WASM through UI

**Server fails to start**:
- Error message shown
- Webview not opened

**WASM load fails**:
- Webview still opens
- Error shown in debugger UI
- User can try loading different WASM

### When to Use

- **Primary debug workflow**: Quick access to visual debugger
- **After compiling**: Load fresh WASM into debugger
- **Testing changes**: Build → Debug → Test loop
- **Inspecting WASM**: Examine requests/responses visually

### Future Enhancements

**Planned**:
- Auto-detect WASM output path from workspace
- Integrate with compiler system (auto-build before debug)
- Remember last used WASM path
- Support launch.json configuration integration

---

## Command Patterns

### Error Handling

**All commands follow**:
```typescript
try {
  // Command logic
  vscode.window.showInformationMessage('Success');
} catch (error) {
  vscode.window.showErrorMessage(`Failed: ${error.message}`);
}
```

**User-friendly messages**:
- Clear, actionable error descriptions
- Suggest solutions when possible
- Log detailed errors to console

### User Input

**Input boxes**:
```typescript
const value = await vscode.window.showInputBox({
  prompt: 'Enter value',
  placeHolder: 'example',
  password: false  // true for secrets
});

if (!value) {
  return;  // User cancelled
}
```

**Confirmation prompts**:
```typescript
const choice = await vscode.window.showWarningMessage(
  'Are you sure?',
  'Yes', 'No'
);

if (choice !== 'Yes') {
  return;
}
```

### File Operations

**Safe writes**:
1. Check if file exists
2. Prompt for confirmation if overwriting
3. Create parent directories (`recursive: true`)
4. Write file
5. Open in editor (if appropriate)
6. Show success message

### Async/Await

**All commands are async**:
```typescript
vscode.commands.registerCommand('command-id', async () => {
  // Async operations
  await something();
});
```

**Allows**:
- Non-blocking user prompts
- File I/O operations
- Process execution
- API calls

---

## Testing Commands

### Manual Testing

1. Open Extension Development Host (F5)
2. Open test workspace
3. Run command from palette
4. Verify behavior and output

### Command Invocation

**Programmatic**:
```typescript
await vscode.commands.executeCommand('fastedge.generate-launch-json');
```

**Useful for**:
- Testing from extension code
- Automation scripts
- Integration tests

---

## Key Takeaways

1. **Eight commands** - Configuration generators, debug runners, and debugger controls
2. **Command Palette** - All accessible via Ctrl+Shift+P
3. **User-friendly** - Clear prompts, error messages, confirmations
4. **Safe operations** - Check conditions, prompt before overwriting
5. **Async** - Non-blocking, responsive UI
6. **Integrated** - Work together with debugger and development workflow
7. **Debugger commands** - New webview-based debugging (Feb 2026)

---

**Related Documentation**:
- `EXTENSION_LIFECYCLE.md` - Command registration
- `DEBUGGER_ARCHITECTURE.md` - How run commands trigger debugging
- `CONFIGURATION_SYSTEM.md` - launch.json structure
- `MCP_INTEGRATION.md` - MCP server details

---

**Last Updated**: February 11, 2026
