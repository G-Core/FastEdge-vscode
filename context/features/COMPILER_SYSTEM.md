# Compiler System - FastEdge VSCode Extension

This document describes how the extension compiles Rust and JavaScript code into WASM binaries for FastEdge applications.

---

## Overview

The compiler system is responsible for:
1. Detecting project language (Rust or JavaScript)
2. Locating build configuration files
3. Running language-specific build tools
4. Locating compiled WASM binary
5. Validating binary before execution

**Files**:
- `src/compiler/index.ts` - Orchestration and language detection
- `src/compiler/rustBuild.ts` - Rust compilation logic
- `src/compiler/rustConfig.ts` - Cargo.toml parsing
- `src/compiler/jsBuild.ts` - JavaScript compilation logic

---

## Language Detection

**Determined by**:
1. Presence of `Cargo.toml` (Rust)
2. Presence of `package.json` with FastEdge SDK (JavaScript)
3. File extension of entrypoint (`.rs` or `.js`/`.ts`)

**Detection logic**:
```typescript
async function detectLanguage(entrypoint: string): Promise<'rust' | 'javascript'> {
  // Check for Cargo.toml
  if (fs.existsSync(path.join(entrypoint, 'Cargo.toml'))) {
    return 'rust';
  }

  // Check for package.json with FastEdge SDK
  if (fs.existsSync(path.join(entrypoint, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (pkg.dependencies?.['@gcoredev/fastedge-sdk-js']) {
      return 'javascript';
    }
  }

  // Fall back to file extension
  const ext = path.extname(entrypoint);
  if (ext === '.rs') return 'rust';
  if (ext === '.js' || ext === '.ts') return 'javascript';

  throw new Error('Could not detect language');
}
```

---

## Rust Compilation

