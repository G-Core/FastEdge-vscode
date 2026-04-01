# FastEdge VSCode Extension - Context Index

**READ THIS FIRST** - This is your navigation hub for understanding the FastEdge VSCode extension.

---

## Quick Overview

**FastEdge VSCode Extension** is a VS Code extension that enables debugging and running FastEdge applications (Rust, JavaScript, and AssemblyScript) directly within the editor.

- **Compiles** code to WASM using language-specific build tools
- **Serves** applications locally on port 8181 using FastEdge-run
- **Integrates** with VS Code's debug interface (F5 to run)
- **Supports** dotenv files for configuration (env vars, secrets, headers)
- **Provides** commands for generating MCP server configs and Codespace setup

**Tech Stack**: TypeScript, VS Code Extension API, bundled Node server + webview UI, esbuild

---

## Decision Tree: What to Read When

Use this tree to find relevant documentation for your task:

### Adding or Modifying Features

**Task: Add new debugger feature** (breakpoints, inspection, etc.)
→ Read: `architecture/DEBUGGER_ARCHITECTURE.md`
→ Read: `features/DEBUG_SESSION.md`
→ Grep: `CHANGELOG.md` for "debugger" or similar features

**Task: Add/modify VS Code command**
→ Read: `features/COMMANDS.md`
→ Read: `architecture/EXTENSION_LIFECYCLE.md` (command registration)
→ Read: `development/IMPLEMENTATION_GUIDE.md`

**Task: Add support for new language**
→ Read: `features/COMPILER_SYSTEM.md`
→ Read: `architecture/DEBUGGER_ARCHITECTURE.md`
→ Read: `development/IMPLEMENTATION_GUIDE.md`

### Fixing Bugs

**Task: Fix Rust compilation issue**
→ Read: `features/COMPILER_SYSTEM.md` (Rust section)
→ Grep: `CHANGELOG.md` for "rust" or "compile"

**Task: Fix JavaScript build issue**
→ Read: `features/COMPILER_SYSTEM.md` (JS section)
→ Grep: `CHANGELOG.md` for "javascript" or "build"

**Task: Fix dotenv loading bug**
→ Read: `features/DOTENV_SYSTEM.md`
→ Grep: `CHANGELOG.md` for "dotenv"

**Task: Fix platform-specific issue (Windows/macOS/Linux)**
→ Read: `features/CROSS_PLATFORM.md`
→ Read: `features/COMPILER_SYSTEM.md` (if compilation-related)
→ Grep: `CHANGELOG.md` for "win32" or "darwin" or "platform"

**Task: Fix debugger connection issue**
→ Read: `features/DEBUG_SESSION.md`
→ Read: `architecture/DEBUGGER_ARCHITECTURE.md`
→ Read: `development/DEBUGGING_GUIDE.md`

### Configuration & Integration

**Task: Understand F5 / entrypoint configuration**
→ Read: `features/COMMANDS.md` (run-file / run-workspace section)
→ Read: `architecture/CONFIGURATION_SYSTEM.md` (F5 section)

**Task: Update MCP server integration**
→ Read: `features/MCP_INTEGRATION.md`
→ Read: `features/COMMANDS.md` (mcpJson command)

**Task: Add new configuration option**
→ Read: `architecture/CONFIGURATION_SYSTEM.md`
→ Read: `BUNDLED_DEBUGGER.md` (fastedge-config.test.json section)

### Understanding the System

**Task: Understand how extension starts/activates**
→ Read: `architecture/EXTENSION_LIFECYCLE.md`
→ Skim: `PROJECT_OVERVIEW.md`

**Task: Understand debug flow end-to-end**
→ Read: `architecture/DEBUGGER_ARCHITECTURE.md`
→ Read: `features/DEBUG_SESSION.md`
→ Read: `features/COMPILER_SYSTEM.md`

**Task: Understand configuration hierarchy**
→ Read: `architecture/CONFIGURATION_SYSTEM.md`
→ Read: `features/DOTENV_SYSTEM.md`

