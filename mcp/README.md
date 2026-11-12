# SteadyRenew MCP server

SteadyRenew was previously called Subscription Manager. The package name (`subscription-manager-mcp`), `.tgz` download URL, and `SUBSCRIPTION_MANAGER_*` environment variables retain their existing names so installed integrations keep working without changes.

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets MCP clients (ChatGPT, Claude Desktop, Claude Code, Codex, Cursor, Windsurf, OpenCode, and others) operate a SteadyRenew account through its public API.

It loads `schema/ai-tools.json` (bundled from `docs-site/api/ai-tools.json` when packaging, with all `$ref` schemas recursively inlined) and exposes every tool defined there, so the MCP surface — tool names, purposes, risk levels, parameter schemas — never drifts from the documented API.

## Connection options

SteadyRenew supports three ways to connect MCP clients using the same `subm_...` API key created in **Settings → API & MCP** (both Free and Premium include **5 active keys** and **60 requests / minute**; keys do not expire unless revoked):

1. **Remote Streamable HTTP MCP (zero local install)**: connect directly to `https://steadyrenew.com/api/mcp` (or `<BASE_URL>/api/mcp` on self-hosted deployments) with header `Authorization: Bearer <SUBSCRIPTION_MANAGER_API_KEY>`. Works in ChatGPT Connectors, Claude Web/Desktop remote MCP, Claude Code (`claude mcp add --transport http`), and any Streamable HTTP MCP client.
2. **Single-file zero-dependency local script**: download `/downloads/steadyrenew-mcp.mjs` and run `node /absolute/path/to/steadyrenew-mcp.mjs` directly (Node.js 20+, no `npm install` needed).
3. **Standalone npm package archive**: download `/downloads/subscription-manager-mcp.tgz` and install in an empty directory (`npm install --ignore-scripts ./subscription-manager-mcp.tgz`).

For guided setup, open **Settings → API & MCP → Copy to Agent** in the web app, or read `/agent/setup.md`.

## Tools

All 11 tools from `ai-tools.json` are exposed:

- `list_subscriptions` (with `status`, `category`, `period`, `q`, `expiringBefore`, `sort` filters; active recurring subscriptions automatically roll overdue dates forward while free trials stay one-shot)
- `get_subscription`, `create_subscription`, `update_subscription`
- `delete_subscription` (permanent removal; records a `subscription.delete` entry in the audit log)
- `get_notification_settings`, `update_notification_settings` (`enabled` / `daysBefore` only)
- `get_spend_summary` (Free & Premium)
- `find_duplicate_subscriptions`, `get_optimization_suggestions` (**Premium only** — returns `403 premium_required` on Free)
- `list_audit_log`

Write tools require a key with the `write` scope; read and analytics tools work with a read-only (`read`) key. Soft cancel/pause/resume via `status` is not part of the public API surface. Bark URL, test push, `timeZone`, and `locale` stay web-managed (`/docs/en/user-guide/reminders`).

## Local stdio configuration

| Variable | Required | Description |
| --- | --- | --- |
| `SUBSCRIPTION_MANAGER_BASE_URL` | yes | Site origin without `/api/v1`, e.g. `https://steadyrenew.com` |
| `SUBSCRIPTION_MANAGER_API_KEY` | yes | API key created in **Settings → API & MCP** (`subm_...`) |
| `SUBSCRIPTION_MANAGER_TOOLS_SCHEMA` | no | Optional path to an `ai-tools.json` override |

### Claude Desktop / Cursor / Windsurf (`mcpServers` JSON)

```json
{
  "mcpServers": {
    "subscription-manager": {
      "command": "node",
      "args": ["/absolute/path/to/steadyrenew-mcp.mjs"],
      "env": {
        "SUBSCRIPTION_MANAGER_BASE_URL": "https://steadyrenew.com",
        "SUBSCRIPTION_MANAGER_API_KEY": "subm_xxx.yyy"
      }
    }
  }
}
```

(If installed from `subscription-manager-mcp.tgz`, set `args` to `["/absolute/path/to/integration/node_modules/subscription-manager-mcp/src/server.mjs"]`.)

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.steadyrenew]
command = "node"
args = ["/absolute/path/to/steadyrenew-mcp.mjs"]

[mcp_servers.steadyrenew.env]
SUBSCRIPTION_MANAGER_BASE_URL = "https://steadyrenew.com"
SUBSCRIPTION_MANAGER_API_KEY = "subm_xxx.yyy"
```

### Claude Code CLI

```bash
# Remote HTTP MCP (no local script required)
claude mcp add --transport http steadyrenew https://steadyrenew.com/api/mcp \
  --header "Authorization: Bearer subm_xxx.yyy"

# Or local stdio MCP
claude mcp add steadyrenew \
  -e SUBSCRIPTION_MANAGER_BASE_URL=https://steadyrenew.com \
  -e SUBSCRIPTION_MANAGER_API_KEY=subm_xxx.yyy \
  -- node /absolute/path/to/steadyrenew-mcp.mjs
```

### Installing the `.tgz` archive manually

If using `/downloads/subscription-manager-mcp.tgz`, install it in an **empty** directory (not inside another npm project or workspace):

```bash
npm install --ignore-scripts ./subscription-manager-mcp.tgz
```

npm 9.2 fails inside an existing project with `Tracker "idealTree" already exists`; use npm 10+, use `steadyrenew-mcp.mjs`, or unpack and run `bun install --ignore-scripts` inside `package/`.

For source development inside this repository:

```bash
cd mcp
npm install
SUBSCRIPTION_MANAGER_BASE_URL=https://steadyrenew.com \
SUBSCRIPTION_MANAGER_API_KEY=subm_xxx.yyy \
npm start
```

## Packaging and verification

`npm run build` at the repository root emits `/downloads/steadyrenew-mcp.mjs`, `/downloads/subscription-manager-mcp.tgz`, `/agent/setup.md`, `/agent/ai-tools.json`, and `/agent/openapi.yaml` (with the deployment's canonical site origin injected) into `dist/`.

After building from the repository root:

```bash
npm ci --prefix mcp --ignore-scripts
npm test --prefix mcp
```
