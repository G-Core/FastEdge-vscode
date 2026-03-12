# FastEdge VSCode Extension - Changelog

**IMPORTANT**: Do not read this file linearly. Use grep to search for keywords.

**Example searches**:
```bash
grep -i "dotenv" context/CHANGELOG.md
grep -i "fix.*bug" context/CHANGELOG.md
grep "## \[2026-" context/CHANGELOG.md
```

See `SEARCH_GUIDE.md` for more search patterns.

---

## [2026-03-12] - Config Root vs Build Root Split + .debug-port Sidecar

### Overview
Refactored app root resolution to separate two previously conflated concerns: where the build runs (build root = `package.json` / `Cargo.toml`) and which directory anchors per-app isolation (config root = `fastedge-config.test.json`). Moved `.debug-port` from `.fastedge/.debug-port` to a direct sibling of `fastedge-config.test.json`. For apps with no config file, the file is now auto-created next to the active file rather than at the build root.

### Background

The old `resolveAppRoot()` returned the first directory containing any of `fastedge-config.test.json` / `package.json` / `Cargo.toml`. In workspaces where `fastedge-config.test.json` lives in a subdirectory below `package.json` (e.g. `workspace-1` with per-app subdirs under a shared `package.json`), the build command was running from the wrong directory.

### 🎯 What Was Completed

#### 1. `resolveAppRoot.ts` — split into three exports

- `resolveConfigRoot(startPath)` — walks up to find `fastedge-config.test.json`; returns `null` if not found
- `resolveBuildRoot(startPath)` — walks up to find `package.json` or `Cargo.toml`
- `ensureConfigFile(dir)` — writes `{}` to `fastedge-config.test.json` if it doesn't exist (no-op otherwise)

Old `resolveAppRoot()` export removed entirely.

#### 2. Call site updates

