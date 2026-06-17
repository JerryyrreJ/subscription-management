# Public API

The v1 API exposes subscription CRUD through API keys.

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

Examples:

```bash
curl -H "Authorization: Bearer $SUBSCRIPTION_MANAGER_API_KEY" \
  https://your-site.example/api/v1/subscriptions
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
    "code": "invalid_api_key",
    "message": "Invalid API key"
  },
  "requestId": "..."
}
```

API responses include:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
