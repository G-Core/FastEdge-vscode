# Commands - FastEdge VSCode Extension

This document describes all VS Code commands provided by the FastEdge extension and their implementations.

---

## Overview

The extension provides **5 commands** accessible via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

| Command | ID | File |
|---------|------|------|
| FastEdge (Generate launch.json) | `fastedge.generate-launch-json` | `commands/launchJson.ts` |
| FastEdge (Generate mcp.json) | `fastedge.generate-mcp-json` | `commands/mcpJson.ts` |
| Debug: FastEdge App (Current File) | `fastedge.run-file` | `commands/runDebugger.ts` |
| Debug: FastEdge App (Workspace) | `fastedge.run-workspace` | `commands/runDebugger.ts` |
| FastEdge (Setup Codespace Secrets) | `fastedge.setup-codespace-secret` | `commands/codespaceSecrets.ts` |

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
    vscode.commands.registerCommand('fastedge.setup-codespace-secret', setupCodespaceSecrets)
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

1. **Five commands** - launch.json, mcp.json, run-file, run-workspace, codespace-secrets
2. **Command Palette** - All accessible via Ctrl+Shift+P
3. **User-friendly** - Clear prompts, error messages, confirmations
4. **Safe operations** - Check conditions, prompt before overwriting
5. **Async** - Non-blocking, responsive UI
6. **Integrated** - Work together with debug system

---

**Related Documentation**:
- `EXTENSION_LIFECYCLE.md` - Command registration
- `DEBUGGER_ARCHITECTURE.md` - How run commands trigger debugging
- `CONFIGURATION_SYSTEM.md` - launch.json structure
- `MCP_INTEGRATION.md` - MCP server details

---

**Last Updated**: February 2026
