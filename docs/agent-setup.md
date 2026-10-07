# Connect SteadyRenew to an agent

Use the **site origin supplied by the user**, including its port for local development, as `BASE_URL`. All paths below are relative to that origin. Do not use the example host in a schema as the user's host.

## 1. Credentials and capabilities

This connection manages the signed-in user's **cloud subscriptions**. Browser-only local data is not available through the API. The user creates a key in Settings → API & MCP. A public API key cannot create another key or log into the web app.

Use `SUBSCRIPTION_MANAGER_BASE_URL` and `SUBSCRIPTION_MANAGER_API_KEY` from the user's private environment or secret store. If no key is available, ask the user to create one and enter it through the client's secret input where possible. Full keys are shown only once; an old prefix cannot be recovered into a full key. Never print keys, commit them, or put them in shared configuration or logs.

Read `/agent/ai-tools.json` and `/agent/openapi.yaml` for the API contract. Available tools include list/get/create/update/delete subscriptions, notification settings, spending analysis, duplicates, optimization suggestions, and audit history. Some analytics require Premium. A read-only key can connect successfully but cannot write.

## 2. MCP (preferred when the client supports local stdio servers)

Requires Node.js 20 or newer and npm. Download `/downloads/subscription-manager-mcp.tgz` from `BASE_URL` to a private persistent integration directory. This is a standalone npm package with its tool schema included; cloning the app repository is unnecessary. Install the downloaded file in that directory:

```sh
npm install --ignore-scripts ./subscription-manager-mcp.tgz
```

Use the installed `node_modules/subscription-manager-mcp/src/server.mjs` as the server. Resolve its **absolute path** and the absolute path to Node. Merge a server named `subscription-manager` into the client's existing configuration using the client's supported format; preserve unrelated servers. JSON clients commonly accept:

```json
{
  "mcpServers": {
    "subscription-manager": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/integration/node_modules/subscription-manager-mcp/src/server.mjs"],
      "env": {
        "SUBSCRIPTION_MANAGER_BASE_URL": "<BASE_URL>",
        "SUBSCRIPTION_MANAGER_API_KEY": "<PRIVATE_API_KEY>"
      }
    }
  }
}
```

Those paths and values are placeholders. Use the target client's native configuration format if it does not use `mcpServers` JSON. Prefer environment or secret-store references where supported. If the client requires a literal secret, use private user-level configuration with restrictive file permissions, outside version control. Reload the MCP connection if needed, enumerate tools, and call `list_subscriptions` with `{"limit":1}`. Do not say MCP is connected merely because a configuration file was written. If the client must restart, explain that the handshake is still pending.

## 3. Direct API fallback

If this agent cannot run a local stdio MCP server but can make authenticated HTTP requests, use the REST API directly with the same key. No MCP download or Node installation is required for this mode. A client that only supports remote MCP URLs cannot use the `.tgz` URL as an MCP endpoint. There is currently no hosted remote MCP endpoint.

Example verification using an existing private environment (never echo the key):

```sh
curl --fail-with-body --silent --show-error \
  --header "Authorization: Bearer ${SUBSCRIPTION_MANAGER_API_KEY}" \
  "${SUBSCRIPTION_MANAGER_BASE_URL}/api/v1/subscriptions?limit=1"
```

Verify HTTP 200 and a JSON object with a `data` array and pagination. An empty array is a successful connection. Report which connection mode was actually verified. If the agent supports neither local processes nor HTTP tools, explain the missing capability.

## 4. Subscription operations

- Read `/agent/ai-tools.json` for exact tools, parameters, enum values, and confirmation rules. Read all pages when the user requests all records (`pagination.hasMore`, `offset`, `limit`).
- Setup only reads data. Do not create or delete sample subscriptions to test a connection.
- Before creating, updating, or deleting records, summarize the exact change and ask for confirmation. Before deletion, repeat the name and id.
- Find the existing record before an update or deletion. Do not blindly retry a creation after an ambiguous timeout; check for an existing record first.
- Send `nextPaymentDate` as YYYY-MM-DD; amounts are major currency units. Never send server-managed `id`, `createdAt`, or `updatedAt` in write payloads.
- Deleting a tracking record does not cancel a paid service. The API cannot pause/resume/cancel via `status`, configure Bark credentials, send test pushes, change timezone/locale, or manage the category catalog. Those actions belong in the web app or the service provider.

## Recovery

- 401: key is invalid or revoked. Ask for a valid key; do not retry repeatedly.
- 403 `insufficient_scope`: a write needs a read/write key. Do not silently create or upgrade keys.
- 403 on advanced analytics: inspect the error; some features require Premium. Basic CRUD remains available on Free.
- 429: respect `Retry-After` before retrying. The default shared account limit is 60 requests per minute and 5 active keys; deployments may override limits.
- HTML instead of JSON: check the origin and Functions deployment. For this project's local development use `npm run dev:full`, since Vite alone does not serve API functions.
- Validation errors: use `field`, `suggestedFix`, `allowedValues`, and `writableFields` to correct the request, then confirm a materially changed write again.
- Connection works but records are missing: verify the account, host, pagination, and cloud sync; local-only records are not exposed.

After setup, offer examples: “List my subscriptions”, “Add a monthly subscription”, “Change a subscription's amount”, and “Delete a duplicate record”. Ask for missing billing details rather than inventing them.
