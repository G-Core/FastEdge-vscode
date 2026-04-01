# Archived Context — DAP Era (pre-Feb 2026)

This folder contains documentation from the **pre-February 2026 architecture**, before the extension was rebuilt around a standalone Node server + webview UI.

---

## What changed

The extension originally implemented VS Code's **Debug Adapter Protocol (DAP)** — a custom `FastEdgeDebugSession`, `BinaryDebugConfigurationProvider`, and a three-tier configuration hierarchy (`launch.json → dotenv → defaults`). All of this was removed in the February 2026 refactor in favour of:

- A bundled Node server (`dist/debugger/server.js`) started via `fork()`
- A webview panel embedding the debugger UI
- Per-app root isolation with `.fastedge-debug/` directory as the anchor
- Runtime config managed entirely in the debugger UI (not launch.json)

## When to read these files

- You need to understand **why** a design decision was made (e.g. why `launch.json` properties are ignored)
- You are researching **legacy behaviour** for a migration or compatibility reason
- You are writing a post-mortem or architectural history

**Do NOT use these files for current development guidance.**

---

## Contents

| File | What it covers |
|------|----------------|
| `ARCHIVED_CHANGE_LOG.md` | CHANGELOG entries before [2026-02-10] |
| `ARCHIVED_CONFIGURATION_SYSTEM.md` | Full DAP-era three-tier config hierarchy (launch.json, dotenv, defaults) |

The [2026-02-10] CHANGELOG entry ("Debugger Integration via Webview") documents the actual transition and lives in the **current** `context/CHANGELOG.md` — read it if you want to understand the pivot point.
