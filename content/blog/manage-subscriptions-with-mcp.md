---
title: "Connect SteadyRenew to an MCP client"
slug: manage-subscriptions-with-mcp
description: "Connect Claude Desktop, Cursor, or another MCP client to your SteadyRenew subscription list to query upcoming renewals, check multi-currency spend, and update records."
date: 2026-09-17
updated: 2026-11-12
status: published
lang: en
canonical: https://steadyrenew.com/blog/manage-subscriptions-with-mcp/
---

Once your recurring bills live in [SteadyRenew](https://steadyrenew.com/app), you do not have to open the web dashboard every time you want to check when a plan renews. You can wire an MCP-compatible assistant (Claude Desktop, Cursor, Codex, OpenCode, or your own client) straight to your account and ask plain questions like *"Which subscriptions renew in the next two weeks?"* or *"How much am I spending per month in EUR vs. USD?"*

Under the hood, the local MCP server in this repository (`mcp/src/server.mjs`) is a thin Node wrapper around the public `/api/v1` REST endpoints. Every tool call authenticates with a Developer API key you generate in your account settings, obeys the same rate limits, and only touches the subscription records stored in your SteadyRenew ledger.

## Before you connect

Make sure you have four things ready:

- **A signed-in [SteadyRenew](https://steadyrenew.com/app) account** with a few subscriptions already entered (if you are starting from zero, run through the [subscription audit checklist](/blog/how-to-do-a-subscription-audit/) first).
- **Node.js 20 or newer** installed on your machine to run the local stdio server.
- **A Developer API key (`subm_…`)** created from the user menu under **Developer API**. Copy the full secret when it appears; the app only displays it once.
- **An MCP client** such as Claude Desktop or Cursor. (If you also want push alerts on your phone, set up your Bark URL beforehand in the web app under **Settings → Notifications**, since API keys cannot read or change Bark URLs.)

## Step 1: Pick the right API key scope

Developer keys authenticate with a standard HTTP header (`Authorization: Bearer subm_…`) and come in two permission levels:

| Scope | What it allows |
| --- | --- |
| `read` | List and inspect subscriptions, check global reminder settings, view spending analytics, and read the API audit log |
| `write` | Everything in `read`, plus creating, editing, or deleting subscription rows and toggling global reminder settings (`enabled` and `daysBefore`) |

Start with a **`read`** key when you first wire up an assistant. That way you can test queries without worrying about an overly eager prompt modifying or deleting an entry; any write attempt with a read-only key cleanly fails with `403 insufficient_scope`.

Rate limits follow your account tier across both MCP and direct REST calls:

| Plan | Active keys | Hourly limit |
| --- | --- | --- |
| Free | 1 | 60 requests / hour |
| Premium | 5 | 1,000 requests / hour |

Responses return `X-RateLimit-*` headers, and `429` responses include `Retry-After`.

## Step 2: Install the local MCP server

Clone the [subscription-management repository](https://github.com/JerryyrreJ/subscription-management) and install dependencies inside the `mcp` folder:

```bash
cd mcp
npm install
```

The server entry point is `mcp/src/server.mjs`, and it reads two environment variables:

| Variable | Required | Typical value |
| --- | --- | --- |
| `SUBSCRIPTION_MANAGER_BASE_URL` | Yes | `https://steadyrenew.com` |
| `SUBSCRIPTION_MANAGER_API_KEY` | Yes | `subm_your_key_here` |

### Adding it to Claude Desktop

Open your `claude_desktop_config.json` file and register `subscription-manager` using the **absolute path** to `mcp/src/server.mjs`:

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

Save the file and restart Claude Desktop completely so it spawns the process.

### Cursor and other MCP clients

Cursor, Codex, OpenCode, and other MCP hosts take the exact same three pieces: `node` as the command, the absolute path to `mcp/src/server.mjs` as the argument, and the two environment variables above. Check [`mcp/README.md`](https://github.com/JerryyrreJ/subscription-management/tree/main/mcp) if you are connecting against a self-hosted deployment instead of `steadyrenew.com`.

## What your assistant can actually call (all 11 tools)

The MCP server exposes 11 tools that map directly onto `/api/v1`:

- **Subscription records:** `list_subscriptions` (supports filtering by `status`, `category`, `period`, `q`, `expiringBefore`, and `sort`), `get_subscription`, `create_subscription`, `update_subscription`, and `delete_subscription`.
- **Global reminder lead time:** `get_notification_settings` and `update_notification_settings` (accepts `enabled` and `daysBefore` values of `1`, `3`, `7`, or `14`).
- **Spending & cleanup analysis:** `get_spend_summary`, `find_duplicate_subscriptions`, and `get_optimization_suggestions`.
- **Change history:** `list_audit_log`.

Once connected, try a few straightforward read queries first before testing edits:

- *"Which subscriptions renew in the next 14 days?"*
- *"Break down my monthly subscription spend by currency and category."*
- *"Check whether I have any duplicate streaming or cloud storage plans."*
- *"Turn global reminders on and set `daysBefore` to 3."* (requires a `write` key)
- *"Show the last five API audit log entries."*

## Guardrails worth knowing

- **Deleting a record does not cancel a merchant.** Calling `delete_subscription` only removes that row from your personal SteadyRenew ledger. There are no tools that log into Netflix, Spotify, Apple, or your bank to cancel a real billing agreement. Always cancel with the provider first, then update your list.
- **Bark push URLs and time zones stay in the web UI.** To prevent an agent or leaked key from redirecting push notifications, `update_notification_settings` only accepts `enabled` and `daysBefore`. Configure your Bark URL, test push, locale, and time zone in the web app (see the [notifications setup guide](https://github.com/JerryyrreJ/subscription-management/blob/main/docs/en/notifications.md)).
- **Treat optimization output as a prompt to check, not an automatic cut.** Two subscriptions in the same category might be a real duplicate, or one might belong to a family member.

## Calling `/api/v1` directly from scripts

If you just want a cron job, shell script, or custom webhook without an LLM in the middle, hit the REST API directly with the same `subm_…` bearer key:

```bash
curl -sS https://steadyrenew.com/api/v1/subscriptions \
  -H "Authorization: Bearer subm_your_key_here"
```

## Reference links

- Web app ledger: [https://steadyrenew.com/app](https://steadyrenew.com/app)
- REST API documentation: [https://steadyrenew.com/docs/en/api/overview](https://steadyrenew.com/docs/en/api/overview)
- Machine-readable tool schema: [https://steadyrenew.com/agent/ai-tools.json](https://steadyrenew.com/agent/ai-tools.json)
- OpenAPI specification: [https://steadyrenew.com/agent/openapi.yaml](https://steadyrenew.com/agent/openapi.yaml)
- MCP server source: [github.com/JerryyrreJ/subscription-management/tree/main/mcp](https://github.com/JerryyrreJ/subscription-management/tree/main/mcp)

## FAQ

### Does the MCP server need access to my bank account?

No. SteadyRenew does not connect to banks. The MCP server only reads and updates the subscription entries stored in your SteadyRenew account.

### Can an AI assistant cancel Netflix or an App Store trial for me through MCP?

No. Write tools only edit or delete rows inside your personal tracker. To stop actual charges, you still have to cancel on the merchant’s website or in your Apple or Google Play subscription settings.

### When should I use MCP versus the `/api/v1` REST endpoints?

Use MCP when you want to ask ad-hoc questions or log updates conversationally inside an assistant like Claude Desktop or Cursor. Use the `/api/v1` REST endpoints directly when writing deterministic scripts, cron jobs, or backend automations.

### Why did `update_notification_settings` reject my Bark URL?

For security reasons, the public API only allows changing `enabled` and `daysBefore` (`1`, `3`, `7`, or `14`). Your Bark push endpoint, test notification button, time zone, and language stay locked to the web app under **Settings → Notifications**.

### What happens if I hit the hourly API rate limit?

Free accounts allow 1 active key and 60 requests per hour, while Premium accounts allow 5 active keys and 1,000 requests per hour. When you exceed the quota, the API returns HTTP `429` with a `Retry-After` header telling your client when to try again.

## Related reading

- [How to choose a subscription tracker without linking your bank](https://steadyrenew.com/blog/best-subscription-trackers-without-bank-login/)
- [Rocket Money alternatives that don’t ask for your bank login](https://steadyrenew.com/blog/rocket-money-alternatives-without-bank-login/)
- [How to do a subscription audit (keep / cancel / remind)](https://steadyrenew.com/blog/how-to-do-a-subscription-audit/)
