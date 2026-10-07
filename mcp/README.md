# Subscription Manager MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets MCP
clients (Claude Desktop, Cursor, and others) operate a Subscription Manager
account through its public API.

It loads the bundled `schema/ai-tools.json` (copied from `docs-site/api/ai-tools.json` when packaging) and exposes every tool defined
there, so the MCP surface — tool names, purposes, risk levels, parameter schemas
— always matches the documented API. Each tool call is proxied to the REST API
with your bearer key.

## Tools

All tools from the API tool schema are exposed, including:

- `list_subscriptions` (with `status`, `category`, `period`, `q`, `expiringBefore`, `sort` filters)
- `get_subscription`, `create_subscription`, `update_subscription`
- `delete_subscription` (permanent)
- `get_notification_settings`, `update_notification_settings` (`enabled` / `daysBefore` only)
- `get_spend_summary`, `find_duplicate_subscriptions`, `get_optimization_suggestions`
- `list_audit_log`

Write tools require a key with the `write` scope; read and analytics tools work
with a read-only key. Soft cancel/pause/resume via `status` is not part of the
public API surface. Bark URL, test push, timeZone, and locale stay web-managed;
the tool schema tells agents to refuse those requests and point users to the
reminders guide.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `SUBSCRIPTION_MANAGER_BASE_URL` | yes | Site origin, e.g. `https://subscriptions.example.com` |
| `SUBSCRIPTION_MANAGER_API_KEY` | yes | A key created in the dashboard (`subm_...`) |
| `SUBSCRIPTION_MANAGER_TOOLS_SCHEMA` | no | Path to an `ai-tools.json` override |

## Install and run

For guided setup, open **Settings → API & MCP → Copy to Agent** on your website.
The instructions use that website's origin and can optionally include a newly
created key. The public guide is served at `/agent/setup.md`.

Download `/downloads/subscription-manager-mcp.tgz` from your website, then install
it in a persistent private directory:

```bash
npm install --ignore-scripts ./subscription-manager-mcp.tgz
```

Configure a local stdio MCP client to run Node with the absolute path to
`node_modules/subscription-manager-mcp/src/server.mjs`. The archive includes its
tool schema; no repository checkout is needed. Node.js 20+ is required. This is a
downloadable local server, not a hosted remote MCP endpoint. Direct API access is
available for agents that can make HTTP requests but cannot run local servers.

For source development:

```bash
cd mcp
npm install
SUBSCRIPTION_MANAGER_BASE_URL=https://subscriptions.example.com \
SUBSCRIPTION_MANAGER_API_KEY=subm_xxx.yyy \
npm start
```

## Connect from a client

Claude Desktop (`claude_desktop_config.json`) or any MCP client:

```json
{
  "mcpServers": {
    "subscription-manager": {
      "command": "node",
      "args": ["/absolute/path/to/integration/node_modules/subscription-manager-mcp/src/server.mjs"],
      "env": {
        "SUBSCRIPTION_MANAGER_BASE_URL": "https://subscriptions.example.com",
        "SUBSCRIPTION_MANAGER_API_KEY": "subm_xxx.yyy"
      }
    }
  }
}
```

Use a read-only key here if you only want analysis and listing; the server will
return a `403 insufficient_scope` error (surfaced to the model) if a write tool
is attempted with a read-only key.

Merge this entry into existing client configuration. Store keys privately, then
reload the client and call `list_subscriptions` with `{"limit":1}` to verify.
An empty list succeeds. Creating a config file alone does not verify a connection.
The API works with cloud-synced records; browser-only data is unavailable.

## Packaging and verification

The root `npm run build` emits the package, setup guide, and both API schemas into
`dist/`. Vite serves the same files in development; run `npm run dev:full` for API
functions as well. `npm pack` inside `mcp/` also includes the canonical schema via
the `prepack` script. Public npm publication is not required.

After building from the repository root:

```bash
npm ci --prefix mcp --ignore-scripts
npm test --prefix mcp
```

The test installs the actual downloadable archive outside the repository and
connects an MCP client over stdio to verify tool discovery, CRUD request mapping,
authentication errors, and invalid-response handling against a local test API.