- `rustBuild.ts` / `jsBuild.ts` — build `cwd` and `package.json` reads now use `resolveBuildRoot()`; `.fastedge/bin/` WASM output uses `resolveConfigRoot() ?? buildRoot`
- `runDebugger.ts` / `extension.ts:getActiveAppRoot()` — port anchor uses `resolveConfigRoot()`; falls back to creating config at `path.dirname(activeFile)` (the active file's directory, not the build root)

#### 3. `.debug-port` moved to sidecar

- **Before**: `{configRoot}/.fastedge/.debug-port`
- **After**: `{configRoot}/.debug-port` (direct sibling of `fastedge-config.test.json`)
- `writePortFile()` in `fastedge-test/server/server.ts` no longer needs to `mkdirSync` for the port file
- `PORT_FILE_DIR` constant removed from `DebuggerServerManager.ts`

#### 4. Third-app fallback: config created at active file's directory

When no `fastedge-config.test.json` is found, one is created co-located with the active file (`path.dirname(activeFilePath)`). This makes that directory its own configRoot, giving the app its own `.debug-port` without assuming anything about project structure.

#### 5. Tests added

- `src/utils/resolveAppRoot.test.ts` — 17 vitest tests covering all workspace layouts (workspace-1, workspace-2 variants, Rust/Cargo.toml, null cases, `ensureConfigFile` idempotency)
- `vitest ^2.1.9` added to devDependencies; `pnpm test` script added

**Files Modified:**
- `src/utils/resolveAppRoot.ts` — replaced with two functions + helper
- `src/utils/resolveAppRoot.test.ts` — created
- `src/commands/runDebugger.ts` — build root / config root split, fallback to active file dir
- `src/extension.ts` — same split in `getActiveAppRoot()`
- `src/compiler/jsBuild.ts` — build root for cwd/entrypoint, config root for WASM output
- `src/compiler/rustBuild.ts` — same pattern
- `src/debugger/DebuggerServerManager.ts` — port file path updated, `PORT_FILE_DIR` constant removed
- `fastedge-test/server/server.ts` — port file path updated, `mkdirSync` removed from `writePortFile`
- `context/BUNDLED_DEBUGGER.md` — updated throughout
- `package.json` — vitest added

---

## [2026-03-11] - Config File Rename + Native Load/Save Dialogs

### Overview
Updated to use the renamed `fastedge-config.test.json` (previously `test-config.json`) as the app root marker. Implemented native VSCode load and save file dialogs for the debugger's config buttons — previously all dialog strategies failed silently in the sandboxed iframe context.

### Background

The debugger UI runs inside an `<iframe>` embedded in a `WebviewPanel`. This double-sandboxed context blocks the browser's native file APIs (`showSaveFilePicker`, `showOpenDialog`, `prompt`). The load button opened at `~` with no way to target the app root, and the save button produced only console errors.

### Fix

Both load and save detect `window !== window.top` and delegate to the extension host via `postMessage`. The outer webview HTML acts as a bridge, forwarding messages in both directions.

### 🎯 What Was Completed

#### 1. App Root Marker Rename
- `resolveAppRoot.ts`: marker updated from `test-config.json` → `fastedge-config.test.json`
- Error messages in `runDebugger.ts`, `extension.ts`, `jsBuild.ts`, `rustBuild.ts` updated

#### 2. Load Config — Native Open Dialog
- Extension handler: `openFilePicker` → `vscode.window.showOpenDialog({ defaultUri: appRoot })` → reads file → posts `filePickerResult` back
- Dialog opens at the app's root directory

#### 3. Save Config — Native Save Dialog
- Extension handler: `openSavePicker` → `vscode.window.showSaveDialog({ defaultUri: appRoot/fastedge-config.test.json })` → posts `savePickerResult` back
- Frontend calls `POST /api/config/save-as` with the returned path; server writes the file
- Always suggests `fastedge-config.test.json` so the saved file doubles as the app root marker

#### 4. Webview HTML Bridge
- Forwards `openFilePicker`, `openSavePicker` from iframe → extension host
- Forwards `filePickerResult`, `savePickerResult` from extension host → iframe

**Files Modified:**
- `src/utils/resolveAppRoot.ts` — marker + comment
- `src/commands/runDebugger.ts` — error message
- `src/extension.ts` — error message
- `src/compiler/jsBuild.ts` — error message
- `src/compiler/rustBuild.ts` — error message
- `src/debugger/DebuggerWebviewProvider.ts` — `readFile` import, two new `onDidReceiveMessage` handlers, webview HTML message forwarding

---

## [2026-03-10] - Multi-App Workspace Support

### Overview
Replaced the single shared debugger server model with per-app-root isolation. Each app folder in a workspace now gets its own server, port, and debug panel. Fixes two independent bugs: (1) config/state bleed between apps when multiple VSCode windows or a multi-root workspace are in use, and (2) HTTP WASM build failures in multi-root workspaces because the build was resolving `fastedge-build` from the workspace root instead of the app root.

### Background
The original architecture created one global `DebuggerServerManager` from `workspaceFolders[0]` at extension activation. This worked for single-app workspaces but broke in two common scenarios:
- **Two VSCode windows** each debugging a different app: config changes in one bled into the other via the shared server state.
- **Multi-root workspace** (`/my-cdn-app` + `/my-http-app` in one window): the build always ran from the workspace root, so `npx fastedge-build` and `cargo build` couldn't find the correct `node_modules/.bin/fastedge-build` or `Cargo.toml` for child apps. HTTP WASM builds failed entirely.

The isolation boundary is the **app folder** — the nearest ancestor directory containing `fastedge-config.test.json`, `package.json`, or `Cargo.toml`.

### 🎯 What Was Completed

#### 1. `resolveAppRoot()` utility (`src/utils/resolveAppRoot.ts`) — NEW FILE
- Walks up from a file path, checking each directory for (in priority order): `fastedge-config.test.json` → `package.json` → `Cargo.toml`
- All three markers checked at each level before moving up (avoids false positives from nested manifests)
- Returns `null` if no marker found (surfaced as user-visible error)
- Used by build, server, and panel code as the single source of app identity

#### 2. Build root fix (`src/compiler/jsBuild.ts`, `rustBuild.ts`, `compiler/index.ts`)
- `compileJavascriptBinary`: replaces `workspaceFolders[0]` with `resolveAppRoot(activeFilePath)` for CWD, bin dir, and `package.json` entry point lookup
- `compileRustAndFindBinary`: `cwd` for `cargo build` and `.fastedge/bin/` copy destination now use app root
- `compiler/index.ts`: workspace mode no longer anchors to `workspaceFolders[0]`; always derives root from active file

#### 3. Per-app `DebuggerServerManager` (`src/debugger/DebuggerServerManager.ts`)
- Constructor now takes `appRoot` instead of `workspacePath`
- `start()` reads `<appRoot>/.fastedge/.debug-port`, health-checks the port, reuses if healthy or spawns fresh if stale/missing
- `stop()` sends SIGTERM and deletes the port file
- Spawns server with `WORKSPACE_PATH: appRoot` (used by server for dotenv and port file)
- On unexpected process exit: port file is deleted

#### 4. Per-app panel + extension wiring (`src/extension.ts`, `src/commands/runDebugger.ts`)
- `extension.ts` maintains `Map<appRoot, DebuggerServerManager>` and `Map<appRoot, DebuggerWebviewProvider>`
- `getOrCreateForAppRoot(appRoot)` lazily creates manager+provider pairs
- All commands resolve app root from the active file before acting
- `runDebugger.ts` accepts a factory function (`AppDebuggerFactory`) instead of module-level singletons
- Panel title shows app name: `"FastEdge Debugger — my-cdn-app"`

#### 5. Panel close = stop server (`src/debugger/DebuggerWebviewProvider.ts`)
- `panel.onDidDispose` now calls `serverManager.stop()` — closing the panel kills the server and cleans its port file
- Guard: skips stop if `isRunning()` is false (prevents double-stop when command closes the panel explicitly)

#### 6. Stop command picker (`src/extension.ts`)
- `FastEdge: Stop Debugger Server` shows a quick-pick listing running apps by name when multiple servers are running
- Single server: stops immediately without a picker
- After stop: closes the panel and removes the manager from the map

#### 7. Build terminal auto-close (`src/commands/runDebugger.ts`)
- On successful build: `setTimeout(() => terminal.dispose(), 3000)` — terminal disappears after 3s
- On failed build: terminal stays open so the user can read the error

### 🧪 Testing Scenarios Verified
- Single app, single window: existing behaviour unchanged
- Two apps in a multi-root workspace: independent servers (5179, 5180), independent panels, no state bleed
- HTTP WASM build in child app folder: `fastedge-build` resolved from app root ✅
- Closing panel: server stops, port file deleted
- Stop command with two running: picker shows both; stopping one leaves the other running
- Stale port file: detected and cleaned up on next `start()`

### 📝 Key Design Decisions
- **App root = nearest manifest ancestor**: `fastedge-config.test.json` wins over `package.json`/`Cargo.toml` because it is always at the FastEdge app root by convention. Language manifests may exist in parent directories (monorepo root `package.json`, cargo workspace).
- **Port file owned by the server, read by the extension**: server writes it after `httpServer.listen()`, deletes on shutdown. Extension reads it at start time only.
- **Agents never spawn servers**: if an agent finds no port file for the app it's working in, it should prompt the user to open the debug panel first. (T010/T011 in fastedge-plugin — not yet implemented.)

**Files Modified:**
- `src/utils/resolveAppRoot.ts` — NEW
- `src/compiler/jsBuild.ts`
- `src/compiler/rustBuild.ts`
- `src/compiler/index.ts`
- `src/debugger/DebuggerServerManager.ts`
- `src/debugger/DebuggerWebviewProvider.ts`
- `src/extension.ts`
- `src/commands/runDebugger.ts`

**Coordinated change in `fastedge-test`:**
- `server/server.ts` — port file write/delete (see fastedge-test CHANGELOG 2026-03-10)
- `server/runner/PortManager.ts` — async OS-level port check
- `server/runner/HttpWasmRunner.ts` — await allocate

---

## [2026-03-03] - Debugger Bundling Fixes + Port Hardening

### Overview
Two categories of fixes: (1) `dist/lib/` was being incorrectly included in the VSCode bundle (bloat from the npm library build), and (2) `DebuggerServerManager` was trusting any process on port 5179, which caused silent failures when a stale or foreign process occupied the port.

### 🎯 What Was Completed

#### 1. Exclude `lib/` from VSCode Bundle
The `fastedge-test` build script (`pnpm run build`) now runs both `build:debugger` and `build:lib` in parallel, causing `dist/lib/` (the `@gcoredev/fastedge-test` npm package output) to appear in the debugger's dist. This was being swept up by the bundle script and the GitHub Actions workflow.

**Files Modified:**
- `../scripts/bundle-debugger-for-vscode.sh` — added `lib` to the exclusion list in the catch-all copy loop
- `.github/workflows/download-debugger.yml` — added "Remove lib folder" step after extraction, before verification

#### 2. DebuggerServerManager: Identity Check + Port Scanning

**Root cause of the webview bug**: A stale `node dist/server.js` process (running from `fastedge-debugger-OLD_LEGACY`) was occupying port 5179. `isHealthy()` returned true, the extension reused it, but that server had wrong `__dirname` paths — serving 404s on the frontend and failing to find the `fastedge-run` CLI.

**Fixes:**
- `isHealthy()` now validates `data.service === "fastedge-debugger"` — foreign processes fail this check
- New `resolvePort()` method scans ports 5179–5188 on every `start()` call:
  - Reuses port immediately if our own server is found
  - Skips ports occupied by foreign processes (logs a warning)
  - Returns the first free port found
- `this.port` is updated to the resolved port before forking, so `getUrl()` and `getPort()` remain accurate

**Files Modified:**
- `src/debugger/DebuggerServerManager.ts` — `isHealthy()`, new `resolvePort()`, updated `start()`

**Files Modified in fastedge-test (coordinated change):**
- `server/server.ts` — `/health` now returns `{"status":"ok","service":"fastedge-debugger"}`

### 🧪 Testing
- Verified webview loads correctly after killing stale server
- Bundled debugger `dist/debugger/` confirmed to contain: `server.js`, `frontend/`, `fastedge-cli/` — no `lib/`

### 📝 Notes
- The `lib/` exclusion affects both local dev workflow and the production GitHub Actions CI path
- Port scanning window is 10 ports (5179–5188); throws a clear error if all are occupied
- This hardening benefits all users: port 5179 may legitimately be in use by other local services

---

## [2026-02-11] - Bundled Debugger Implementation

### Overview
Complete architectural improvement: debugger is now fully bundled with the extension. No external setup required, no Node.js required, works immediately after installation. Perfect for Rust developers and zero-configuration experience.

### 🎯 What Was Completed

#### 1. Debugger Bundling System
**New Approach**:
- fastedge-debugger bundles its own server with esbuild
- Coordinator script copies pre-built files
- Extension packages bundled debugger in .vsix

**Key Achievement**: Single server.js file (915KB) with ALL dependencies bundled!

**Files Modified/Created**:
- `fastedge-debugger/esbuild-bundle-server.js` - NEW - Server bundling script
- `fastedge-debugger/package.json` - Added `build:bundle` script, esbuild dependency
- `coordinator/scripts/bundle-debugger-for-vscode.sh` - NEW - Copy script
- `package.json` - Added `bundle:debugger` script, prebuild hook

#### 2. Updated Server Manager
**File**: `src/debugger/DebuggerServerManager.ts`

**Changed**:
- Before: `spawn('npm', ['start'])` - required npm in PATH
- After: `fork('server.js')` - uses VSCode's Node.js directly

**Benefits**:
- No external Node.js required
- Uses `process.execPath` (VSCode's Node)
- Works for Rust developers without Node.js
- Separate process for better isolation

#### 3. Removed External Configuration
**Files Modified**:
- `src/extension.ts` - Removed `findDebuggerPath()` function
- `src/extension.ts` - Removed sibling directory detection
- `package.json` - Removed `fastedge.debuggerPath` setting

**Why**: Always use bundled debugger at `dist/debugger/`

#### 4. Build Process Integration
**Files Modified**:
- `package.json` - Added prebuild hook to auto-bundle debugger
- `.vscodeignore` - Include debugger bundle, exclude node_modules

**Build Flow**:
```
npm run package
  └─→ npm run bundle:debugger (prebuild)
      └─→ Builds debugger with esbuild
      └─→ Copies to dist/debugger/
  └─→ npm run build
  └─→ vsce package
```

### 📊 Bundle Statistics

**Before (External Debugger)**:
- Extension size: N/A (debugger separate)
- Required: Manual clone, npm install, Node.js
- Setup: ~5-10 minutes
- Works offline: No

**After (Bundled Debugger)**:
- Extension size: 529KB (.vsix compressed)
- Debugger size: 1.3MB uncompressed
- Server file: 915KB (all deps bundled)
- Required: Nothing
- Setup: 0 seconds (install extension)
- Works offline: Yes ✅

### 🎯 Key Design Decisions

#### Decision 1: Each Repo Owns Its Build
**Why**: Keeps repos independent, debugger can be built standalone

#### Decision 2: Bundle ALL Dependencies
**Why**: No node_modules = no vsce packaging issues, smaller size

#### Decision 3: Coordinator Just Copies
**Why**: Simple, maintainable, can be automated easily

#### Decision 4: Use VSCode's Node.js
**Why**: No user Node.js required, guaranteed compatibility

#### Decision 5: Keep HTTP Server Architecture
**Why**: Agents need REST API, WebSockets need server, proven pattern

### 🚀 User Impact

**Before**:
1. Install extension
2. Clone fastedge-debugger
3. Run `npm install`
4. Configure path in settings
5. Requires Node.js installed
6. Manual setup for Rust developers

**After**:
1. Install extension
2. Done! ✨

### 🧪 Testing Status

**Completed**:
- ✅ Debugger bundles with esbuild
- ✅ Coordinator script copies files
- ✅ Extension builds without errors
- ✅ TypeScript compiles successfully
- ✅ vsce packages without node_modules errors
- ✅ Final .vsix created (529KB)

**Manual Testing Required**:
- ⏳ Install .vsix in VSCode
- ⏳ Start debugger server
- ⏳ Load WASM file
- ⏳ Test on system without Node.js

### 📝 Documentation

**New Files**:
- `context/BUNDLED_DEBUGGER.md` - Complete bundling documentation
- `coordinator/context/VSCODE_DEBUGGER_BUNDLING.md` - Implementation details

**Updated Files**:
- `coordinator/context/REPOSITORIES.md` - Updated FastEdge-vscode section
- `context/CHANGELOG.md` - This entry

### 🔗 Related Changes

**fastedge-debugger**:
- Added `build:bundle` script
- Added esbuild bundling
- Produces single server.bundle.js

**Coordinator**:
- Added bundle script
- Simplified to copy-only operation

**Future**:
- GitHub Actions will download pre-built debugger releases
- Even faster builds, consistent binaries

### 💡 Technical Notes

**esbuild Configuration**:
- Platform: node
- Target: node20
- Bundle: true
- Minify: true
- External: fsevents only (Mac-only, optional)

**No Longer Externalized**:
- wasi-shim (now bundled)
- express (now bundled)
- ws (now bundled)
- All other dependencies (now bundled)

**Result**: Zero node_modules in extension bundle!

---

## [2026-02-10] - Debugger Integration via Webview

### Overview
Replaced custom Debug Adapter Protocol (DAP) implementation with modern webview-based debugger integration. Extension now manages fastedge-debugger server lifecycle and displays debugger UI in native VSCode webview.

### 🎯 What Was Completed

#### 1. Removed Custom DAP Implementation
**Files Deleted** (~300 lines total):
- `src/BinaryDebugConfigurationProvider.ts`
- `src/FastEdgeDebugAdapterDescriptorFactory.ts`
- `src/FastEdgeDebugSession.ts` (284 lines)

**Why Removed**:
- Complex maintenance burden
- Duplicate functionality with debugger server
- Limited features compared to web UI

#### 2. Created Debugger Webview Provider
**Files Created**:
- `src/debugger/DebuggerServerManager.ts` (150+ lines)
  - Start/stop debugger server
  - Health check monitoring
  - Process lifecycle management
  - Port forwarding (5179)

- `src/debugger/DebuggerWebviewProvider.ts` (200+ lines)
  - Create webview panel with debugger UI
  - Load WASM via REST API
  - Configure environment variables
  - Communicate with debugger server

- `src/debugger/index.ts`
  - Exports for both providers

**Architecture**:
```typescript
// Start server
await debuggerServerManager.start();

// Load WASM
await debuggerWebviewProvider.loadWasm(wasmPath);

// Show UI in webview panel
const panel = vscode.window.createWebviewPanel(...);
panel.webview.html = `<iframe src="http://localhost:5179" />`;
```

#### 3. Updated Extension Commands
**File Modified**: `src/extension.ts` (major refactor)
- Removed DAP registration
- Added debugger server management
- Integrated webview provider

**New Commands**:
- `fastedge.start-debugger-server` - Start debugger in background
- `fastedge.stop-debugger-server` - Stop debugger server
- `fastedge.debug-app` - Build WASM, start debugger, open webview

**File Modified**: `package.json`
- Added new command definitions
- Added configuration: `fastedge.debuggerPath`

### Implementation Details

**Server Manager Features**:
- Auto-detection of debugger path
- Health check polling (`GET /health`)
- Graceful startup/shutdown
- Process management
- Error handling

**Webview Provider Features**:
- Iframe embedding of debugger UI
- REST API integration
- WASM loading automation
- Configuration management
- Clean disposal

**Configuration**:
```json
{
  "fastedge.debuggerPath": "/path/to/fastedge-debugger"
}
```

### Impact
- **Cleaner Architecture**: Removed 300+ lines of DAP code
- **Better UX**: Native debugger UI in VSCode
- **Easier Maintenance**: Standard REST API vs custom protocol
- **More Features**: Full debugger UI capabilities
- **Better Integration**: Managed server lifecycle

**Code Changes**:
- Lines added: ~400 (new debugger integration)
- Lines removed: ~300 (DAP implementation)
- Net: +100 lines
- Files created: 3
- Files deleted: 3
- Files modified: 2

### Testing
**Manual Testing Required** (extension needs to be built):
```bash
# 1. Build extension
npm run build

# 2. Open in VSCode development host
# Press F5

# 3. Test commands
# Command Palette > "FastEdge: Start Debugger Server"
# Command Palette > "FastEdge: Debug Application"

# 4. Verify
# - Debugger server starts on port 5179
# - Webview panel opens with debugger UI
# - Can load WASM and test
```

**Part of**: FastEdge Ecosystem Refactoring - Phase 4: VSCode Extension Integration

### Notes
- Requires fastedge-debugger to be available (sibling directory or configured path)
- Uses standard REST API for all debugger communication
- Debugger server managed by extension (start/stop/health checks)
- F5 debugging still available for traditional workflow
- TODO: Integrate with existing compiler system for automatic builds

---

## Format for New Entries

```markdown
## [YYYY-MM-DD] - Feature/Fix Name

### Overview
Brief description of what was accomplished

### 🎯 What Was Completed

#### 1. Component/Feature Name
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

## [2026-02-09] - Initial Context Documentation

### Overview
Created comprehensive context documentation system following discovery-based pattern from fastedge-testing repository.

### 🎯 What Was Completed

#### 1. Core Documentation Structure
- Created `claude.md` - Top-level agent instructions (~350 lines)
- Created `context/CONTEXT_INDEX.md` - Navigation hub (~100 lines)
- Created `context/PROJECT_OVERVIEW.md` - Lightweight overview (~250 lines)
- Created `context/SEARCH_GUIDE.md` - Search patterns guide (~50 lines)
- Created `context/CHANGELOG.md` - This file (searchable history)

#### 2. Architecture Documentation
- Created `context/architecture/EXTENSION_LIFECYCLE.md` - Extension activation and registration
- Created `context/architecture/DEBUGGER_ARCHITECTURE.md` - Debug Adapter Protocol implementation
- Created `context/architecture/CONFIGURATION_SYSTEM.md` - Configuration hierarchy and merging

#### 3. Feature Documentation
- Created `context/features/COMPILER_SYSTEM.md` - Rust and JavaScript compilation
- Created `context/features/COMMANDS.md` - VS Code command implementations
- Created `context/features/DOTENV_SYSTEM.md` - Dotenv file handling system

**Files Created:**
- `claude.md` - Top-level instructions
- `context/CONTEXT_INDEX.md` - Documentation navigation
- `context/PROJECT_OVERVIEW.md` - Project overview
- `context/SEARCH_GUIDE.md` - Search patterns
- `context/CHANGELOG.md` - This file
- `context/architecture/EXTENSION_LIFECYCLE.md`
- `context/architecture/DEBUGGER_ARCHITECTURE.md`
- `context/architecture/CONFIGURATION_SYSTEM.md`
- `context/features/COMPILER_SYSTEM.md`
- `context/features/COMMANDS.md`
- `context/features/DOTENV_SYSTEM.md`

### 📝 Notes

**Documentation Philosophy:**
- Discovery-based: Read only what's needed for current task
- Token-efficient: Prevents reading thousands of unnecessary lines
- Decision-tree driven: Quick lookup for common tasks
- Searchable: Use grep instead of linear reading

**Coverage:**
- Core architecture: Extension lifecycle, debugger, configuration
- Key features: Compilation (Rust/JS), commands, dotenv system
- Remaining features: Can be documented as needed

**Future Documentation Needed:**
- `features/DEBUG_SESSION.md` - Debug session implementation details
- `features/MCP_INTEGRATION.md` - MCP server generation
- `features/LAUNCH_CONFIG.md` - Launch.json generation
- `development/IMPLEMENTATION_GUIDE.md` - Coding patterns
- `development/TESTING_GUIDE.md` - Testing strategies

---

**Note**: Add new entries at the TOP of this file (reverse chronological order)
