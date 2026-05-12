# FastEdge VSCode Extension — Development settings

End-users install the extension from the marketplace and follow [README.md](./README.md). This file is for in-house development.

---

## Pointing the MCP server at preprod from VS Code

The `FastEdge (Generate mcp.json)` command produces a `.vscode/mcp.json` that connects to the published `ghcr.io/g-core/fastedge-mcp-server:latest` image. By default the server hits prod (`https://api.gcore.com`). To route MCP API calls at preprod without hand-editing `mcp.json`:

1. Open VS Code Settings (`Cmd/Ctrl+,`).
2. Search **FastEdge**.
3. Set **FastEdge: Api Url** to `https://api.preprod.world` (or another non-prod base).
4. Run **FastEdge (Generate mcp.json)** — the regenerated file will include `GCORE_API_BASE` in both the docker `-e` flags and the `env` block.

When the setting is at its default, `GCORE_API_BASE` is omitted and the image's baked-in prod URL is used. The setting is read silently; no prompt appears during `Generate mcp.json`.

For the server side of preprod (rebuilding with preprod schemas, batch budgets, etc.), see [FastEdge-mcp-server/DEVELOPMENT.md](https://github.com/G-Core/FastEdge-mcp-server/blob/main/DEVELOPMENT.md).

## Environment / settings reference

| Where                         | Name              | Required | Purpose                                                                                                                                        |
| ----------------------------- | ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| VS Code setting               | `fastedge.apiUrl` | No       | Advanced override emitted as `GCORE_API_BASE` in generated `mcp.json`. Default `https://api.gcore.com` is omitted (image uses baked prod URL). |
| Host shell / Codespace secret | `GCORE_API_TOKEN` | Yes      | Your Gcore **Permanent API Token** (user-scoped). VS Code substitutes it into `mcp.json` as `${env:GCORE_API_TOKEN}` → `GCORE_API_KEY`.        |

> **403 troubleshooting** — `Access to user API denied for admin` means `GCORE_API_TOKEN` is an admin / reseller / master-scope credential, not a user-scoped Permanent API Token. Issue a Permanent API Token from your Gcore profile (Profile → API Tokens) and replace the value. The MCP server resolves tenancy from the token itself; there is no `client_id` / `project_id` plumbing.

## Building and packaging the extension

```sh
pnpm install
pnpm run build           # build extension
pnpm run build:dev       # watch mode
pnpm run package         # produce a .vsix
pnpm run lint            # ESLint
```

See `context/CONTEXT_INDEX.md` for the discovery-based context map and `AGENTS.md` for governance rules.
