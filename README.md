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
- Build requests (URL, method, headers, body) and send them to your app
- Inspect the response, and for CDN apps what each hook received and changed
- Use a local cache and Edge KV, browse and edit them in the Storage Explorer
- Choose where the request comes from and which edge location runs the app
- Run several CDN apps on one resource (multi-app), with rules and an origin
- Load and save test configurations

![The debugger with a CDN app reading Edge KV](https://raw.githubusercontent.com/G-Core/fastedge-test/main/docs/images/debugger-single-app.png)

The [Debugger Guide](https://github.com/G-Core/fastedge-test/blob/main/docs/DEBUGGER_GUIDE.md) walks through every panel.

Each app gets its own debugger panel and server. An app is the nearest folder above your file that holds `.fastedge-debug/`, `package.json` or `Cargo.toml` (searching no higher than the folder you opened); a loose `.wasm` with none of these gets its own folder. That folder is the **app root**: the debugger keeps its own files in `.fastedge-debug/` there and reads your dotenv files from it. Servers take the first free port from **5179** (up to 5228), so you can debug several apps at once.

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
| `"package"` | Builds the project. JavaScript projects with `.fastedge/build-config.js` and `@gcoredev/fastedge-sdk-js` 2.7.0 or later are built from that config; otherwise from the `"main"` field in `package.json` (JavaScript only) |

Static sites and apps that import Wasm components need steps that only a build from `.fastedge/build-config.js` runs, so debug them with `"package"`, or press F5 with `package.json` open. `"file"` still builds just the active file, for example a small app inside a larger project.

These are the only configuration values read from launch.json. Environment variables, secrets and headers are set elsewhere: see [Variables, secrets and headers](#variables-secrets-and-headers).

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
| **Debug: FastEdge App (Package Entry)** | Build the project (see `"package"` above) and start the debugger |
| **FastEdge: Initialize workspace** | Create `.vscode/launch.json` with default configuration |
| **FastEdge (Generate mcp.json)** | Add the [FastEdge MCP Server](https://github.com/G-Core/FastEdge-mcp-server) to your workspace (see [AI agents (MCP)](#ai-agents-mcp)) |
| **FastEdge (Setup Codespace Secrets)** | Configure GitHub Codespaces secrets for FastEdge |

#### Explorer context menu

Right-click actions in the file explorer:

| Command | Appears on | Description |
|---------|-----------|-------------|
| **FastEdge: Load in Debugger** | `.wasm` files | Load a pre-compiled WASM binary directly into the debugger |
| **FastEdge: Load Config in Debugger** | `*test.json` files | Load a test configuration file into the debugger |

## AI agents (MCP)

**FastEdge (Generate mcp.json)** adds the FastEdge MCP server to `.vscode/mcp.json` (Docker required). It asks how the server reaches your Gcore account:

- **Sign in with your Gcore account** (recommended): no key goes into `mcp.json`. On the first API call your agent offers to sign you in: you approve in your browser in the Gcore portal, and the MCP server gets a time-limited API token (8 hours by default, 7 days at most). The server's token broker holds it; the agent never sees it. The token is cached as plaintext in the `fastedge-session` Docker volume until it expires. Inside the container only the MCP server's token broker can read it, but anyone who can run Docker containers on this machine can read it too. To keep this sign-in's token unusable on disk instead, choose **Only for this MCP server session** on the approval page: the token is then encrypted to the running MCP server and you approve again the next time it starts. A session saved earlier with "Keep me signed in" stays usable until it expires or you sign out. The volume is shared with the FastEdge plugins for Claude Code, Codex and Cursor, so signing in once covers them all.
- **Use an API key**: the existing flow. The key is written to `mcp.json` (or, in Codespaces, read from a Codespace secret), so keep the file out of version control. The project folder is mounted into the MCP server's container, so the project's own build scripts (npm, cargo) can read that file too; managing the key's security is up to you.

In Codespaces or other remote setups the browser sign-in may not reach the container; use an API key there.

## Variables, secrets and headers

The debugger panel is the [fastedge-test](https://github.com/G-Core/fastedge-test) debugger, and its [Debugger Guide](https://github.com/G-Core/fastedge-test/blob/main/docs/DEBUGGER_GUIDE.md) is the reference. **Help** in the panel's header links to common tasks, in the docs for the version bundled with this extension.

![The Help menu: links to common tasks in the docs](https://raw.githubusercontent.com/G-Core/fastedge-test/main/docs/images/debugger-help.png)

- **Environment variables and secrets:** dotenv files in the app root (`.env`, `.env.variables`, `.env.secrets`). The extension loads apps with dotenv on. See [Dotenv Configuration](https://github.com/G-Core/fastedge-test/blob/main/docs/TEST_CONFIG.md#dotenv-configuration) for the file rules and secret slots.
- **Request headers:** the **Request** panel. HTTP apps can also take fixed headers from `.env.req_headers` and `.env.rsp_headers`.
- **Scenarios:** **Save Config** writes the request, context and settings to a `*test.json`. Load it again with **FastEdge: Load Config in Debugger**, or run it in a test.

Keep files with secrets out of version control:

```
# VSCode workspace
.vscode/

# dotenv files
.env
.env.*

# Build artifacts
.fastedge-debug/
```

## Settings

| Setting | Description |
|---------|-------------|
| `fastedge.cliVersion` | The version of the bundled debugger (read-only) |
| `fastedge.apiUrl` | Gcore API origin for the generated MCP config (advanced; leave at the default) |
| `fastedge.debugger.allowedFolders` | Folders outside the workspace the debugger may read (never write), such as a folder of prebuilt `.wasm` apps. User settings only. The first time the debugger reads one, VS Code asks whether to allow it for that debugger session; the debugger page lists them, with an **Ask to read it** button to approve one up front. Keep the list narrow: an allowed folder is readable by every config loaded in that session, including one from a repository you just cloned. Never list your home folder or a folder holding secrets. |

To view the bundled debugger version:
1. Open Settings (Ctrl+, or Cmd+,)
2. Search for "FastEdge"
