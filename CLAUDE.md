# AI Agent Instructions for FastEdge VSCode Extension

## 🎯 CRITICAL: Read Smart, Not Everything

**DO NOT read all context files upfront.** This repository uses a **discovery-based context system** to minimize token usage while maximizing effectiveness.

---

## Getting Started: Discovery Pattern

### Step 1: Read the Index (REQUIRED - ~100 lines)

**First action when starting work**: Read `context/CONTEXT_INDEX.md`

This lightweight file gives you:
- Extension overview and quick start
- Documentation map organized by topic
- Decision tree for what to read when
- Search patterns for finding information

### Step 2: Read Based on Your Task (JUST-IN-TIME)

Use the decision tree in CONTEXT_INDEX.md to determine what to read. **Only read what's relevant to your current task.**

**Examples:**

**Task: "Add new debugger feature"**
- Read: `context/architecture/DEBUGGER_ARCHITECTURE.md`
- Read: `context/features/DEBUG_SESSION.md`
- Grep: `context/CHANGELOG.md` for similar features

**Task: "Fix Rust compilation issue"**
- Read: `context/features/COMPILER_SYSTEM.md`
- Read: `context/development/IMPLEMENTATION_GUIDE.md`
- Grep: `context/CHANGELOG.md` for "rust" or "compiler"

**Task: "Add new VS Code command"**
- Read: `context/features/COMMANDS.md`
- Read: `context/architecture/EXTENSION_LIFECYCLE.md`
- Read: `context/development/IMPLEMENTATION_GUIDE.md`

**Task: "Fix dotenv loading bug"**
- Read: `context/features/DOTENV_SYSTEM.md`
- Read: `context/architecture/CONFIGURATION_SYSTEM.md`
- Grep: `context/CHANGELOG.md` for "dotenv"

**Task: "Update MCP server integration"**
- Read: `context/features/MCP_INTEGRATION.md`
- Read: `context/features/COMMANDS.md` (mcpJson command)
- Grep: `context/CHANGELOG.md` for "mcp"

### Step 3: Search, Don't Read Everything

**Use grep and search tools** instead of reading large docs linearly:

- **CHANGELOG.md**: **NEVER read linearly** - use grep to search for keywords
- **Architecture docs**: Read specific sections, not entire file
- **Feature docs**: Only read the feature you're working on

See `context/SEARCH_GUIDE.md` for search patterns and examples.

---

## 📋 Decision Tree Reference

**Quick lookup for common tasks:**

| Task Type | What to Read |
|-----------|-------------|
| **Adding debugger features** | DEBUGGER_ARCHITECTURE + DEBUG_SESSION + grep CHANGELOG |
| **Fixing compilation (Rust/JS)** | COMPILER_SYSTEM + grep CHANGELOG |
| **Adding/modifying commands** | COMMANDS + EXTENSION_LIFECYCLE + IMPLEMENTATION_GUIDE |
| **Dotenv system changes** | DOTENV_SYSTEM + CONFIGURATION_SYSTEM |
| **Launch.json generation** | LAUNCH_CONFIG + CONFIGURATION_SYSTEM |
| **MCP server integration** | MCP_INTEGRATION + COMMANDS |
| **Extension lifecycle changes** | EXTENSION_LIFECYCLE + IMPLEMENTATION_GUIDE |
| **Testing the extension** | development/TESTING_GUIDE + DEBUGGING_GUIDE |
| **Packaging/publishing** | development/PACKAGING_GUIDE |
| **Understanding architecture** | PROJECT_OVERVIEW + skim architecture docs |

---

## 🚫 Anti-Patterns (What NOT to Do)

❌ **Don't**: Read all architecture docs upfront (wastes tokens)
❌ **Don't**: Read CHANGELOG.md linearly (use grep instead)
❌ **Don't**: Read feature docs you're not working on
❌ **Don't**: Read entire docs when you need specific sections
❌ **Don't**: Start coding without reading relevant architecture/feature docs

✅ **Do**: Read CONTEXT_INDEX.md first
✅ **Do**: Use grep to search CHANGELOG and large docs
✅ **Do**: Read only sections relevant to current task
✅ **Do**: Read documentation just-in-time when you need it
✅ **Do**: Follow links in docs to discover related information

