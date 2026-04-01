# Commands - FastEdge VSCode Extension

This document describes all VS Code commands provided by the FastEdge extension and their implementations.

---

## Overview

The extension provides **4 commands** accessible via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

| Command | ID | File |
|---------|------|------|
| Debug: FastEdge App (Current File) | `fastedge.run-file` | `commands/runDebugger.ts` |
| Debug: FastEdge App (Package Entry) | `fastedge.run-workspace` | `commands/runDebugger.ts` |
| FastEdge (Generate mcp.json) | `fastedge.generate-mcp-json` | `commands/mcpJson.ts` |
| FastEdge (Setup Codespace Secrets) | `fastedge.setup-codespace-secret` | `commands/codespaceSecrets.ts` |

---

## Command Registration

**File**: `src/extension.ts`, `activate()`:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand("fastedge.run-file", runFile),
  vscode.commands.registerCommand("fastedge.run-workspace", runWorkspace),
  vscode.commands.registerCommand("fastedge.generate-mcp-json", () => createMCPJson(context)),
  vscode.commands.registerCommand("fastedge.setup-codespace-secret", () => setupCodespaceSecret(context)),
);
```

**All commands are disposable** - cleaned up on extension deactivation.

---

## 1. Debug: FastEdge App (Current File)

**Command**: `Debug: FastEdge App (Current File)`
**ID**: `fastedge.run-file`
**File**: `src/commands/runDebugger.ts`

### Purpose

Builds the **active editor file** as the WASM entry point, starts a per-app debugger server, and opens the debugger webview panel. Also triggered by F5 (default).

### Full Workflow

1. **Resolve app identity** — finds nearest `.fastedge-debug/` directory as `configRoot` (creates one at the active file's directory if none found)
2. **Build WASM** — compiles using active file as entry point; shows output in a "FastEdge Build" pseudoterminal (auto-closes after 3s on success, stays open on failure)
3. **Start debugger server** — lazy-starts a per-`configRoot` server on port 5179–5188; reuses existing server if healthy
4. **Open debugger webview** — polls `/api/client-count` until UI WebSocket connects (max 5s), then calls `POST /api/load` with the WASM path

### Behavior by Language

**Rust**: `cargo build --target wasm32-wasip1` from `buildRoot` (nearest `Cargo.toml`)

**JavaScript**: `npx fastedge-build <activeFile> <output.wasm>` from `buildRoot`

**AssemblyScript**: `asc assembly/index.ts` from `buildRoot`

### F5 Keybinding

Registered via `vscode.debug.registerDebugConfigurationProvider("fastedge", ...)`. If `launch.json` has `"entrypoint": "file"` (or no entrypoint), F5 triggers this command. Returns `undefined` to cancel the DAP session — the extension handles everything itself.

### Server Lifecycle

- Server starts automatically when this command runs
- Server stops automatically when the webview panel is closed
- Server also stops on extension deactivation

---

## 2. Debug: FastEdge App (Package Entry)

**Command**: `Debug: FastEdge App (Package Entry)`
**ID**: `fastedge.run-workspace`
**File**: `src/commands/runDebugger.ts`

### Purpose

Same workflow as `run-file`, but for **JavaScript only**: uses `package.json` `"main"` field as the build entry point instead of the active file. Rust and AssemblyScript builds are identical to `run-file`.

### When to Use

Use this when you're editing a helper file (e.g. `src/utils/headers.js`) but want to build from the declared package entry point (`src/index.js`) rather than the active file.

### Behavior by Language

**JavaScript**: `npx fastedge-build <package.json main> <output.wasm>` from `buildRoot`

**Rust / AssemblyScript**: Identical to `run-file` — `debugContext` is ignored.

### F5 Keybinding

To use this command via F5, add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "fastedge",
      "request": "launch",
      "name": "FastEdge App",
      "entrypoint": "package"
    }
  ]
}
```

The F5 handler also accepts `"entrypoint": "workspace"` for backward compatibility with older launch.json files.

---

## 3. Generate mcp.json

**Command**: `FastEdge (Generate mcp.json)`
**ID**: `fastedge.generate-mcp-json`
**File**: `src/commands/mcpJson.ts`

### Purpose

Adds FastEdge MCP (Model Context Protocol) server configuration to workspace for Claude Code integration.

### Generated Configuration

**`.mcp.json`** (workspace root):
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

If `.mcp.json` already exists, it reads the file, adds `fastedge-assistant`, and preserves other servers.

### User Experience

1. Run command from palette
2. Prompt for API token (password input)
3. If cancelled: exits
4. `.mcp.json` written (or updated)
5. Success message shown

---

## 4. Setup Codespace Secrets

**Command**: `FastEdge (Setup Codespace Secrets)`
**ID**: `fastedge.setup-codespace-secret`
**File**: `src/commands/codespaceSecrets.ts`

### Purpose

Configures FastEdge API credentials as GitHub Codespaces secrets for secure access.

### Prerequisites

- Running in GitHub Codespace
- GitHub CLI (`gh`) installed and authenticated

### Secrets Set

1. **FASTEDGE_API_TOKEN** — API authentication token
2. **FASTEDGE_API_URL** — API endpoint (optional, defaults to https://api.gcore.com)

### User Experience

1. Run command in Codespace
2. Prompt for API token (password input)
3. Prompt for API URL (optional)
4. Secrets saved to Codespace via `gh codespace secrets set`
5. Success message shown

### Edge Cases

**Not in Codespace**: Error — "This command only works in GitHub Codespaces"

**GitHub CLI not available**: Error from `gh` — suggest `sudo apt install gh`

**Not authenticated**: Error from `gh` — suggest `gh auth login`

---

## Command Patterns

### Error Handling

All commands follow:
```typescript
try {
  // Command logic
  vscode.window.showInformationMessage('Success');
} catch (error) {
  vscode.window.showErrorMessage(`Failed: ${(error as Error).message}`);
}
```

### Async/Await

All commands are async — allows non-blocking prompts, file I/O, process execution.

---

## Testing Commands

### Manual Testing

1. Open Extension Development Host (F5 in extension workspace)
2. Open a FastEdge project
3. Run command from palette
4. Verify behavior and output

### Programmatic Invocation

```typescript
await vscode.commands.executeCommand('fastedge.run-file');
```

---

## Key Takeaways

1. **Four commands** — Two debug runners + two setup helpers
2. **Auto-managed servers** — Debug commands start/stop the server automatically; no manual server control needed
3. **run-file vs run-workspace** — Differ only for JavaScript (active file vs `package.json` main); identical for Rust/AS
4. **F5 support** — Works via `fastedge` debug config provider; `launch.json` optional (only needed to switch F5 to package-entry mode)
5. **Per-app isolation** — Each app folder gets its own server and debugger panel

---

**Related Documentation**:
- `EXTENSION_LIFECYCLE.md` - Command registration
- `DEBUGGER_ARCHITECTURE.md` - How run commands trigger debugging
- `BUNDLED_DEBUGGER.md` - Server lifecycle and architecture

---

**Last Updated**: March 17, 2026