### Testing & Development

**Task: Test extension locally**
→ Read: `development/TESTING_GUIDE.md`
→ Read: `development/DEBUGGING_GUIDE.md`

**Task: Package and publish extension**
→ Read: `development/PACKAGING_GUIDE.md`
→ Read: `architecture/BUILD_SYSTEM.md`

---

## Documentation Map

### Core Starting Points

| Document | Lines | When to Read |
|----------|-------|--------------|
| **CONTEXT_INDEX.md** | ~100 | **Always read first** |
| **PROJECT_OVERVIEW.md** | ~150 | Understanding the extension |
| **SEARCH_GUIDE.md** | ~50 | Learning how to search docs |
| **CHANGELOG.md** | Variable | **Never read linearly** - use grep |

### Architecture (Read when modifying structure)

| Document | Focus | Read When |
|----------|-------|-----------|
| **EXTENSION_LIFECYCLE.md** | Activation, registration, per-app maps | Adding commands, changing startup |
| **DEBUGGER_ARCHITECTURE.md** | Bundled server, webview, REST API | Modifying debug functionality |
| **CONFIGURATION_SYSTEM.md** | fastedge-config.test.json, app root resolution | Changing configuration options |
| **BUILD_SYSTEM.md** | esbuild, packaging, deployment | Build/packaging changes |

### Features (Read specific feature when needed)

| Document | Focus | Read When |
|----------|-------|-----------|
| **DEBUG_SESSION.md** | Debug session implementation | Working on debug adapter |
| **COMPILER_SYSTEM.md** | Rust & JS compilation | Fixing/modifying compilation |
| **COMMANDS.md** | VS Code command implementations | Adding/modifying commands |
| **DOTENV_SYSTEM.md** | Dotenv file handling | Dotenv loading issues |
| **CROSS_PLATFORM.md** | Linux/macOS/Windows support, CI matrix, spawn rules | Any platform-specific work or new process spawning |
| **LAUNCH_CONFIG.md** | Launch.json generation | Launch config changes |
| **MCP_INTEGRATION.md** | MCP server configuration | MCP feature work |
| **AUTORUN_SYSTEM.md** | File watching, auto-trigger | Auto-run functionality |
| **CODESPACE_SECRETS.md** | GitHub Codespaces integration | Codespaces features |

### Development (Read when implementing/testing)

| Document | Focus | Read When |
|----------|-------|-----------|
| **IMPLEMENTATION_GUIDE.md** | Coding patterns, conventions | Starting any development work |
| **TESTING_GUIDE.md** | Testing extension locally | Testing changes |
| **DEBUGGING_GUIDE.md** | Debugging the debugger | Troubleshooting extension issues |
| **PACKAGING_GUIDE.md** | Creating .vsix, publishing | Releasing the extension |
| **VS_CODE_API_PATTERNS.md** | Common VS Code API usage | Using VS Code APIs |

### Archived (Legacy reference only — do NOT use for current development)

| Document | Focus | Read When |
|----------|-------|-----------|
| **archived/README.md** | What's in this folder and why | Orientation to legacy content |
| **archived/ARCHIVED_CHANGE_LOG.md** | Pre-Feb 2026 CHANGELOG entries | Researching historical changes |
| **archived/ARCHIVED_CONFIGURATION_SYSTEM.md** | DAP-era three-tier config hierarchy | Understanding why config was redesigned |

---

## Search Patterns

**Don't read CHANGELOG.md linearly** - Use these search patterns:

```bash
# Find similar features
grep -i "command" context/CHANGELOG.md
grep -i "debugger" context/CHANGELOG.md

# Find bug fixes
grep -i "fix.*rust" context/CHANGELOG.md
grep -i "fix.*compile" context/CHANGELOG.md

# Find specific changes
grep -i "dotenv" context/CHANGELOG.md
grep -i "mcp" context/CHANGELOG.md
```

**Find feature documentation:**
```bash
ls context/features/ | grep -i "compiler"
```

