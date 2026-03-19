# Build System

## What the Build Produces

A release produces three platform-specific VSIX files:

```
fastedge-vscode-<version>-linux-x64.vsix
fastedge-vscode-<version>-darwin-arm64.vsix
fastedge-vscode-<version>-win32-x64.vsix
```

Each contains `dist/extension.js` (the bundled extension) and `dist/debugger/` (the bundled fastedge-debugger server + React UI + one platform binary).

---

## Extension Bundling — esbuild

**Config**: `esbuild/build-ext.js`

| Setting | Value | Reason |
|---------|-------|--------|
| Entry | `src/extension.ts` | Single extension entry point |
| Output | `dist/extension.js` | CommonJS — required by VS Code extension host |
| Format | `cjs` | VS Code extension host uses `require()` |
| Platform | `node` | Extension runs in Node.js, not browser |
| External | `vscode` | Provided at runtime by VS Code — must not be bundled |
| Minify | prod only | Dev builds retain readability |
| Sourcemaps | dev only | Omitted in prod (`sourcesContent: false`) |

**Scripts:**
- `pnpm run build` — type-check (`tsc --noEmit`) then esbuild prod bundle
- `pnpm run build:dev` — esbuild in watch mode (no type-check, sourcemaps on)

The extension bundle is small (~19KB minified). All `node_modules` are bundled in except `vscode`.

---

## VSIX Packaging

**Command**: `vsce package --no-dependencies --target <os_target>`

`--no-dependencies` is required because all deps are already bundled by esbuild. Without it, `vsce` would try to package `node_modules/`, which is excluded by `.vscodeignore` anyway.

### What `.vscodeignore` Controls

Default `vsce` behaviour includes everything not gitignored. `.vscodeignore` narrows it down:

**Excluded** (among others):
- `src/**`, `**/*.ts` — TypeScript source
- `esbuild/**` — build scripts
- `context/**` — developer documentation
- `node_modules/**`
- `.github`, `.vscode`, config files

**Critically re-included:**
```
!dist/debugger/**
```

`dist/debugger/` would be excluded by the broad `**/*.js.map` and other rules if not explicitly re-included. This line is load-bearing — removing it produces a broken VSIX (extension activates but server never starts).

**Also excluded inside debugger:**
```
dist/debugger/node_modules/**
```
Prevents vsce packaging issues from any stray `node_modules` inside the bundled debugger.

---

## CI / Release Pipeline

Three reusable workflows in `.github/workflows/`. Triggered by a `v*` tag (or manual `workflow_dispatch` on `create-release.yml`).

### Flow

```
create-release.yml (orchestrator)
  │
  ├─► download-debugger.yml
  │     Job 1: download-debugger
  │       - Resolves version (latest or specified)
  │       - Downloads fastedge-debugger.zip from godronus/fastedge-test releases
  │       - Verifies sha256 checksum
  │       - Uploads raw artifact (all platforms, all binaries)
  │     Job 2: filter-for-platforms (matrix × 3, parallel)
  │       - linux-x64 → keeps fastedge-run-linux-x64, chmod +x
  │       - darwin-arm64 → keeps fastedge-run-darwin-arm64, chmod +x
  │       - win32-x64 → keeps fastedge-run.exe (no chmod)
  │       - All: removes dist/lib/ (npm package output, not needed)
  │       - All: creates debugger-metadata.json with versions + platform
  │       - Uploads: fastedge-debugger-<os_target>-artifact
  │
  └─► build-extension.yml (called 3×, one per platform)
        - Runs on: ubuntu-latest (for all three targets)
        - Downloads fastedge-debugger-<os_target>-artifact → dist/debugger/
        - Injects tag version into package.json via jq
        - Verifies exactly 1 CLI binary present in dist/debugger/fastedge-cli/
        - pnpm run build (type-check + esbuild)
        - vsce package --no-dependencies --target <os_target>
        - sha256 checksum
        - Uploads .vsix + .vsix.sha256 to GitHub Release
```

### Why All Builds Run on ubuntu-latest

`vsce package --target` handles cross-platform VSIX creation from any host OS. There is no native compilation during packaging — the binary is pre-built and already in `dist/debugger/fastedge-cli/`. Running everything on ubuntu-latest simplifies the matrix and avoids macOS/Windows runner costs.

### Version Injection

The tag (e.g. `v0.1.5`) has its `v` prefix stripped and is written into `package.json` via:
```bash
jq --arg version "$TAG_VERSION" '.version = $version' package.json > package.tmp.json
mv package.tmp.json package.json
```
This happens in CI only — `package.json` in the repo carries a dev version.

---

## Key Invariants

These are non-obvious constraints that will silently break things if violated:

| Invariant | Where enforced | What breaks |
|-----------|---------------|-------------|
| `!dist/debugger/**` in `.vscodeignore` | `.vscodeignore:44` | VSIX packages with no server — extension activates but cannot start debugger |
| Exactly 1 `fastedge-run*` binary per VSIX | `build-extension.yml` — binary count check | CI fails; if somehow bypassed, wrong binary runs on one platform |
| `dist/lib/` stripped from debugger artifact | `download-debugger.yml` | Bloats every VSIX with unused npm package output |
| `vscode` kept external in esbuild | `esbuild/build-ext.js:external` | Bundle fails — VS Code APIs are only available at runtime via the host |
| `--no-dependencies` on vsce package | `build-extension.yml` | vsce tries to resolve node_modules that aren't there (esbuild already bundled them) |

---

**Last Updated**: March 2026
