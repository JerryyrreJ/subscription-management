# Connect SteadyRenew to an agent

Use the **site origin supplied by the user**, including its port for local development, as `BASE_URL` (for SteadyRenew Cloud: `https://steadyrenew.com`). All paths below are relative to that origin.

## 1. Credentials and capabilities

This connection manages the signed-in user's **cloud subscriptions**. Browser-only local data is not available through the API. The user creates an API key in **Settings → API & MCP**. API keys do not expire automatically unless manually revoked or the account is deleted. A public API key cannot create another key or log into the web app.

Use `SUBSCRIPTION_MANAGER_BASE_URL` and `SUBSCRIPTION_MANAGER_API_KEY` from the user's private environment or secret store. If no key is available, ask the user to create one and enter it through the client's secret input where possible. Full keys are shown only once; an old prefix cannot be recovered into a full key. Never print keys, commit them, or put them in shared configuration or logs.

Read `/agent/ai-tools.json` and `/agent/openapi.yaml` for the canonical API contract. Available tools include:

- `list_subscriptions`, `get_subscription`, `create_subscription`, `update_subscription`, `delete_subscription`
- `get_notification_settings`, `update_notification_settings` (`enabled` and `daysBefore` only)
- `get_spend_summary` (included in Free), plus `find_duplicate_subscriptions` and `get_optimization_suggestions` (**Premium only**, `403 premium_required` on Free)
- `list_audit_log`

Keys carry scopes: a **read-only** (`read`) key can list, inspect, read notification settings, run analytics, and read audit history, while a **read & write** (`read`, `write`) key additionally allows creating, updating, and deleting subscriptions and updating notification settings.

## 2. Remote MCP (Streamable HTTP — ChatGPT, Claude Web/Desktop, Claude Code, Cursor)

If the client supports remote Streamable HTTP MCP endpoints, connect directly with no local installation:

- **Endpoint**: `<BASE_URL>/api/mcp` (`POST` JSON-RPC 2.0, stateless Streamable HTTP)
- **Header**: `Authorization: Bearer <SUBSCRIPTION_MANAGER_API_KEY>`

Example for Claude Code CLI:

```sh
claude mcp add --transport http steadyrenew "<BASE_URL>/api/mcp" \
  --header "Authorization: Bearer <PRIVATE_API_KEY>"
```

## 3. Local stdio MCP (Desktop & CLI clients)

Requires Node.js 20 or newer. Two local artifacts are served from `<BASE_URL>`:

### Option A: Zero-dependency single-file script (recommended for local stdio)

Download `<BASE_URL>/downloads/steadyrenew-mcp.mjs` into a private user directory (for example `~/.steadyrenew/steadyrenew-mcp.mjs`). No `npm install` or `node_modules` directory is needed.

**Claude Desktop / Cursor / Windsurf (`mcpServers` JSON):**

```json
{
  "mcpServers": {
    "subscription-manager": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/steadyrenew-mcp.mjs"],
      "env": {
        "SUBSCRIPTION_MANAGER_BASE_URL": "<BASE_URL>",
        "SUBSCRIPTION_MANAGER_API_KEY": "<PRIVATE_API_KEY>"
      }
    }
  }
}
```

**Codex (`~/.codex/config.toml`):**

```toml
[mcp_servers.steadyrenew]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/steadyrenew-mcp.mjs"]

[mcp_servers.steadyrenew.env]
SUBSCRIPTION_MANAGER_BASE_URL = "<BASE_URL>"
SUBSCRIPTION_MANAGER_API_KEY = "<PRIVATE_API_KEY>"
```

**Claude Code CLI (local stdio):**

```sh
claude mcp add steadyrenew \
  -e SUBSCRIPTION_MANAGER_BASE_URL="<BASE_URL>" \
  -e SUBSCRIPTION_MANAGER_API_KEY="<PRIVATE_API_KEY>" \
  -- node /absolute/path/to/steadyrenew-mcp.mjs
```

### Option B: Standalone npm archive (`.tgz`)

Download `<BASE_URL>/downloads/subscription-manager-mcp.tgz` into an **empty directory** (never inside this repository, another npm project, or a workspace):

```sh
npm install --ignore-scripts ./subscription-manager-mcp.tgz
```

