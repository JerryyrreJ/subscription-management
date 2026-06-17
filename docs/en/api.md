# Public API

The v1 API exposes subscription CRUD through API keys.

AI agents can use `docs-site/api/ai-tools.json` for tool/function definitions,
risk levels, confirmation prompts, and error recovery guidance. The OpenAPI
schema is available at `docs-site/api/openapi.yaml`.

## Access

Create an API key from **Developer API** in the user menu. The full key is shown
only once. Store it like a password.

Default limits:

- Free users: 1 active key, 60 requests per user per hour
- Premium users: 5 active keys, 1000 requests per user per hour

## Authentication

```bash
Authorization: Bearer subm_xxx
```

## Subscriptions

Base path:

```text
/api/v1/subscriptions
```

Endpoints:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/subscriptions` | List the authenticated API key owner's subscriptions |
| `GET` | `/api/v1/subscriptions/:id` | Get one subscription |
| `POST` | `/api/v1/subscriptions` | Create a subscription |
| `PATCH` | `/api/v1/subscriptions/:id` | Update writable fields |
| `DELETE` | `/api/v1/subscriptions/:id` | Delete a subscription |

Writable fields use camelCase:

```json
{
  "name": "Netflix",
  "category": "Streaming",
  "amount": 15.99,
  "currency": "USD",
  "period": "monthly",
  "lastPaymentDate": "2026-06-01",
  "customDate": null,
  "notificationEnabled": true
}
```

`id`, `nextPaymentDate`, `createdAt`, and `updatedAt` are managed by the
server. `customDate` is only used with custom billing periods.

For AI agents, reads are low risk and can run directly. Create and update are
medium risk and should be confirmed first. Delete is high risk and should only
run after confirming the exact subscription name and id.

Examples:

```bash
curl -H "Authorization: Bearer $SUBSCRIPTION_MANAGER_API_KEY" \
  https://your-site.example/api/v1/subscriptions
```

The list endpoint is paged. Pass `limit` (1-100, default 50) and `offset`
(default 0) as query parameters; the response includes a `pagination` object
with `limit`, `offset`, and `hasMore`.

```bash
curl -H "Authorization: Bearer $SUBSCRIPTION_MANAGER_API_KEY" \
  "https://your-site.example/api/v1/subscriptions?limit=50&offset=50"
```

```bash
curl -X POST \
  -H "Authorization: Bearer $SUBSCRIPTION_MANAGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Netflix","category":"Streaming","amount":15.99,"currency":"USD","period":"monthly","lastPaymentDate":"2026-06-01"}' \
  https://your-site.example/api/v1/subscriptions
```

## Errors And Limits

Errors use:

```json
{
  "error": {
    "code": "invalid_subscription",
    "message": "Invalid option",
    "field": "period",
    "suggestedFix": "Use one of the supported billing periods: monthly, yearly, custom."
  },
  "requestId": "..."
}
```

`field`, `suggestedFix`, `allowedValues`, and `writableFields` may be included
when the server can provide a precise recovery hint.

API responses include:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

Validation errors (`400`) are rejected before the quota is consumed, so they
do not count against your limit. `429` responses include a `Retry-After`
header with the number of seconds to wait before retrying.
