---
title: "Connect SteadyRenew to an MCP client"
slug: manage-subscriptions-with-mcp
description: "Set up the SteadyRenew MCP server to query subscriptions, review spending, and update reminders. Includes API key permissions and a sample configuration."
date: 2026-09-17
status: published
lang: en
canonical: https://steadyrenew.com/blog/manage-subscriptions-with-mcp
---

If you keep your subscriptions in [SteadyRenew](https://steadyrenew.com/app), you can connect an MCP client to query those records. For example, you can ask which subscriptions renew in the next two weeks or how much you spend in each currency.

The setup uses the MCP server included in this repository and a Developer API key. The server lets your client read subscription records and, with write permission, edit them. It does not access bank transactions or cancel services with merchants.

**Setup overview**

1. Create a Developer API key (`subm_…`) with `read` or `write` scope.
2. Set `SUBSCRIPTION_MANAGER_BASE_URL` and `SUBSCRIPTION_MANAGER_API_KEY`.
3. Point your MCP client at `mcp/src/server.mjs` with `node`.
4. Ask a read-only question first.
5. Configure Bark in the web app if you want push reminders.
6. Use the [API docs](https://steadyrenew.com/docs/en/api/overview) and [AI tools schema](https://steadyrenew.com/agent/ai-tools.json) when you need full detail.

## How MCP connects to the API

**MCP** (Model Context Protocol) lets an assistant call tools such as `list_subscriptions` and `get_spend_summary`.

The **REST API at `/api/v1`** exposes the same operations over HTTP for scripts and other integrations.

The MCP server in the repo’s `mcp/` package proxies each tool call to `/api/v1` with your bearer key. Both interfaces use the same records, permissions, and rate limits.

## What you’ll need

- A signed-in [SteadyRenew](https://steadyrenew.com/app) account with some subscriptions already in the ledger (or add them in the web UI / via write tools later). If the list is empty, start with the [subscription audit how-to](/blog/how-to-do-a-subscription-audit).
- A Developer API key from the user menu → **Developer API** (the full key is shown once—store it like a password).
- Node.js 20+ to run the MCP server (see the package README for current install steps).
- An MCP client (Claude Desktop is the copy-paste example below; Cursor, Codex, OpenCode, and others use the same pattern).
- Optional: Bark already set up under **Settings → Notifications** if you want push reminders. The agent cannot set your Bark URL.

## Create a key (read vs write)

Keys look like `subm_…` and authenticate as:

```http
Authorization: Bearer subm_…
```

| Scope | Can do |
| --- | --- |
| `read` | List/get subscriptions; read notification settings; analytics; audit log |
| `write` | Everything `read` allows, plus create/update/delete subscriptions and update notification settings (`enabled` / `daysBefore`) |

**Quotas (per user):**

| Plan | Active keys | Requests |
| --- | --- | --- |
| Free | 1 | 60 / hour |
| Premium | 5 | 1000 / hour |

A **read-only** key is enough to list subscriptions and review spending. If you try to edit a record with that key, the API returns `403 insufficient_scope`.

## Connect an MCP client (Claude Desktop example)

Clone or open the [subscription-management](https://github.com/JerryyrreJ/subscription-management) repo, then install the MCP package:

```bash
cd mcp
npm install
```

Entry point: `mcp/src/server.mjs`.

Environment variables:

| Variable | Required | Example |
| --- | --- | --- |
| `SUBSCRIPTION_MANAGER_BASE_URL` | yes | `https://steadyrenew.com` |
| `SUBSCRIPTION_MANAGER_API_KEY` | yes | `subm_…` |

### Claude Desktop configuration

Add a server to `claude_desktop_config.json` (file location varies by OS—use Claude’s current docs):

```json
{
  "mcpServers": {
    "subscription-manager": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/src/server.mjs"],
      "env": {
        "SUBSCRIPTION_MANAGER_BASE_URL": "https://steadyrenew.com",
        "SUBSCRIPTION_MANAGER_API_KEY": "subm_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving. Use an absolute path to `server.mjs`.

**Cursor:** same `command` / `args` / `env` trio—`node`, absolute path to `mcp/src/server.mjs`, plus the two env vars. Where you paste that in Cursor’s UI changes over time; follow Cursor’s current MCP docs and our [AI tools page](https://steadyrenew.com/agent/ai-tools.json).

More install detail: repo [`mcp/README.md`](https://github.com/JerryyrreJ/subscription-management/tree/main/mcp).

### Other MCP clients

Any MCP-compatible client uses the same pattern: run `node` on the absolute path to `mcp/src/server.mjs`, and set `SUBSCRIPTION_MANAGER_BASE_URL` + `SUBSCRIPTION_MANAGER_API_KEY`. Refer to your client’s MCP settings for the configuration file location and format.

## What the agent can do (11 tools)

Tool names match the documented schema one-for-one. Write tools need a write-scoped key.

**Subscriptions**

- `list_subscriptions` — filters include `status`, `category`, `period`, `q`, `expiringBefore`, `sort`
- `get_subscription`
- `create_subscription`
- `update_subscription`
- `delete_subscription` — permanently removes the **tracked record** in your ledger

**Reminders (global only)**

- `get_notification_settings`
- `update_notification_settings` — writable fields only: `enabled` and `daysBefore` (`1` | `3` | `7` | `14`)

**Analytics**

- `get_spend_summary`
- `find_duplicate_subscriptions`
- `get_optimization_suggestions` — suggestions for subscriptions to review

**Audit**

- `list_audit_log`

Full parameter schemas: [https://steadyrenew.com/agent/ai-tools.json](https://steadyrenew.com/agent/ai-tools.json). REST reference: [https://steadyrenew.com/docs/en/api/overview](https://steadyrenew.com/docs/en/api/overview).

## Limits to keep in mind

**No merchant cancel.** There are no `cancel` / `pause` / `resume` tools. The public API does not soft-cancel by writing `status`. `delete_subscription` removes the row from *your* tracker—it does **not** cancel Netflix, Spotify, Apple, or anyone else on your behalf. Cancel on the provider’s site or app; then update your tracker to reflect the change.

**No Bark URL / test push / timeZone / locale via MCP or REST.** Those stay in the web app (**Settings → Notifications**). To configure them, follow the [reminders guide](https://github.com/JerryyrreJ/subscription-management/blob/main/docs/en/notifications.md).

**Review suggestions before acting.** A duplicate or optimization suggestion may be worth checking, but it does not mean you can cancel a plan without losing something you use.

**No access without your key.** Treat `subm_…` like a password. Use a read-only key if you only need queries.

## Example prompts to try

After the server shows up in your MCP client:

- “List subscriptions expiring in the next 14 days.”
- “Summarize spend by currency and category.”
- “Find likely duplicate subscriptions.”
- “Turn global reminders on and set `daysBefore` to 3.” (needs write)
- “Show recent API audit entries for subscription updates.”

Bark URLs and test notifications are managed in the [web app](https://steadyrenew.com/app) under **Settings → Notifications**.

## Prefer scripts? Use the same REST API

Anything MCP can do, curl can do against `/api/v1` with the same bearer key and quotas.

```bash
curl -sS https://steadyrenew.com/api/v1/subscriptions \
  -H "Authorization: Bearer subm_your_key_here"
```

- Docs: [https://steadyrenew.com/docs/en/api/overview](https://steadyrenew.com/docs/en/api/overview)
- Agent tool schema: [https://steadyrenew.com/agent/ai-tools.json](https://steadyrenew.com/agent/ai-tools.json)
- OpenAPI: linked from the API docs (`openapi.yaml`)

Use MCP when you want an assistant in the loop. Use REST when you want a script, a cron job, or your own agent runtime.

## Reference links

- Ledger: [https://steadyrenew.com/app](https://steadyrenew.com/app)
- API docs: [https://steadyrenew.com/docs/en/api/overview](https://steadyrenew.com/docs/en/api/overview)
- AI tools schema: [https://steadyrenew.com/agent/ai-tools.json](https://steadyrenew.com/agent/ai-tools.json)
- MCP package: [github.com/JerryyrreJ/subscription-management/tree/main/mcp](https://github.com/JerryyrreJ/subscription-management/tree/main/mcp)
- Fill the list first: [How to do a subscription audit](/blog/how-to-do-a-subscription-audit)

## FAQ

### Do I need to link my bank?

No. The MCP server accesses the subscription records in your account. You or your assistant add and update those records.

### Will the AI cancel Netflix for me?

No. Agents can update or delete **tracked records** in your account. Merchant billing still has to be canceled with Netflix, Apple, Google Play, or whoever charges you.

### MCP or REST — which should I use?

Use MCP to work with your subscriptions through an assistant. Use REST for scripts and custom automation. Both talk to the same `/api/v1` backend with the same key scopes and rate limits.

### Why did `update_notification_settings` reject my Bark URL?

The PATCH body only accepts `enabled` and `daysBefore` (1, 3, 7, or 14). Bark URL, test push, timeZone, and locale are web-only—configure them under **Settings → Notifications**. See the [reminders guide](https://github.com/JerryyrreJ/subscription-management/blob/main/docs/en/notifications.md).

### What are the Free vs Premium API limits?

Free: 1 active key and 60 requests per user per hour. Premium: 5 active keys and 1000 requests per user per hour. Responses include `X-RateLimit-*` headers; `429` includes `Retry-After`.