Use npm 10 or newer (bundled with current Node.js 20+ releases). npm 9.2 fails inside an existing project or workspace with `Tracker "idealTree" already exists`; if that happens, unpack the archive and run bun instead:

```sh
tar -xzf subscription-manager-mcp.tgz
cd package
bun install --ignore-scripts
```

The entry script is `node_modules/subscription-manager-mcp/src/server.mjs` (or `package/src/server.mjs` after unpacking). Merge the `subscription-manager` entry into the client's existing configuration while preserving unrelated servers. Reload the MCP connection if needed, enumerate tools, and call `list_subscriptions` with `{"limit":1}`. Do not claim MCP is connected merely because a configuration file was written; if the client requires a restart, explain that verification is pending.

## 4. Direct REST API fallback

If this agent cannot use MCP but can make authenticated HTTP requests, call the REST API directly with the same key:

```sh
curl --fail-with-body --silent --show-error \
  --header "Authorization: Bearer ${SUBSCRIPTION_MANAGER_API_KEY}" \
  "${SUBSCRIPTION_MANAGER_BASE_URL}/api/v1/subscriptions?limit=1"
```

Verify HTTP 200 and a JSON object with a `data` array and `pagination`. An empty array is a successful connection. Report which connection mode (Remote MCP, Local stdio MCP, or REST API) was actually verified.

## 5. Subscription operations

- Read `/agent/ai-tools.json` for exact tools, parameters, enum values, and confirmation rules. Read all pages when the user requests all records (`pagination.hasMore`, `offset`, `limit`).
- Active recurring subscriptions automatically roll overdue stored `nextPaymentDate` values forward to the current billing cycle when read; free trials (`isTrial: true`) keep their one-shot `trialEndsOn` date without auto-advancing.
- Setup only reads data. Do not create or delete sample subscriptions to test a connection.
- Before creating, updating, or deleting records (with a read/write key), summarize the exact change and ask for confirmation. Before deletion, repeat the name and id.
- Find the existing record before an update or deletion. Do not blindly retry a creation after an ambiguous timeout; check for an existing record first.
- Send `nextPaymentDate` as `YYYY-MM-DD`; amounts are major currency units. Never send server-managed `id`, `createdAt`, `updatedAt`, or `status` in write payloads.
- Deleting a tracking record permanently removes the subscription from tracking (while recording a `subscription.delete` snapshot in `api_audit_log`), and does **not** cancel a paid service with the provider. The API cannot pause/resume/cancel via `status`, configure Bark credentials, send test pushes, change timezone/locale, or manage the category catalog. Those actions belong in the web app (`/docs/en/user-guide/reminders` or `/docs/zh-CN/user-guide/reminders`) or with the service provider.

## Recovery

- **401 `invalid_api_key`**: key is missing, invalid, or revoked. Ask for a valid key; do not retry repeatedly.
- **403 `insufficient_scope`**: a write needs a read/write key. Do not silently create or upgrade keys.
- **403 `premium_required`**: `find_duplicate_subscriptions` and `get_optimization_suggestions` require SteadyRenew Premium (\$9 one-time lifetime). Fall back to `get_spend_summary` or `list_subscriptions`.
- **404 `notification_settings_not_found`**: ask the user to configure Bark once in the web app under **Settings → Notifications** (`/docs/en/user-guide/reminders`).
- **429 `rate_limit_exceeded`**: wait the number of seconds in `Retry-After` before retrying. Both Free and Premium accounts include up to **5 active keys** and **60 requests per minute** shared across the account (`400` validation errors do not consume quota).
- **HTML instead of JSON**: check the origin and Functions deployment. For local development of this repository use `npm run dev:full`, since Vite alone does not serve API functions.
- **`Tracker "idealTree" already exists`** while installing the `.tgz` package: use `/downloads/steadyrenew-mcp.mjs` instead, or install in an empty directory with npm 10+ / unpack and run `bun install --ignore-scripts`.
- **Validation errors (`400`)**: use `field`, `suggestedFix`, `allowedValues`, and `writableFields` to correct the request, then confirm a materially changed write again.

After setup, offer examples appropriate to the key's scope: “List my subscriptions”, “What renews in the next two weeks?”, and (for read/write keys) “Add a monthly subscription” or “Update a subscription's amount”. Ask for missing billing details rather than inventing them.
