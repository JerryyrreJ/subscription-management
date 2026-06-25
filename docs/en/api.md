# Public API

The v1 API exposes subscription lifecycle management, analytics, and audit access through Developer API keys.

AI agents can use `docs-site/api/ai-tools.json` for tool/function definitions, risk levels, confirmation prompts, and error recovery guidance. The OpenAPI schema is available at `docs-site/api/openapi.yaml`.

## Access

Create an API key from **Developer API** in the user menu. The full key is shown only once. Store it like a password.

Default limits:

- Free users: 1 active key, 60 requests per user per hour
- Premium users: 5 active keys, 1000 requests per user per hour

API keys have scopes:

- `read`: list and read subscriptions; call analytics and audit endpoints
- `write`: everything `read` allows, plus create, update, cancel, pause, resume, and delete

## Authentication

```bash
Authorization: Bearer subm_xxx
```

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/subscriptions` | List subscriptions |
| `GET` | `/api/v1/subscriptions/:id` | Get one subscription |
| `POST` | `/api/v1/subscriptions` | Create a subscription |
| `PATCH` | `/api/v1/subscriptions/:id` | Update writable fields, including `status` |
| `DELETE` | `/api/v1/subscriptions/:id` | Permanently delete a subscription |
| `GET` | `/api/v1/analytics/summary` | Spend summary by currency/category and upcoming renewals |
| `GET` | `/api/v1/analytics/duplicates` | Duplicate subscription candidates |
| `GET` | `/api/v1/analytics/optimizations` | Optimization candidates without invented savings |
| `GET` | `/api/v1/audit` | Public API write audit log |

## Subscriptions

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
  "notificationEnabled": true,
  "status": "active"
}
```

`id`, `nextPaymentDate`, `createdAt`, and `updatedAt` are managed by the server. `customDate` is only used with custom billing periods.

`status` can be `active`, `paused`, or `cancelled`. Prefer `PATCH {"status":"cancelled"}` or `PATCH {"status":"paused"}` when the user wants to keep history; use `DELETE` only when the record should be removed permanently.

## List filters

`GET /api/v1/subscriptions` supports pagination, filtering, and sorting:

| Parameter | Rule |
| --- | --- |
| `limit` | 1-100, default 50 |
| `offset` | Default 0 |
| `status` | `active`, `paused`, or `cancelled` |
| `category` | Exact category match |
| `period` | `monthly`, `yearly`, or `custom` |
| `q` | Case-insensitive name search |
| `expiringBefore` | `YYYY-MM-DD`; combine with `status=active` for upcoming renewals |
| `sort` | `createdAt`, `-createdAt`, `nextPaymentDate`, `-nextPaymentDate`, `amount`, `-amount`, `name`, `-name` |

## Analytics and audit

Analytics endpoints are read-only and report money per currency without conversion:

- `/api/v1/analytics/summary?horizonDays=30`
- `/api/v1/analytics/duplicates`
- `/api/v1/analytics/optimizations`

Every successful public API create, update, and delete is recorded in `/api/v1/audit`. Use `limit`, `offset`, and optional `subscriptionId` to page or filter audit entries.

## Errors and limits

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

`field`, `suggestedFix`, `allowedValues`, and `writableFields` may be included when the server can provide a precise recovery hint.

API responses include:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

Validation errors (`400`) are rejected before quota is consumed. `429` responses include a `Retry-After` header.

For full examples, see the Mintlify API guide in `docs-site/en/api/`.
