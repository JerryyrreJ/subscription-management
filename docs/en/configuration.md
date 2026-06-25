# Configuration

[English](configuration.md) | [简体中文](../zh-CN/configuration.md)

The core app runs without environment variables. Add environment variables only for the services you want to enable.

## Environment Variables

| Variable | Required For | Scope |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase auth and cloud sync | Browser |
| `VITE_SUPABASE_ANON_KEY` | Supabase auth and cloud sync | Browser |
| `SUPABASE_URL` | Supabase URL used by Functions | Server only |
| `SUPABASE_PUBLISHABLE_KEY` | Access-token verification in Functions | Server only |
| `SUPABASE_SECRET_KEY` | Notifications, premium activation, public API access, and AI capture quotas | Server only |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy alias for `SUPABASE_SECRET_KEY` | Server only |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Enables the payment UI; never trusted for checkout authorization | Browser |
| `STRIPE_SECRET_KEY` | Stripe checkout session creation | Server only |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Server only |
| `STRIPE_PRICE_ID` | The only Stripe Price accepted by the server | Server only |
| `SITE_URL` | Checkout success and cancellation URL | Server only |
| `URL` | Netlify function callback URLs | Provided by Netlify |
| `API_FREE_RATE_LIMIT_PER_HOUR` | Free user public API requests per user per hour; defaults to `60` | Server only |
| `API_PREMIUM_RATE_LIMIT_PER_HOUR` | Premium user public API requests per user per hour; defaults to `1000` | Server only |
| `API_FREE_ACTIVE_KEYS` | Free user active API key limit; defaults to `1` | Server only |
| `API_PREMIUM_ACTIVE_KEYS` | Premium user active API key limit; defaults to `5` | Server only |
| `API_FAILED_AUTH_RATE_LIMIT_PER_HOUR` | Failed API key authentication attempts per client identity per hour; defaults to `300` | Server only |
| `API_RATE_LIMIT_RETENTION_HOURS` | Rate limit window retention before scheduled cleanup; defaults to `48` | Server only |
| `OPENROUTER_API_KEY` | Enables AI capture with OpenRouter | Server only |
| `ANTHROPIC_API_KEY` | Enables AI capture with Anthropic | Server only |
| `AI_PROVIDER` | Optional provider override: `openrouter` or `anthropic` | Server only |
| `AI_MODEL` | AI capture model override | Server only |
| `AI_FALLBACK_MODELS` | Comma-separated OpenRouter fallback models | Server only |
| `OPENROUTER_SITE_URL` | Optional OpenRouter referer; falls back to `SITE_URL` or `URL` | Server only |
| `OPENROUTER_APP_TITLE` | Optional OpenRouter app title header | Server only |
| `AI_FREE_DAILY_PARSES` | Free user AI captures per day; defaults to `20` | Server only |
| `AI_PREMIUM_DAILY_PARSES` | Premium user AI captures per day; defaults to `200` | Server only |
| `AI_MAX_INPUT_CHARS` | AI capture text input cap; defaults to `20000` | Server only |
| `AI_MAX_IMAGE_BYTES` | AI capture image cap; defaults to `4194304` | Server only |
| `AI_MONTHLY_BUDGET_USD` | Workspace-wide monthly AI capture budget; defaults to `50` | Server only |
| `AI_INPUT_USD_PER_MTOK` | Input-token cost estimate per million tokens | Server only |
| `AI_OUTPUT_USD_PER_MTOK` | Output-token cost estimate per million tokens | Server only |

## Browser Variables

Variables prefixed with `VITE_` are included in the browser bundle. Do not put secrets in them.

## Server Variables

Server-only variables must be configured in the hosting provider, such as Netlify environment variables. Never commit service role keys, Stripe secret keys, or webhook secrets.

Functions prefer the server-only names above and temporarily support the existing `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `VITE_STRIPE_PRICE_ID` names. `VITE_STRIPE_PRICE_ID` is a legacy server fallback only and is no longer read by browser code.

## Feature Detection

The app checks environment variables at runtime:

- Supabase variables enable authentication and cloud sync.
- Stripe variables enable payment flow.
- Public API keys require Supabase and Netlify Functions; quota variables only override the defaults.
- AI capture requires Supabase, Netlify Functions, the AI capture migrations, and either `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`.
- Missing optional variables keep the app in local-first mode.

## Bark Settings

Bark notification settings are configured in the app UI. Users provide their Bark server URL, device key, and reminder timing.
