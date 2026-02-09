# FastEdge VSCode Extension - Project Overview

## What is FastEdge VSCode Extension?

The **FastEdge VSCode Extension** is a development tool that enables developers to build, debug, and run FastEdge applications directly within Visual Studio Code. It provides a seamless development experience for building edge computing applications in Rust and JavaScript.

### Key Value Proposition

- **Integrated Debugging**: Use VS Code's native debug interface (F5) to run FastEdge apps
- **Multi-Language Support**: Build and debug Rust and JavaScript applications
- **Local Development**: Test edge applications locally before deployment
- **Configuration Management**: Flexible configuration via launch.json and dotenv files
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

### 1. Debug Interface Integration

The extension registers as a VS Code debugger with type `"fastedge"`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "fastedge",
      "request": "launch",
      "name": "FastEdge App"
    }
  ]
}
```

**Key Features:**
- F5 to launch debug session
- Automatic compilation before running
- Serves application on localhost:8181
- Integration with VS Code Debug Console

### 2. Commands

The extension provides several VS Code commands:

| Command | Purpose |
|---------|---------|
| `FastEdge (Generate launch.json)` | Creates `.vscode/launch.json` with default config |
| `FastEdge (Generate mcp.json)` | Adds FastEdge MCP server to workspace |
| `Debug: FastEdge App (Current File)` | Runs current file as entrypoint |
| `Debug: FastEdge App (Workspace)` | Runs workspace project |
| `FastEdge (Setup Codespace Secrets)` | Configures GitHub Codespaces secrets |

### 3. Configuration System

**Three levels of configuration:**

1. **launch.json** (highest priority)
   - Debug-specific settings
   - Port, memory limits
   - Direct env vars, secrets, headers

2. **.env files** (middle priority)
   - Dotenv file hierarchy
   - Can specify path or use auto-discovery
   - Supports .env, .env.variables, .env.secrets, etc.

3. **Default settings** (lowest priority)
   - Port: 8181
   - Memory limit: 10MB
   - No additional headers

**See**: `DOTENV.md` in root for detailed dotenv documentation

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
- Default output: `.vscode/bin/debugger.wasm`

### 5. Runtime Execution

Once compiled, the extension:
1. Locates the bundled `fastedge-run` CLI
2. Collects configuration from all sources
3. Launches FastEdge-run with:
   - WASM binary path
   - Environment variables
   - Secrets
   - Request/response headers
   - Port and memory limits
4. Serves application on localhost:8181

**FastEdge-run**: Application runner based on [FastEdge-lib](https://github.com/G-Core/FastEdge-lib)

---

## Tech Stack

### Core Technologies
- **Language**: TypeScript
- **Platform**: VS Code Extension API (v1.106.0+)
- **Node**: 20-24.x.x
- **Debug Protocol**: VS Code Debug Adapter Protocol
- **Build Tool**: esbuild (for extension bundling)
- **Package Manager**: pnpm

### Key Dependencies
- `@vscode/debugadapter` - Debug Adapter Protocol implementation
- `@vscode/debugprotocol` - DAP type definitions
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
│   ├── FastEdgeDebugSession.ts             # Debug Adapter implementation
│   ├── BinaryDebugConfigurationProvider.ts # Config provider
│   ├── FastEdgeDebugAdapterDescriptorFactory.ts
│   ├── types.ts                            # Shared type definitions
│   │
│   ├── compiler/                           # Compilation logic
│   │   ├── index.ts                        # Compiler orchestration
│   │   ├── rustBuild.ts                    # Rust compilation
│   │   ├── rustConfig.ts                   # Cargo.toml parsing
│   │   └── jsBuild.ts                      # JavaScript compilation
│   │
│   ├── commands/                           # VS Code commands
│   │   ├── index.ts                        # Command registration
│   │   ├── launchJson.ts                   # Generate launch.json
│   │   ├── mcpJson.ts                      # Generate mcp.json
│   │   ├── runDebugger.ts                  # Run debugger commands
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
├── dist/                                   # Compiled extension (esbuild output)
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
   - Debug configuration provider
   - Debug adapter factory
   - Commands (palette and internal)
3. Extension displays CLI version in settings

### Debug Session Flow
1. User presses F5 or runs command
2. `BinaryDebugConfigurationProvider` validates/enhances configuration
3. `FastEdgeDebugAdapterDescriptorFactory` creates debug adapter
4. `FastEdgeDebugSession` receives launch request
5. Compilation:
   - Rust: `cargo build` with wasm32-wasip1 target
   - JS: `fastedge-build` with entrypoint
6. Configuration collection:
   - Merge launch.json settings
   - Load dotenv files (if enabled)
   - Apply defaults
7. FastEdge-run execution:
   - Launch with WASM binary + config
   - Serve on configured port (default 8181)
8. Debug Console displays output
9. User can access app at localhost:8181

### Command Execution
1. User invokes command via palette or keybinding
2. Command handler executes:
   - `launchJson.ts` → Creates `.vscode/launch.json`
   - `mcpJson.ts` → Adds MCP server config to `.claude/mcp.json`
   - `runDebugger.ts` → Triggers debug session programmatically
   - `codespaceSecrets.ts` → Configures GitHub Codespaces

---

## Configuration Options

### Launch.json Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `binary` | string | auto | WASM binary path (usually auto-detected) |
| `cliPath` | string | auto | Path to FastEdge-run CLI |
| `dotenv` | boolean\|string | true | Enable dotenv or specify path |
| `entrypoint` | string | "file" | "file" or "workspace" |
| `env` | object | {} | Environment variables |
| `secrets` | object | {} | Secret variables |
| `headers` | object | {} | Request headers |
| `responseHeaders` | object | {} | Response headers |
| `port` | number | 8181 | Port to listen on |
| `memoryLimit` | number | 10000000 | Memory limit in bytes |
| `geoIpHeaders` | boolean | false | Add sample GeoIP headers |
| `traceLogging` | boolean | false | Enable trace logging |
| `args` | string[] | [] | Additional CLI arguments |

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
3. Run command: `FastEdge (Generate launch.json)`
4. Press F5 to start debugging
5. Make changes, F5 to rebuild/rerun

### 2. Using Dotenv for Configuration
1. Create `.env` file in project root
2. Add variables with prefixes (FASTEDGE_VAR_ENV_, etc.)
3. In launch.json, set `"dotenv": true`
4. Press F5 - dotenv variables are loaded automatically

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
- ✅ JavaScript compilation and debugging
- ✅ Debug Adapter Protocol integration
- ✅ Launch.json generation
- ✅ Dotenv file support with hierarchy
- ✅ MCP server configuration generation
- ✅ GitHub Codespaces integration
- ✅ Command palette commands
- ✅ Automatic FastEdge-run CLI bundling

**Planned/Future:**
- See GitHub issues for roadmap items

---

**Last Updated**: February 2026
