# FastEdge VSCode Extension

A VS Code extension for building, running, and debugging Gcore FastEdge applications — with a Postman-like interface for crafting requests and inspecting responses.

Supports both **HTTP apps** and **CDN apps** across three languages:

<div>
  <img width=50px src="https://www.rust-lang.org/logos/rust-logo-64x64.png" alt="Rust">&nbsp;
  <img width=50px src="https://raw.githubusercontent.com/github/explore/80688e429a7d4ef2fca1e82350fe8e3517d3494d/topics/javascript/javascript.png" alt="JavaScript">&nbsp;
  <img width=50px src="https://avatars.githubusercontent.com/u/28916798?s=200&v=4" alt="AssemblyScript">&nbsp;
</div>

| App Type | Languages | SDK |
|----------|-----------|-----|
| **HTTP** | Rust, JavaScript | [FastEdge-sdk-rust](https://github.com/G-Core/FastEdge-sdk-rust), [FastEdge-sdk-js](https://github.com/G-Core/FastEdge-sdk-js) |
| **CDN** | Rust, AssemblyScript | [proxy-wasm-sdk-rust](https://github.com/proxy-wasm/proxy-wasm-rust-sdk), [proxy-wasm-sdk-as](https://github.com/G-Core/proxy-wasm-sdk-as) |

## How it works

The extension compiles your code into a WASM binary using language-specific build tools, then serves it locally using a **bundled debugger** — no external tools required.

A webview panel opens inside VS Code where you can:
- Build requests (URL, method, headers, body)
- Send them to your running app
- Inspect the response (status, headers, body)
- Load and save test configurations

Each app gets its own isolated server instance on a port in the range **5179–5188**, so you can debug multiple apps in the same workspace simultaneously.

## Prerequisites

You need the build tools for your chosen language installed:

**Rust** (HTTP or CDN apps):
```bash
rustup target add wasm32-wasip1
```

**JavaScript** (HTTP apps):
```bash
npm install --save-dev @gcoredev/fastedge-sdk-js
```

**AssemblyScript** (CDN apps):
```bash
npm install --save-dev assemblyscript @assemblyscript/wasi-shim @gcoredev/proxy-wasm-sdk-as
```

More detail can be found in the SDK documentation linked above.

## Installing the extension

This extension can be installed from the Visual Studio Marketplace: [FastEdge Launcher](https://marketplace.visualstudio.com/items?itemName=G-CoreLabsSA.fastedge)

It is also possible to install from source: [Releases](https://github.com/G-Core/FastEdge-vscode/releases)

## Running your first application

Press **F5** in VS Code (or Command Palette → `Debug: Start Debug`).

When running for the first time, you'll need a `.vscode/launch.json`. The easiest way is to let the extension create one:

Command Palette (Ctrl+Shift+P) → `FastEdge: Initialize workspace (create launch.json)`

#### Example launch.json

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "FastEdge App Runner: Launch",
      "type": "fastedge",
      "request": "launch",
      "entrypoint": "file"
    }
  ]
}
```

The `entrypoint` field controls how the build finds your source code:

| Value | Behavior |
|-------|----------|
| `"file"` (default) | Builds the currently active editor file |
| `"package"` | Builds from the `"main"` field in `package.json` (JavaScript only) |

These are the only configuration values read from launch.json. Runtime arguments (env vars, headers, etc.) are configured separately — see [Runtime Configuration](#runtime-configuration) below.

## Language detection

The extension auto-detects your project language:

| Indicator | Detected as |
|-----------|-------------|
| VS Code language ID = `rust` | **Rust** |
| `asconfig.json` exists at project root | **AssemblyScript** |
| JS/TS file without `asconfig.json` | **JavaScript** |

## Commands

Available from the Command Palette (Ctrl+Shift+P):

| Command | Description |
|---------|-------------|
| **Debug: FastEdge App (Current File)** | Build the active file and start the debugger |
| **Debug: FastEdge App (Package Entry)** | Build from `package.json` main field and start the debugger |
| **FastEdge: Initialize workspace** | Create `.vscode/launch.json` with default configuration |
| **FastEdge (Generate mcp.json)** | Add the [FastEdge MCP Server](https://github.com/G-Core/FastEdge-mcp-server) to your workspace |
| **FastEdge (Setup Codespace Secrets)** | Configure GitHub Codespaces secrets for FastEdge |

#### Explorer context menu

Right-click actions in the file explorer:

| Command | Appears on | Description |
|---------|-----------|-------------|
| **FastEdge: Load in Debugger** | `.wasm` files | Load a pre-compiled WASM binary directly into the debugger |
| **FastEdge: Load Config in Debugger** | `*test.json` files | Load a test configuration file into the debugger |

## Runtime Configuration

Environment variables, secrets, request headers, and response headers are configured through **test configuration files** — not launch.json.

### Primary: `fastedge-config.test.json`

The debugger UI provides built-in controls to set environment variables, secrets, and headers. These are saved to and loaded from `fastedge-config.test.json` in your app root, using native file dialogs.

### Alternative: dotenv files

You can also provide runtime arguments via `.env` files that the extension auto-discovers from your app root directory.

Please be aware that if you are adding **sensitive** information to these files, they should be added to your `.gitignore`:

```
# VSCode workspace
.vscode/

# dotenv files
.env
.env.*

# Build artifacts
.fastedge/
```

For more information on how the extension locates and uses dotenv files, see [DOTENV.md](https://github.com/G-Core/FastEdge-vscode/blob/main/DOTENV.md).

## Settings

| Setting | Description |
|---------|-------------|
| `fastedge.cliVersion` | The version of the bundled debugger (read-only) |
| `fastedge.apiUrl` | Default FastEdge API URL for MCP server configuration |

To view the bundled debugger version:
1. Open Settings (Ctrl+, or Cmd+,)
2. Search for "FastEdge"