---

## ⚡ Critical Working Practices

### Task Checklists (ALWAYS USE)

When starting any non-trivial task (multi-step, multiple files, refactoring, features, etc.):

1. **First action**: Use TaskCreate to break down the work into trackable tasks
2. Update task status as you work (`in_progress` → `completed`)
3. This gives the user real-time visibility into progress

**When to create task checklists:**
- Multi-step tasks (3+ steps)
- Tasks involving multiple files or components
- Refactoring work
- Feature implementation
- Bug fixes that affect multiple areas

### Parallel Agents (USE WHEN POSSIBLE)

When tasks are **independent** (different files, different components, no dependencies):

1. **Spawn multiple agents in parallel** using multiple Task tool calls in a **single message**
2. Each agent works concurrently on its task
3. **Massive time savings**: 10-15x faster than sequential processing

**When to use parallel agents:**
- Updating multiple feature docs
- Testing multiple scenarios
- Implementing independent features
- Documentation updates across multiple files

**When NOT to use:**
- Tasks with dependencies (B needs A's output)
- Tasks modifying the same file
- Tasks requiring sequential logic

---

## 📝 Documentation Maintenance

### When to Update Context Files

**After completing major features:**
- Update `context/CHANGELOG.md` - Add detailed entry at the TOP (reverse chronological)
- Update `context/PROJECT_OVERVIEW.md` - Update feature list if needed
- Update or create feature-specific doc in `context/features/`

**After architectural changes:**
- Update relevant architecture doc in `context/architecture/`
- Update `context/CHANGELOG.md`
- Update `context/PROJECT_OVERVIEW.md` if architecture significantly changed

**After significant bug fixes:**
- Update `context/CHANGELOG.md` with the fix
- Update feature doc's Known Issues section if applicable

**What NOT to document:**
- Trivial typo fixes
- Code formatting changes
- Comment updates
- Routine dependency updates (unless they change functionality)

### Changelog Entry Format

```markdown
## [Date] - [Feature/Fix Name]

### Overview
Brief description of what was accomplished

### 🎯 What Was Completed

#### 1. [Component/Feature Name]
- Detail 1
- Detail 2

**Files Modified:**
- path/to/file.ts - What changed

**Files Created:**
- path/to/file.ts - Purpose

### 🧪 Testing
How to test the changes

### 📝 Notes
Any important context, decisions, or gotchas
```

---

## 📁 Context Organization

The context folder is organized by topic:

```
context/
├── CONTEXT_INDEX.md          # Read this first (~100 lines)
├── PROJECT_OVERVIEW.md       # Lightweight overview (~150 lines)
├── PROJECT_DETAILS.md        # Deep dive (optional, future)
├── CHANGELOG.md              # Search, don't read linearly
├── SEARCH_GUIDE.md           # How to search effectively
│
├── architecture/             # Read when modifying structure
│   ├── EXTENSION_LIFECYCLE.md    # Extension activation, commands
│   ├── DEBUGGER_ARCHITECTURE.md  # Debug Adapter Protocol
│   ├── CONFIGURATION_SYSTEM.md   # launch.json, dotenv, settings
│   └── BUILD_SYSTEM.md           # esbuild, packaging
│
├── features/                 # Read specific feature when needed
│   ├── DEBUG_SESSION.md          # Debug session implementation
│   ├── COMPILER_SYSTEM.md        # Rust & JS compilation
│   ├── COMMANDS.md               # VS Code commands
│   ├── DOTENV_SYSTEM.md          # Dotenv file handling
│   ├── MCP_INTEGRATION.md        # MCP server generation
│   ├── LAUNCH_CONFIG.md          # Launch.json generation
│   ├── AUTORUN_SYSTEM.md         # File watching
│   └── CODESPACE_SECRETS.md      # GitHub Codespaces
│
└── development/              # Read when implementing/testing
    ├── IMPLEMENTATION_GUIDE.md   # Coding patterns
    ├── TESTING_GUIDE.md          # Testing the extension
    ├── DEBUGGING_GUIDE.md        # Debugging the debugger
    ├── PACKAGING_GUIDE.md        # Creating .vsix files
    └── VS_CODE_API_PATTERNS.md   # Common API patterns
```

---

## 🔍 Search Tips

**Instead of reading CHANGELOG.md:**
```bash
grep -i "debugger" context/CHANGELOG.md
grep -i "rust.*compile" context/CHANGELOG.md
grep -i "fix.*bug" context/CHANGELOG.md
```

**Find feature documentation:**
```bash
ls context/features/ | grep -i "compiler"
```

**Search across all context:**
```bash
grep -r "Debug Adapter Protocol" context/
```

**See `context/SEARCH_GUIDE.md` for comprehensive search patterns.**

---

## Extension Overview

**FastEdge VSCode Extension** enables debugging and running FastEdge applications directly within VS Code.

### Key Capabilities:
- **Language Support**: Rust and JavaScript/TypeScript
- **Debug Interface**: Full VS Code debugging integration (F5 to run)
- **WASM Compilation**: Compiles code to WASM using language-specific tools
- **Local Serving**: Runs applications on localhost:8181 using FastEdge-run
- **Configuration**: Supports launch.json and dotenv files
- **Commands**:
  - `FastEdge (Generate launch.json)` - Create debug configuration
  - `FastEdge (Generate mcp.json)` - Setup MCP server
  - `Debug: FastEdge App (Current File)` - Run current file
  - `Debug: FastEdge App (Workspace)` - Run workspace project
  - `FastEdge (Setup Codespace Secrets)` - GitHub Codespaces integration

### Tech Stack:
- **Language**: TypeScript
- **Platform**: VS Code Extension API
- **Debug Protocol**: VS Code Debug Adapter Protocol
- **Build Tool**: esbuild
- **Runtime**: FastEdge-run (bundled CLI)

### Default Port:
- **8181** - Where FastEdge applications are served locally

---

## Quick Reference

**Common Commands:**
```bash
pnpm install
pnpm run build          # Build extension
pnpm run build:dev      # Build with watch mode
pnpm run package        # Create .vsix package
pnpm run lint           # Run ESLint
```

**Project Structure:**
```
FastEdge-vscode/
├── src/
│   ├── extension.ts                      # Extension entry point
│   ├── FastEdgeDebugSession.ts           # Debug Adapter implementation
│   ├── BinaryDebugConfigurationProvider.ts
│   ├── FastEdgeDebugAdapterDescriptorFactory.ts
│   ├── compiler/                         # Rust/JS compilation
│   ├── commands/                         # VS Code commands
│   ├── dotenv/                           # Dotenv handling
│   └── autorun/                          # File watching
├── fastedge-cli/                         # Bundled FastEdge-run binary
├── package.json                          # Extension manifest
└── esbuild/                              # Build scripts
```

**Key Files:**
- `package.json` - Extension manifest, contributions, commands
- `src/extension.ts` - Extension activation and registration
- `src/FastEdgeDebugSession.ts` - Core debug adapter logic
- `src/compiler/index.ts` - Compilation orchestration
- `DOTENV.md` - Dotenv usage documentation (root level)

---

## Summary: How to Work Efficiently

1. **Read `context/CONTEXT_INDEX.md` first** (~100 lines, ~250 tokens)
2. **Use the decision tree** to identify what docs are relevant
3. **Read only what you need** for your current task (~500-2,000 tokens)
4. **Use grep to search** CHANGELOG and large docs instead of reading linearly
5. **Follow links** in documentation to discover related information
6. **Create task checklists** for non-trivial tasks
7. **Use parallel agents** when tasks are independent
8. **Update documentation** after completing significant work

**Token Savings**: 75-80% reduction vs. reading all docs upfront

**Result**: Faster agent startup, better focus, scalable documentation system

---

## Important Notes

**This is a standalone repository:**
- Can be used independently
- Does not depend on the coordinator structure
- Has its own git repository
- Self-contained with all dependencies

**When working in this repo:**
- Follow the patterns established here
- Update context files in this repo's context/ folder
- Keep documentation focused on the extension itself

---

**Last Updated**: February 2026