**Search across all context:**
```bash
grep -r "Debug Adapter Protocol" context/
grep -r "FastEdge-run" context/
```

See `SEARCH_GUIDE.md` for more patterns.

---

## Token Efficiency Strategy

**Estimated token costs:**
- This file (CONTEXT_INDEX.md): ~250 tokens
- PROJECT_OVERVIEW.md: ~400 tokens
- Architecture doc: ~500-1,000 tokens each
- Feature doc: ~500-1,500 tokens each
- CHANGELOG.md: **Don't read** - grep only

**Typical task token usage:**
- Simple bug fix: ~750 tokens (this file + 1 feature doc)
- New feature: ~1,500-2,500 tokens (this file + 2-3 docs)
- Major refactor: ~2,500-4,000 tokens (this file + multiple docs)

**Compare to reading everything upfront: ~10,000+ tokens**

---

## Key Concepts

### Extension Components

1. **Extension Entry Point** (`src/extension.ts`)
   - Activates on startup
   - Registers commands and debug providers
   - Manages extension lifecycle

2. **Debugger** (`src/debugger/`)
   - `DebuggerServerManager` — forks bundled `dist/debugger/server.js`, manages port + lifecycle
   - `DebuggerWebviewProvider` — creates webview panel, bridges iframe↔extension messages
   - Per-app instances keyed by `configRoot`

3. **Compiler System** (`src/compiler/`)
   - Rust: Uses `cargo build` with wasm32-wasip1 target
   - JavaScript: Uses `fastedge-build` tool
   - AssemblyScript: Uses `asc --target release` (CDN/proxy-wasm apps)
   - All output to `<configRoot>/.fastedge-debug/app.wasm`

4. **Commands** (`src/commands/`)
   - Generate mcp.json
   - Run debugger (current file or package entry)
   - Setup Codespace secrets

5. **Configuration** (`src/dotenv/`, `src/utils/resolveAppRoot.ts`)
   - Dotenv file auto-discovery from `configRoot`
   - `.fastedge-debug/` directory as app root marker; `fastedge-config.test.json` as runtime config store
   - `resolveConfigRoot()` (finds `.fastedge-debug/`) / `resolveBuildRoot()` for per-app isolation

### Key Terms

- **FastEdge-run**: Bundled CLI that runs WASM binaries locally
- **fastedge-config.test.json**: Per-app config file for runtime settings (env vars, secrets, headers)
- **configRoot**: Directory containing `.fastedge-debug/` — anchors per-app server + port file
- **buildRoot**: Directory containing `package.json` or `Cargo.toml` — anchors build CWD
- **dotenv hierarchy**: .env → .env.variables → .env.secrets (see DOTENV.md in root)
- **WASM**: WebAssembly - compiled output of Rust/JS/AS code
- **wasm32-wasip1**: WASI preview 1 target for Rust compilation
- **AssemblyScript (AS)**: TypeScript-like language compiling to WASM; used for CDN/proxy-wasm apps via `proxy-wasm-sdk-as`
- **asconfig.json**: AssemblyScript build config; presence at buildRoot is what triggers AS detection

---

## Getting Help

**Common questions:**

1. **How do I test my changes?**
   → Read: `development/TESTING_GUIDE.md`

2. **How does the debugger work?**
   → Read: `architecture/DEBUGGER_ARCHITECTURE.md`

3. **Where is the compilation logic?**
   → Read: `features/COMPILER_SYSTEM.md`

4. **How do I add a new command?**
   → Read: `features/COMMANDS.md`

5. **Why isn't dotenv working?**
   → Read: `features/DOTENV_SYSTEM.md`

---

## Next Steps

1. **If you haven't already**: Read `PROJECT_OVERVIEW.md` for a lightweight introduction
2. **Use the decision tree above** to find docs relevant to your task
3. **Read SEARCH_GUIDE.md** to learn effective search patterns
4. **Follow links** in documentation to discover related information

**Remember**: Only read what you need for your current task. The system is designed for just-in-time discovery.

---

**Last Updated**: March 2026
