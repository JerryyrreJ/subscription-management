---
title: "Connect SteadyRenew to an MCP client"
slug: manage-subscriptions-with-mcp
description: "Connect Claude, ChatGPT, Cursor, Claude Code, Codex, or another MCP client to your SteadyRenew subscription list via remote Streamable HTTP or local stdio."
date: 2026-09-17
updated: 2026-11-12
status: published
lang: en
canonical: https://steadyrenew.com/blog/manage-subscriptions-with-mcp/
---

Once your recurring bills live in [SteadyRenew](https://steadyrenew.com/app), you do not have to open the web dashboard every time you want to check when a plan renews. You can connect an MCP-compatible assistant (ChatGPT, Claude, Claude Desktop, Claude Code, Cursor, Codex, OpenCode, or your own client) straight to your account and ask plain questions like *"Which subscriptions renew in the next two weeks?"* or *"How much am I spending per month in EUR vs. USD?"*

Under the hood, SteadyRenew supports both a hosted **Streamable HTTP MCP endpoint** (`https://steadyrenew.com/api/mcp`) and a **local stdio MCP server** (`steadyrenew-mcp.mjs`) built on top of the public `/api/v1` REST API. Every tool call authenticates with a Developer API key you generate in your account settings, obeys the same per-minute rate limits, and only touches the subscription records stored in your SteadyRenew ledger.

## Before you connect

Make sure you have three things ready:

- **A signed-in [SteadyRenew](https://steadyrenew.com/app) account** with a few subscriptions already entered (if you are starting from zero, run through the [subscription audit checklist](/blog/how-to-do-a-subscription-audit/) first).
- **A Developer API key (`subm_…`)** created under **Settings → API & MCP**. Copy the full secret when it appears; SteadyRenew stores only a SHA-256 hash and displays the plaintext key once. Keys never expire automatically and remain active until you revoke them.
- **An MCP client** — either a cloud/CLI client that speaks Streamable HTTP (`https://steadyrenew.com/api/mcp`) or a desktop/CLI client with **Node.js 20+** installed for local stdio. (If you also want push alerts on your phone, set up your Bark URL beforehand in the web app under **Settings → Notifications**, since API keys cannot read or change Bark URLs.)

## Step 1: Pick the right API key scope

Developer keys authenticate with a standard HTTP header (`Authorization: Bearer subm_…`) and come in two permission levels:

| Scope | What it allows |
| --- | --- |
| `read` | List and inspect subscriptions, check global reminder settings, view spending analytics, and read the API audit log |
| `write` | Everything in `read`, plus creating, editing, or deleting subscription rows and toggling global reminder settings (`enabled` and `daysBefore`) |

Start with a **`read`** key when you first wire up an assistant. That way you can test queries without worrying about an overly eager prompt modifying or deleting an entry; any write attempt with a read-only key cleanly fails with `403 insufficient_scope`.

Key and rate limits apply across both MCP and direct REST calls:

| Plan | Active keys | Per-minute limit | Analytics tools |
| --- | --- | --- | --- |
| Free | Up to 5 | 60 requests / minute | `get_spend_summary` included; duplicate & optimization tools return `403 premium_required` |
| Premium | Up to 5 | 60 requests / minute | All analytics tools (`get_spend_summary`, `find_duplicate_subscriptions`, `get_optimization_suggestions`) |

Responses return `X-RateLimit-*` headers, and `429` responses include `Retry-After`.

## Step 2: Connect your MCP client

The fastest way to set up any coding agent is inside the web app: open **Settings → API & MCP**, choose whether to embed your newly created key, and click **Copy to Agent**. Paste that onboarding prompt directly into Claude Code, Cursor, Codex, or OpenCode and let the agent wire itself up.

If you prefer manual configuration, pick either **Remote Streamable HTTP** (zero local install) or **Local stdio** (single-file Node script).

### Option A: Remote Streamable HTTP (no local install)

Point any Streamable HTTP MCP client at `https://steadyrenew.com/api/mcp` with `Authorization: Bearer subm_your_key_here`.

For example, in **Claude Code**:

```bash
claude mcp add --transport http steadyrenew https://steadyrenew.com/api/mcp \
  --header "Authorization: Bearer subm_your_key_here"
```

Cloud connectors in ChatGPT, Claude on the web, and Cursor remote MCP servers can connect to the same `https://steadyrenew.com/api/mcp` endpoint using Bearer authentication.

### Option B: Local stdio (single-file script, no `git clone` required)

Download the standalone single-file bundle once (requires Node.js 20+):

```bash
mkdir -p ~/.steadyrenew/mcp
curl -fsSL https://steadyrenew.com/downloads/steadyrenew-mcp.mjs -o ~/.steadyrenew/mcp/steadyrenew-mcp.mjs
```

*(An npm tarball is also published at `https://steadyrenew.com/downloads/subscription-manager-mcp.tgz` if you prefer `npm install`.)*

The stdio server reads two environment variables:

| Variable | Required | Typical value |
| --- | --- | --- |
| `SUBSCRIPTION_MANAGER_BASE_URL` | Optional (defaults to `https://steadyrenew.com`) | `https://steadyrenew.com` |
| `SUBSCRIPTION_MANAGER_API_KEY` | Yes | `subm_your_key_here` |

### Claude Desktop & Cursor (`mcpServers` JSON)

Add `steadyrenew` to `claude_desktop_config.json` or `.cursor/mcp.json` using the **absolute path** to `steadyrenew-mcp.mjs` (replace `/Users/you` with your home folder):

```json
{
  "mcpServers": {
    "steadyrenew": {
      "command": "node",
      "args": ["/Users/you/.steadyrenew/mcp/steadyrenew-mcp.mjs"],
      "env": {
        "SUBSCRIPTION_MANAGER_BASE_URL": "https://steadyrenew.com",
        "SUBSCRIPTION_MANAGER_API_KEY": "subm_your_key_here"
      }
    }
  }
}
```

### Codex (`~/.codex/config.toml`)

Codex uses TOML configuration rather than Claude Desktop JSON:

```toml
[mcp_servers.steadyrenew]
command = "node"
args = ["/Users/you/.steadyrenew/mcp/steadyrenew-mcp.mjs"]

[mcp_servers.steadyrenew.env]
SUBSCRIPTION_MANAGER_BASE_URL = "https://steadyrenew.com"
SUBSCRIPTION_MANAGER_API_KEY = "subm_your_key_here"
```

### OpenCode (`opencode.json`)

OpenCode expects a `local` server entry with a `command` array and `environment` map:

```json
{
  "mcp": {
    "steadyrenew": {
      "type": "local",
      "command": ["node", "/Users/you/.steadyrenew/mcp/steadyrenew-mcp.mjs"],
      "environment": {
        "SUBSCRIPTION_MANAGER_BASE_URL": "https://steadyrenew.com",
        "SUBSCRIPTION_MANAGER_API_KEY": "subm_your_key_here"
      }
    }
  }
}
```

## What your assistant can actually call (all 11 tools)

Both `/api/mcp` and `steadyrenew-mcp.mjs` expose the same 11 tools mapped onto `/api/v1`:

- **Subscription records:** `list_subscriptions` (supports filtering by `status`, `category`, `period`, `q`, `expiringBefore`, and `sort`, and automatically rolls overdue active non-trial renewal dates forward to the current cycle), `get_subscription`, `create_subscription`, `update_subscription`, and `delete_subscription`.
- **Global reminder lead time:** `get_notification_settings` and `update_notification_settings` (accepts `enabled` and `daysBefore` values of `1`, `3`, `7`, or `14`).
- **Spending & cleanup analysis:** `get_spend_summary` (all plans), plus `find_duplicate_subscriptions` and `get_optimization_suggestions` (Lifetime Premium required).
- **Change history:** `list_audit_log`.

Once connected, try a few straightforward read queries first before testing edits:

- *"Which subscriptions renew in the next 14 days?"*
- *"Break down my monthly subscription spend by currency and category."*
- *"Check whether I have any duplicate streaming or cloud storage plans."* (Premium)
- *"Turn global reminders on and set `daysBefore` to 3."* (requires a `write` key)
- *"Show the last five API audit log entries."*

## Guardrails worth knowing

- **Deleting a record does not cancel a merchant.** Calling `delete_subscription` permanently removes that row from your personal SteadyRenew ledger (and records a `subscription.delete` snapshot in your audit log), but never logs into Netflix, Spotify, Apple, or your bank to cancel a real billing agreement. Always cancel with the provider first, then update your list.
- **Bark push URLs and time zones stay in the web UI.** To prevent an agent or leaked key from redirecting push notifications, `update_notification_settings` only accepts `enabled` and `daysBefore`. Configure your Bark URL, test push, locale, and time zone in the web app (see the [reminders setup guide](https://steadyrenew.com/docs/en/user-guide/reminders)).
- **Treat optimization output as a prompt to check, not an automatic cut.** Two subscriptions in the same category might be a real duplicate, or one might belong to a family member.

## Calling `/api/v1` directly from scripts

If you just want a cron job, shell script, or custom webhook without an LLM in the middle, hit the REST API directly with the same `subm_…` bearer key:

```bash
curl -sS https://steadyrenew.com/api/v1/subscriptions \
  -H "Authorization: Bearer subm_your_key_here"
```

## Reference links

- Web app ledger: [https://steadyrenew.com/app](https://steadyrenew.com/app)
- MCP setup guide: [https://steadyrenew.com/docs/en/user-guide/agent-setup](https://steadyrenew.com/docs/en/user-guide/agent-setup)
- REST API documentation: [https://steadyrenew.com/docs/en/api/overview](https://steadyrenew.com/docs/en/api/overview)
- Remote MCP endpoint: `https://steadyrenew.com/api/mcp`
- Standalone local MCP script: [https://steadyrenew.com/downloads/steadyrenew-mcp.mjs](https://steadyrenew.com/downloads/steadyrenew-mcp.mjs)
- Machine-readable tool schema: [https://steadyrenew.com/agent/ai-tools.json](https://steadyrenew.com/agent/ai-tools.json)
- OpenAPI specification: [https://steadyrenew.com/agent/openapi.yaml](https://steadyrenew.com/agent/openapi.yaml)
- MCP server source: [github.com/JerryyrreJ/subscription-management/tree/main/mcp](https://github.com/JerryyrreJ/subscription-management/tree/main/mcp)

## FAQ

### Does the MCP server need access to my bank account?

No. SteadyRenew does not connect to banks. Both the remote `/api/mcp` endpoint and local MCP script only read and update the subscription entries stored in your SteadyRenew account.

### Can an AI assistant cancel Netflix or an App Store trial for me through MCP?

No. Write tools only edit or delete rows inside your personal tracker. To stop actual charges, you still have to cancel on the merchant’s website or in your Apple or Google Play subscription settings.

### Should I use the remote `/api/mcp` URL or the local `steadyrenew-mcp.mjs` script?

Use `https://steadyrenew.com/api/mcp` whenever your client supports remote Streamable HTTP MCP with custom Bearer headers (such as Claude Code, Cursor remote MCP, or cloud connectors) — nothing needs to be installed locally. Use `steadyrenew-mcp.mjs` for stdio-only desktop clients like Claude Desktop.

### Why did `update_notification_settings` reject my Bark URL?

For security reasons, the public API only allows changing `enabled` and `daysBefore` (`1`, `3`, `7`, or `14`). Your Bark push endpoint, test notification button, time zone, and language stay locked to the web app under **Settings → Notifications**.

### What happens if I hit the API rate limit?

Both Free and Premium accounts support up to 5 active API keys and 60 requests per minute per account. When you exceed the per-minute quota, the API returns HTTP `429` with a `Retry-After` header telling your client how many seconds to wait before retrying.

## Related reading

- [How to choose a subscription tracker without linking your bank](https://steadyrenew.com/blog/best-subscription-trackers-without-bank-login/)
- [Rocket Money alternatives that don’t ask for your bank login](https://steadyrenew.com/blog/rocket-money-alternatives-without-bank-login/)
- [How to do a subscription audit (keep / cancel / remind)](https://steadyrenew.com/blog/how-to-do-a-subscription-audit/)
