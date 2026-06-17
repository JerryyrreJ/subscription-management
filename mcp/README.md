# Subscription Manager MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets MCP
clients (Claude Desktop, Cursor, and others) operate a Subscription Manager
account through its public API.

It loads `docs-site/api/ai-tools.json` at startup and exposes every tool defined
there, so the MCP surface — tool names, purposes, risk levels, parameter schemas
— always matches the documented API. Each tool call is proxied to the REST API
with your bearer key.

## Tools

All twelve tools from the API tool schema are exposed, including:

- `list_subscriptions` (with `status`, `category`, `period`, `q`, `expiringBefore`, `sort` filters)
- `get_subscription`, `create_subscription`, `update_subscription`
- `cancel_subscription`, `pause_subscription`, `resume_subscription` (status changes that keep history)
- `delete_subscription` (permanent)
- `get_spend_summary`, `find_duplicate_subscriptions`, `get_optimization_suggestions`
- `list_audit_log`

Write tools require a key with the `write` scope; read and analytics tools work
with a read-only key.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `SUBSCRIPTION_MANAGER_BASE_URL` | yes | Site origin, e.g. `https://subscriptions.example.com` |
| `SUBSCRIPTION_MANAGER_API_KEY` | yes | A key created in the dashboard (`subm_...`) |
| `SUBSCRIPTION_MANAGER_TOOLS_SCHEMA` | no | Path to an `ai-tools.json` override |

## Install and run

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
      "args": ["/absolute/path/to/mcp/src/server.mjs"],
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