**SDK**: [FastEdge-sdk-rust](https://github.com/G-Core/FastEdge-sdk-rust)

### Requirements

**User must have**:
```bash
rustup target add wasm32-wasip1
```

**Why wasm32-wasip1?**
- WASI Preview 1 target
- Provides system interface for WASM
- Compatible with FastEdge runtime

### Build Process

**File**: `src/compiler/rustBuild.ts`

**Steps**:

1. **Locate Cargo.toml**:
```typescript
function findCargoToml(entrypoint: string): string {
  let currentDir = entrypoint;
  while (currentDir !== '/') {
    const cargoPath = path.join(currentDir, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error('Cargo.toml not found');
}
```

2. **Read package name from Cargo.toml**:
```typescript
// src/compiler/rustConfig.ts
import toml from 'toml';

function getPackageName(cargoTomlPath: string): string {
  const content = fs.readFileSync(cargoTomlPath, 'utf8');
  const config = toml.parse(content);
  return config.package.name;
}
```

3. **Run cargo build**:
```typescript
const { stdout, stderr } = await execAsync(
  'cargo build --target wasm32-wasip1',
  { cwd: projectRoot }
);
```

4. **Locate binary**:
```typescript
const binaryPath = path.join(
  projectRoot,
  'target',
  'wasm32-wasip1',
  'debug',
  `${packageName}.wasm`
);
```

5. **Validate binary exists**:
```typescript
if (!fs.existsSync(binaryPath)) {
  throw new Error(`Binary not found: ${binaryPath}`);
}
```

### Entrypoint Modes

**File mode** (`entrypoint: "file"`):
- Uses current active file location as CWD
- Walks up to find Cargo.toml
- Useful for multi-crate workspaces

**Workspace mode** (`entrypoint: "workspace"`):
- Uses workspace root as CWD
- Looks for Cargo.toml at workspace root
- Standard single-project setup

### Build Configuration

**Cargo.toml** must be configured for WASM:

```toml
[package]
name = "my-fastedge-app"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
fastedge = "0.1"  # FastEdge SDK

[profile.release]
opt-level = "z"    # Optimize for size
lto = true         # Link-time optimization
```

**Key requirements**:
- `crate-type = ["cdylib"]` - Creates dynamic library (WASM)
- FastEdge SDK dependency

### Common Errors

**"target 'wasm32-wasip1' may not be installed"**:
- Solution: `rustup target add wasm32-wasip1`

**"Cargo.toml not found"**:
- Solution: Ensure working in Rust project directory
- Or switch entrypoint mode

**"Binary not found"**:
- Solution: Check Cargo.toml `[package.name]` matches expected output
- Check for compilation errors in output

---

## JavaScript Compilation

**SDK**: [FastEdge-sdk-js](https://github.com/G-Core/FastEdge-sdk-js)

### Requirements

**User must have**:
```bash
npm install --save-dev @gcoredev/fastedge-sdk-js
```

**SDK provides**:
- `fastedge-build` CLI tool
- Runtime APIs for FastEdge

### Build Process

**File**: `src/compiler/jsBuild.ts`

**Steps**:

1. **Determine entrypoint**:

**File mode**:
```typescript
const entrypoint = activeEditor.document.uri.fsPath;
```

**Workspace mode**:
```typescript
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const entrypoint = path.join(workspaceRoot, pkg.main || 'index.js');
```

2. **Determine output path**:
```typescript
const outputPath = path.join(workspaceRoot, '.vscode', 'bin', 'debugger.wasm');
```

3. **Ensure output directory exists**:
```typescript
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
```

4. **Run fastedge-build**:
```typescript
const { stdout, stderr } = await execAsync(
  `npx fastedge-build ${entrypoint} ${outputPath}`,
  { cwd: workspaceRoot }
);
```

5. **Validate binary exists**:
```typescript
if (!fs.existsSync(outputPath)) {
  throw new Error(`Build failed: ${outputPath} not found`);
}
```

### Entrypoint Modes

**File mode** (`entrypoint: "file"`):
- Uses current active file as entrypoint
- Compiles single file to WASM
- Quick iteration on specific files

**Workspace mode** (`entrypoint: "workspace"`):
- Uses package.json "main" field
- Standard project build
- Full project compilation

### Build Tool

**fastedge-build** (from SDK):
- Bundles JavaScript/TypeScript code
- Compiles to WASM using ComponentizeJS
- Includes FastEdge runtime
- Produces standalone WASM binary

**Command format**:
```bash
fastedge-build <input> <output>
```

**Example**:
```bash
npx fastedge-build ./src/index.js ./.vscode/bin/debugger.wasm
```

### Common Errors

**"fastedge-build not found"**:
- Solution: Install FastEdge SDK: `npm install --save-dev @gcoredev/fastedge-sdk-js`

**"package.json not found"** (workspace mode):
- Solution: Ensure working in JavaScript project
- Or switch to file mode

**"Main entrypoint not found"** (workspace mode):
- Solution: Add "main" field to package.json
- Or switch to file mode

---

## Compilation Orchestration

**File**: `src/compiler/index.ts`

**Main export**:
```typescript
async function compile(config: LaunchConfig): Promise<string> {
  // 1. Detect language
  const language = await detectLanguage(config.entrypoint);

  // 2. Compile based on language
  let binaryPath: string;
  if (language === 'rust') {
    binaryPath = await rustBuild(config);
  } else {
    binaryPath = await jsBuild(config);
  }

  // 3. Validate binary
  validateBinary(binaryPath);

  // 4. Return path
  return binaryPath;
}
```

**Called from**: `FastEdgeDebugSession.launchRequest()`

---

## Binary Validation

**Checks performed**:

1. **File exists**:
```typescript
if (!fs.existsSync(binaryPath)) {
  throw new Error(`Binary not found: ${binaryPath}`);
}
```

2. **Is a file** (not directory):
```typescript
if (!fs.statSync(binaryPath).isFile()) {
  throw new Error(`Not a file: ${binaryPath}`);
}
```

3. **Has .wasm extension**:
```typescript
if (path.extname(binaryPath) !== '.wasm') {
  throw new Error(`Not a WASM file: ${binaryPath}`);
}
```

4. **Has content** (not empty):
```typescript
if (fs.statSync(binaryPath).size === 0) {
  throw new Error(`Empty binary: ${binaryPath}`);
}
```

**Why validate?**
- Catch build failures early
- Provide clear error messages
- Prevent cryptic runtime errors

---

## Build Output

### Console Output

**Build progress streamed to debug console**:

**Rust**:
```
Compiling my-fastedge-app v0.1.0 (/path/to/project)
    Finished dev [unoptimized + debuginfo] target(s) in 2.34s
Binary: /path/to/project/target/wasm32-wasip1/debug/my-fastedge-app.wasm
```

**JavaScript**:
```
Building /path/to/src/index.js
Output: /path/to/.vscode/bin/debugger.wasm
Build complete (3.45s)
```

### Error Output

**Compilation errors**:
```
Error: Compilation failed
  --> src/main.rs:10:5
   |
10 |     undefined_function();
   |     ^^^^^^^^^^^^^^^^^^ not found in this scope
```

**Streamed to debug console** with stderr formatting (red text)

---

## Build Optimization

### Development vs Production

**Current implementation**:
- Always builds in development mode
- No release/production flag

**Development mode**:
- Rust: `cargo build` (not `--release`)
- Faster builds
- Larger binaries
- Includes debug symbols

**Future**: Could add `--production` flag
- Rust: `cargo build --release`
- Smaller, optimized binaries
- Slower builds

### Incremental Builds

**Rust**:
- Cargo handles incremental compilation automatically
- Rebuilds only changed crates
- Fast iteration after first build

**JavaScript**:
- `fastedge-build` rebuilds every time
- No built-in incremental compilation
- Relatively fast for small projects

### Build Caching

**Rust**:
- Cargo cache in `target/` directory
- Persists across builds
- Safe to delete for clean build

**JavaScript**:
- No persistent cache currently
- Each build is from scratch
- `.vscode/bin/` can be gitignored

---

## Platform Considerations

### Rust Target

**Must be installed on all platforms**:
```bash
rustup target add wasm32-wasip1
```

**Works on**:
- Windows
- macOS
- Linux

### JavaScript Build Tool

**Included in SDK**:
- `fastedge-build` binary included in `@gcoredev/fastedge-sdk-js`
- Platform-specific binaries selected automatically
- No additional installation needed

---

## Error Handling

### Compilation Failures

**Caught and reported**:
```typescript
try {
  const binary = await compile(config);
} catch (error) {
  sendEvent(new OutputEvent(`Compilation failed: ${error.message}\n`, 'stderr'));
  sendErrorResponse(response, {
    format: 'Compilation failed',
    showUser: true
  });
  sendEvent(new TerminatedEvent());
}
```

**User sees**:
- Error in debug console
- Error notification
- Debug session terminates

### Build Tool Missing

**Rust**:
```
Error: cargo not found
Please install Rust: https://rustup.rs/
```

**JavaScript**:
```
Error: fastedge-build not found
Please install FastEdge SDK: npm install --save-dev @gcoredev/fastedge-sdk-js
```

---

## Key Takeaways

1. **Two languages** - Rust and JavaScript, different build tools
2. **Auto-detection** - Language determined from project structure
3. **Two entrypoint modes** - File vs workspace, different use cases
4. **Validation** - Binary checked before execution
5. **Incremental builds** - Cargo caches, JavaScript rebuilds
6. **Error handling** - Clear messages, graceful failures
7. **Platform support** - Works on Windows, macOS, Linux

---

**Related Documentation**:
- `PROJECT_OVERVIEW.md` - Supported languages overview
- `DEBUGGER_ARCHITECTURE.md` - How compiled binary is used
- `development/IMPLEMENTATION_GUIDE.md` - Adding language support

---

**Last Updated**: February 2026
