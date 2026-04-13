# FastEdge VSCode Extension - Project Overview

## What is FastEdge VSCode Extension?

The **FastEdge VSCode Extension** is a development tool that enables developers to build, debug, and run FastEdge applications directly within Visual Studio Code. It provides a seamless development experience for building edge computing applications in Rust and JavaScript.

### Key Value Proposition

- **Integrated Debugging**: Use VS Code's native debug interface (F5) to run FastEdge apps
- **Multi-Language Support**: Build and debug Rust, JavaScript, and AssemblyScript applications
- **Local Development**: Test edge applications locally before deployment
- **Bundled Debugger**: Zero-setup — debugger server and UI are bundled with the extension
- **MCP Integration**: Generate Model Context Protocol server configurations

---

## Supported Languages

### Rust
- **SDK**: [FastEdge-sdk-rust](https://github.com/G-Core/FastEdge-sdk-rust)
- **Build Tool**: `cargo build --target wasm32-wasip1`
- **Requirements**: `rustup target add wasm32-wasip1`
- **Output**: WASM binary from Cargo.toml configuration

### JavaScript/TypeScript
- **SDK**: [FastEdge-sdk-js](https://github.com/G-Core/FastEdge-sdk-js)
- **Build Tool**: `fastedge-build` (part of SDK)
- **Requirements**: `npm install --save-dev @gcoredev/fastedge-sdk-js`
- **Output**: WASM binary compiled from specified entrypoint

---

## Core Capabilities

### 1. Debug Interface

The extension registers as a VS Code debugger with type `"fastedge"`. F5 triggers a build → bundled server start → webview panel open flow.

The only launch.json field the extension uses is `"entrypoint"`:
```json
{
  "type": "fastedge",
  "request": "launch",
  "name": "FastEdge App",
  "entrypoint": "file"
}
```

**Key Features:**
- F5 to launch debug session
- Automatic compilation before running
- Per-app isolated debugger server (port range 5179–5188)
- Webview-based debugger UI (no DAP, no launch.json config fields)

### 2. Commands

The extension provides several VS Code commands:

| Command | Purpose |
|---------|---------|
| `Debug: FastEdge App (Current File)` | Builds active file → starts server → opens debugger panel |
| `Debug: FastEdge App (Package Entry)` | Builds `package.json` main entry (JS only) → opens debugger panel |
| `FastEdge (Generate mcp.json)` | Adds FastEdge MCP server to workspace |
| `FastEdge (Setup Codespace Secrets)` | Configures GitHub Codespaces secrets |

### 3. Configuration System

Runtime config is managed in two places:

1. **fastedge-config.test.json** — env vars, secrets, headers, port, memory limits. Loaded/saved via the debugger UI using native VSCode file dialogs. The per-app root marker for server isolation is the `.fastedge-debug/` directory.

2. **Dotenv files** (`.env`, `.env.variables`, `.env.secrets`, `.env.req_headers`, `.env.rsp_headers`) — auto-discovered from the app's config root directory.

**See**: `architecture/CONFIGURATION_SYSTEM.md` for full details.

### 4. Compilation System

**Rust Compilation:**
- Locates nearest `Cargo.toml`
- Runs `cargo build --target wasm32-wasip1`
- Extracts binary path from Cargo.toml `[package.name]`
- Output: `target/wasm32-wasip1/debug/{package-name}.wasm`

**JavaScript Compilation:**
- Current File mode: Uses active editor file as entrypoint
- Workspace mode: Uses `package.json` "main" field as entrypoint
- Runs `fastedge-build <input> <output>`
- Default output: `.fastedge-debug/app.wasm`

### 5. Runtime Execution

Once compiled, the extension:
1. Starts (or reuses) the per-app bundled debugger server
2. Auto-loads the compiled WASM into the debugger via REST API
3. Opens a webview panel with the debugger UI
4. User executes requests and views logs in the UI

The debugger server internally uses the bundled `fastedge-run` CLI with configuration from `fastedge-config.test.json` and any discovered dotenv files.

**FastEdge-run**: Application runner based on [FastEdge-lib](https://github.com/G-Core/FastEdge-lib)

---

## Tech Stack

### Core Technologies
- **Language**: TypeScript
- **Platform**: VS Code Extension API (v1.106.0+)
- **Node**: 20-24.x.x
- **Debugger**: Bundled Node server + webview UI (no DAP)
- **Build Tool**: esbuild (for extension bundling)
- **Package Manager**: pnpm

### Key Dependencies
- `toml` - Parsing Cargo.toml files
- `tree-kill` - Process management

### Development Tools
- TypeScript 5.9+
- ESLint
- VS Code Extension Testing

---

## Project Structure

```
FastEdge-vscode/
├── src/                                    # TypeScript source
│   ├── extension.ts                        # Extension entry point
│   ├── types.ts                            # Shared type definitions
│   │
│   ├── compiler/                           # Compilation logic
│   │   ├── index.ts                        # Compiler orchestration
│   │   ├── rustBuild.ts                    # Rust compilation
│   │   ├── rustConfig.ts                   # Cargo.toml parsing
│   │   └── jsBuild.ts                      # JavaScript compilation
│   │
│   ├── debugger/                           # Bundled debugger integration
│   │   ├── DebuggerServerManager.ts        # Per-app server lifecycle
│   │   ├── DebuggerWebviewProvider.ts      # Webview panel with debugger UI
│   │   └── index.ts
│   │
│   ├── utils/
│   │   ├── resolveAppRoot.ts               # resolveConfigRoot / resolveBuildRoot
│   │   └── resolveAppRoot.test.ts
│   │
│   ├── commands/                           # VS Code commands
│   │   ├── index.ts                        # Command registration
│   │   ├── mcpJson.ts                      # Generate mcp.json
│   │   ├── runDebugger.ts                  # run-file / run-workspace
│   │   └── codespaceSecrets.ts             # Codespaces integration
│   │
│   ├── dotenv/                             # Dotenv handling
│   │   └── index.ts                        # Dotenv file discovery/parsing
│   │
│   └── autorun/                            # Auto-run on file change
│       ├── index.ts
│       └── triggerFileHandler.ts
│
├── fastedge-cli/                           # Bundled FastEdge-run binary
├── dist/
│   ├── extension.js                        # Compiled extension
│   └── debugger/                           # Bundled debugger (server.js + frontend)
├── esbuild/                                # Build scripts
├── exampleFolder/                          # Example projects (Rust & JS)
├── images/                                 # Extension icons
│
├── package.json                            # Extension manifest
├── tsconfig.json                           # TypeScript configuration
├── eslint.config.mjs                       # ESLint configuration
├── README.md                               # User documentation
├── DOTENV.md                               # Dotenv usage guide
├── LICENSE                                 # Apache 2.0
└── .vscodeignore                           # Files to exclude from package
```

---

## How It Works (High-Level Flow)

### Extension Activation
1. VS Code loads extension on `onStartupFinished`
2. Extension registers:
   - Debug configuration provider (F5 `"entrypoint"` routing)
   - Commands (`run-file`, `run-workspace`, `generate-mcp-json`, `setup-codespace-secret`)
3. Extension displays bundled CLI version in settings
4. Per-app server/webview instances created lazily on first debug command

### Debug Session Flow
1. User presses F5 or runs `Debug: FastEdge App (Current File / Package Entry)`
2. App roots resolved: `resolveConfigRoot()` + `resolveBuildRoot()` from active file
3. Compilation:
   - Rust: `cargo build --target wasm32-wasip1` from `buildRoot`
   - JS: `fastedge-build` from `buildRoot`, output to `<configRoot>/.fastedge-debug/app.wasm`
   - AS: `asc --target release` with proxy-wasm support
4. Per-app `DebuggerServerManager` started (or reused) for `configRoot` — port selected by fastedge-test, discovered via `.debug-port` file
5. WASM auto-loaded into debugger via REST API
6. Webview panel opened showing debugger UI
7. User executes requests and views logs
8. Closing panel → server stops, port file deleted

### Command Execution
1. User invokes command via palette or keybinding
2. Command handler executes:
   - `mcpJson.ts` → Adds MCP server config to `.mcp.json`
   - `runDebugger.ts` → Triggers debug flow (build + server + webview)
   - `codespaceSecrets.ts` → Configures GitHub Codespaces

---

## Configuration Options

### launch.json

Only the `"entrypoint"` field is used:

| Value | Behaviour |
|-------|-----------|
| `"file"` | Build the active editor file |
| `"package"` | Build from `package.json` `"main"` field (JS only) |

All other properties (`port`, `env`, `secrets`, `headers`, etc.) are ignored — configure those in the debugger UI via `fastedge-config.test.json`.

### Extension Settings

| Setting | Description |
|---------|-------------|
| `fastedge.cliVersion` | FastEdge-run version (read-only) |
| `fastedge.apiUrl` | Default API URL for MCP server |

---

## Development Workflow

### Building the Extension
```bash
pnpm install
pnpm run build          # Production build
pnpm run build:dev      # Watch mode
```

### Testing Locally
1. Open FastEdge-vscode in VS Code
2. Press F5 to launch Extension Development Host
3. Open a FastEdge project in the new window
4. Test debug functionality

### Packaging
```bash
pnpm run package        # Creates .vsix file
```

### Installing from VSIX
- VS Code → Extensions → Install from VSIX
- Or from CLI: `code --install-extension fastedge-X.X.X.vsix`

---

## Key Design Decisions

### Why Bundle FastEdge-run?
- Ensures consistent runtime across all installations
- No external dependencies for users
- Version is tracked in extension settings
- Users can verify CLI version via settings UI

### Why Support Both "File" and "Workspace" Modes?
- **File mode**: Quick iteration on single files (useful for JS)
- **Workspace mode**: Full project builds (required for Rust)
- Flexibility for different development workflows

### Why Dotenv Hierarchy?
- Separates concerns (env vars vs secrets vs headers)
- Allows .gitignore for sensitive files
- Supports large configuration sets
- Compatible with FastEdge-run's expectations

### Why esbuild?
- Fast builds for extension development
- Single bundled output file
- Tree-shaking for smaller extension size

---

## Related Projects

- **[FastEdge-sdk-rust](https://github.com/G-Core/FastEdge-sdk-rust)** - Rust SDK for FastEdge
- **[FastEdge-sdk-js](https://github.com/G-Core/FastEdge-sdk-js)** - JavaScript SDK for FastEdge
- **[FastEdge-lib](https://github.com/G-Core/FastEdge-lib)** - Application runner (FastEdge-run)
- **[FastEdge-mcp-server](https://github.com/G-Core/FastEdge-mcp-server)** - MCP server for Claude Code
- **[create-fastedge-app](https://github.com/G-Core/create-fastedge-app)** - Project scaffolding tool

---

## Common Use Cases

### 1. Developing a New FastEdge App
1. Create project (Rust or JS)
2. Install FastEdge VSCode extension
3. Open a source file and press F5 (or run `Debug: FastEdge App (Current File)`)
4. Extension compiles to WASM, starts debugger server, opens debugger panel
5. Make changes, F5 to rebuild/rerun

### 2. Using Dotenv for Configuration
1. Create `.env` file in project root (or `.env.variables`, `.env.secrets`, etc.)
2. Add variables with prefixes (`FASTEDGE_VAR_ENV_`, `FASTEDGE_VAR_SECRET_`, etc.) or use specialized files without prefixes
3. Press F5 — dotenv files are auto-discovered from the app's config root

### 3. Setting Up MCP Server
1. Run command: `FastEdge (Generate mcp.json)`
2. Provide API token and other details
3. Extension adds MCP server config to workspace
4. Claude Code can now interact with FastEdge API

### 4. Testing in GitHub Codespaces
1. Open project in Codespaces
2. Run command: `FastEdge (Setup Codespace Secrets)`
3. Configure secrets in Codespaces
4. Debug as usual with F5

---

## Status: Current Features

**Fully Implemented:**
- ✅ Rust compilation and debugging
- ✅ JavaScript/AssemblyScript compilation and debugging
- ✅ Bundled debugger server (per-app isolation, auto start/stop)
- ✅ Webview-based debugger UI
- ✅ MCP server configuration generation
- ✅ GitHub Codespaces integration
- ✅ Command palette commands

**Planned/Future:**
- See GitHub issues for roadmap items

---

**Last Updated**: April 2026
