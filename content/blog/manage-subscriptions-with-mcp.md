---
title: "Let Claude, Cursor, or another MCP client manage your subscriptions (and the REST API)"
slug: manage-subscriptions-with-mcp
description: "Connect Subscription Manager to any MCP client—Claude Desktop, Cursor, Codex, OpenClaw, and more. List spend, spot duplicates, update reminders via the same REST API."
date: 2026-09-17
status: published
lang: en
canonical: https://sub.jerrylu.xyz/blog/manage-subscriptions-with-mcp
---

You already track subscriptions somewhere—spreadsheet, notes, or the [Subscription Manager](https://sub.jerrylu.xyz) web ledger. The next step is asking an **MCP client** questions like “what renews in the next two weeks?” or “any duplicate streaming plans?” without pasting rows into chat.

Whether you manage subscriptions with Claude Desktop, Cursor, Codex, OpenClaw, or another MCP-compatible client, the wiring is the same: run our MCP server, pass your API key, and let the assistant call tools against your ledger. This is not a bank feed, and not a cancel-for-you service.

**Checklist**

1. Create a Developer API key (`subm_…`) with `read` or `write` scope.  
2. Set `SUBSCRIPTION_MANAGER_BASE_URL` and `SUBSCRIPTION_MANAGER_API_KEY`.  
3. Point your MCP client at `mcp/src/server.mjs` with `node`.  
4. Ask a read-only question first.  
5. Know the hard limits (no merchant cancel; Bark URL stays web-only).  
6. Use the [API docs](https://sub.jerrylu.xyz/api) and [AI tools schema](https://sub.jerrylu.xyz/api/ai-tools) when you need full detail.

## MCP vs REST in one minute

**MCP** (Model Context Protocol) is the AI-native front door: named tools an MCP client can call.

**REST `/api/v1`** is the same capability over HTTP—for curl, scripts, CI, or a custom agent.

The MCP server in the repo’s `mcp/` package proxies each tool call to `/api/v1` with your bearer key. Same data, same scopes, same quotas—two ways in.

## What you’ll need

- A signed-in [Subscription Manager](https://sub.jerrylu.xyz) account with some subscriptions already in the ledger (or add them in the web UI / via write tools later). If the list is empty, start with the [subscription audit how-to](/blog/how-to-do-a-subscription-audit).  
- A Developer API key from the user menu → **Developer API** (the full key is shown once—store it like a password).  
- Node.js 20+ to run the MCP server (see the package README for current install steps).  
- An MCP client (Claude Desktop is the copy-paste example below; Cursor, Codex, OpenCode, and others use the same pattern).  
- Optional: Bark already set up under **Settings → Notifications** if you care about push reminders. The agent cannot set your Bark URL.

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

For a first session in any MCP client, start with a **read-only** key. If the model tries a write tool, the API returns `403 insufficient_scope` and the client surfaces that to the model.

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
| `SUBSCRIPTION_MANAGER_BASE_URL` | yes | `https://sub.jerrylu.xyz` |
| `SUBSCRIPTION_MANAGER_API_KEY` | yes | `subm_…` |

### Claude Desktop (copy-paste config)

Add a server to `claude_desktop_config.json` (file location varies by OS—use Claude’s current docs):

```json
{
  "mcpServers": {
    "subscription-manager": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/src/server.mjs"],
      "env": {
        "SUBSCRIPTION_MANAGER_BASE_URL": "https://sub.jerrylu.xyz",
        "SUBSCRIPTION_MANAGER_API_KEY": "subm_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving. Use an absolute path to `server.mjs`.

**Cursor:** same `command` / `args` / `env` trio—`node`, absolute path to `mcp/src/server.mjs`, plus the two env vars. Where you paste that in Cursor’s UI changes over time; follow Cursor’s current MCP docs and our [AI tools page](https://sub.jerrylu.xyz/api/ai-tools).

More install detail: repo [`mcp/README.md`](https://github.com/JerryyrreJ/subscription-management/tree/main/mcp).

### Other MCP clients

Any MCP-compatible client uses the same pattern: run `node` on the absolute path to `mcp/src/server.mjs`, and set `SUBSCRIPTION_MANAGER_BASE_URL` + `SUBSCRIPTION_MANAGER_API_KEY`. Menu labels differ by product; we are not documenting every UI click-path here.

That includes MCP-compatible clients such as **Claude**, **Codex**, **OpenCode**, **Z Code**, **Hermes**, **OpenClaw**, and **Cursor**. If you searched for how to manage subscriptions with OpenClaw or Codex via MCP, this is the same server and the same env vars—wire them into whatever config format that client expects.

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
- `get_optimization_suggestions` — candidates only; no invented dollar savings

**Audit**

- `list_audit_log`

Full parameter schemas: [https://sub.jerrylu.xyz/api/ai-tools](https://sub.jerrylu.xyz/api/ai-tools). Human REST reference: [https://sub.jerrylu.xyz/api](https://sub.jerrylu.xyz/api).

## What it deliberately cannot do

**No merchant cancel.** There are no `cancel` / `pause` / `resume` tools. The public API does not soft-cancel by writing `status`. `delete_subscription` removes the row from *your* tracker—it does **not** cancel Netflix, Spotify, Apple, or anyone else on your behalf. Cancel on the provider’s site or app; keep the ledger honest with create/update/delete.

**No Bark URL / test push / timeZone / locale via MCP or REST.** Those stay in the web app (**Settings → Notifications**). If you ask the agent to change your Bark URL or fire a test push, it should refuse and point you at the [reminders guide](https://github.com/JerryyrreJ/subscription-management/blob/main/docs/en/notifications.md).

**No fake savings math.** Optimization suggestions are candidates, not promised discounts.

**No access without your key.** Treat `subm_…` like a password. Prefer read-only until you trust the workflow.

## Example prompts to try

After the server shows up in your MCP client:

- “List subscriptions expiring in the next 14 days.”  
- “Summarize spend by currency and category.”  
- “Find likely duplicate subscriptions.”  
- “Turn global reminders on and set `daysBefore` to 3.” (needs write)  
- “Show recent API audit entries for subscription updates.”

**Negative example:** “Change my Bark URL to …” — expect a refusal and a pointer to web notification settings / the reminders guide.

When the ledger answers usefully, keep using the [web app](https://sub.jerrylu.xyz) for Bark setup and day-to-day edits, and leave the MCP client for queries and careful writes.

## Prefer scripts? Use the same REST API

Anything MCP can do, curl can do against `/api/v1` with the same bearer key and quotas.

```bash
curl -sS https://sub.jerrylu.xyz/api/v1/subscriptions \
  -H "Authorization: Bearer subm_your_key_here"
```

- Docs: [https://sub.jerrylu.xyz/api](https://sub.jerrylu.xyz/api)  
- Agent tool schema: [https://sub.jerrylu.xyz/api/ai-tools](https://sub.jerrylu.xyz/api/ai-tools)  
- OpenAPI: linked from the API docs (`openapi.yaml`)

Use MCP when you want an assistant in the loop. Use REST when you want a script, a cron job, or your own agent runtime.

## Soft CTA

- Ledger: [https://sub.jerrylu.xyz](https://sub.jerrylu.xyz)  
- API docs: [https://sub.jerrylu.xyz/api](https://sub.jerrylu.xyz/api)  
- AI tools schema: [https://sub.jerrylu.xyz/api/ai-tools](https://sub.jerrylu.xyz/api/ai-tools)  
- MCP package: [github.com/JerryyrreJ/subscription-management/tree/main/mcp](https://github.com/JerryyrreJ/subscription-management/tree/main/mcp)  
- Fill the list first: [How to do a subscription audit](/blog/how-to-do-a-subscription-audit)

## FAQ

### Do I need to link my bank?

No. Subscription Manager is a personal, privacy-minded ledger you (or your agent) maintain. There is no bank login or Plaid-style scrape in this product model.

### Will the AI cancel Netflix for me?

No. Agents can update or delete **tracked records** in your account. Merchant billing still has to be canceled with Netflix, Apple, Google Play, or whoever charges you.

### MCP or REST — which should I use?

Use MCP when you want an MCP client (Claude, Cursor, OpenClaw, Codex, and so on) to call tools in natural language. Use REST for scripts and custom automation. Both talk to the same `/api/v1` backend with the same key scopes and rate limits.

### Why did `update_notification_settings` reject my Bark URL?

By design. The PATCH body only accepts `enabled` and `daysBefore` (1, 3, 7, or 14). Bark URL, test push, timeZone, and locale are web-only—configure them under **Settings → Notifications**. See the [reminders guide](https://github.com/JerryyrreJ/subscription-management/blob/main/docs/en/notifications.md).

### What are the Free vs Premium API limits?

Free: 1 active key and 60 requests per user per hour. Premium: 5 active keys and 1000 requests per user per hour. Responses include `X-RateLimit-*` headers; `429` includes `Retry-After`.
