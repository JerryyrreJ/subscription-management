# Public API

The v1 API exposes subscription lifecycle management, analytics, and audit access through Developer API keys.

AI agents can use `docs-site/api/ai-tools.json` for tool/function definitions, risk levels, confirmation prompts, and error recovery guidance. The OpenAPI schema is available at `docs-site/api/openapi.yaml`.

## Access

Create an API key from **Developer API** in the user menu. The full key is shown only once. Store it like a password.

Default limits:

- Free users: 1 active key, 60 requests per user per hour
- Premium users: 5 active keys, 1000 requests per user per hour

API keys have scopes:

- `read`: list and read subscriptions; read notification settings; call analytics and audit endpoints
- `write`: everything `read` allows, plus create, update, delete, and notification settings updates

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
| `PATCH` | `/api/v1/subscriptions/:id` | Update writable fields |
| `DELETE` | `/api/v1/subscriptions/:id` | Permanently delete a subscription |
| `GET` | `/api/v1/notification-settings` | Read global reminder settings |
| `PATCH` | `/api/v1/notification-settings` | Update `enabled` and/or `daysBefore` |
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
  "nextPaymentDate": "2026-07-01",
  "customDate": null,
  "notificationEnabled": true,
  "isTrial": false,
  "trialEndsOn": null
}
```

`nextPaymentDate` is the authoritative upcoming renewal date for paid subscriptions. For free trials (`isTrial: true`), `trialEndsOn` is the one-shot trial end / first-charge date and is not auto-advanced after it passes. `id`, `createdAt`, and `updatedAt` are managed by the server. `customDate` is only used with custom billing periods.

Monthly subscriptions renew on the same calendar day each month, so a cycle may contain 28, 29, 30, or 31 days. A January 31 anchor temporarily renews at the end of February and returns to March 31. For a fixed 30-day cycle, use `period: "custom"` with `customDate: "30"`. `lastPaymentDate` is retained only as a derived compatibility field for older clients.

Responses may include a read-only `status` (`active`, `paused`, or `cancelled`), and list queries may filter by it. The public API does **not** cancel, pause, or resume subscriptions by writing `status`; use `DELETE` to remove a tracked record.

## Notification settings

`GET` / `PATCH` `/api/v1/notification-settings` expose the global reminder switch (`enabled`) and advance window (`daysBefore`: 1, 3, 7, or 14). Responses also include read-only `timeZone`, `locale`, and `barkConfigured`. Bark URL, test push, timeZone, and locale cannot be written through the API — configure Bark in the web app first.

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
