# MCP Integration

The extension can generate a `.vscode/mcp.json` that wires up the
`fastedge-assistant` MCP server so AI clients (Claude, Codex, Cursor) can
use FastEdge tools from inside the workspace.

---

## How it works

Command: **FastEdge (Generate mcp.json)** → `src/commands/mcpJson.ts`

1. Reads any existing `.vscode/mcp.json` and merges the new server entry in.
2. Detects Codespaces (`CODESPACE_NAME` env): offers `gh secret set` path
   (stores key as a Codespace secret, emits `${env:GCORE_API_KEY}` in the
   file) or falls back to inline key with a security notice.
3. Prompts for the API key (**masked input**, `password: true`).
4. Writes the file; sets `chmod 0600` on local `file://` URIs (no-op on
   Windows / remote providers).
5. Offers to add `.vscode/mcp.json` to `.gitignore`.

The generated entry looks like:

```json
{
  "servers": {
    "fastedge-assistant": {
      "type": "stdio",
      "command": "docker",
      "args": ["run", "--rm", "-i", "--pull=always",
               "-v", "${workspaceFolder}:/workspace",
               "-e", "WORKSPACE_ROOT=/workspace",
               "-e", "GCORE_API_KEY",
               "ghcr.io/g-core/fastedge-mcp-server:0.2.9"],
      "env": { "GCORE_API_KEY": "<key>" }
    }
  }
}
```

---

## Pinned image version — how to bump it

Tags on ghcr.io have no `v` prefix. The Docker image tag (`0.2.9` above) is **not hardcoded in source**. It is
read from a single file at build time and injected by esbuild:

```
mcp-server.version          ← edit this file to bump the version
esbuild/build-ext.js        ← reads the file, passes to esbuild define
src/globals.d.ts            ← TypeScript ambient declaration
src/commands/mcpJson.ts     ← uses __MCP_SERVER_VERSION__ (injected constant)
```

**To bump the version:**

```bash
echo "0.3.0" > mcp-server.version
# rebuild — the new tag is baked into dist/extension.js
npm run build
```

A future CI job in the MCP server's release pipeline can automate this step
by committing the updated `mcp-server.version` file and triggering a new
extension release.

**Do not edit the version string in `mcpJson.ts` directly** — it uses the
injected constant and will not reflect manual edits after a rebuild.

---

## Key files

| File | Role |
|------|------|
| `mcp-server.version` | Single source of truth for the pinned image tag |
| `esbuild/build-ext.js` | Reads version file, injects `__MCP_SERVER_VERSION__` via esbuild `define` |
| `src/globals.d.ts` | Ambient TS declaration for `__MCP_SERVER_VERSION__` |
| `src/commands/mcpJson.ts` | `createMCPJson` command + `getDockerCommand` builder |
| `src/commands/mcpJson.test.ts` | Unit tests for `getDockerCommand` argv shape |

---

## `getDockerCommand` — security invariants

The docker command is built as an **argv array** (no shell wrapper), so the
workspace path in `-v ${workspaceFolder}:/workspace` cannot inject shell
syntax. Tests in `mcpJson.test.ts` assert this. Do not add `bash -c` or
`cmd /c` wrappers.

Credentials are forwarded with bare `-e GCORE_API_KEY` (value comes from the
MCP client's `env` block, never from shell expansion).

---

## Codespace path

When `CODESPACE_NAME` is set, the command offers to call `setupCodespaceSecret`
first. That function stores the key via `gh secret set` (spawned with `spawn`,
secret on stdin — not in argv). If the user takes this path, the generated
file uses `${env:GCORE_API_KEY}` instead of an inline key.

---

**Last Updated**: 2026-09-01
