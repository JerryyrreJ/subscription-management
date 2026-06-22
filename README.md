# Subscription Manager

[English](README.md) | [简体中文](README.zh-CN.md)

Use online: [sub.jerrylu.app](https://sub.jerrylu.app)

Subscription Manager is a local-first web app for tracking recurring subscriptions. It supports multiple currencies, renewal reminders, analytics, import/export, and optional cloud sync.

The app works without an account by storing data in the browser. Supabase, Stripe, Netlify Functions, and Bark notifications can be configured when you want hosted sync, payment, or server-side reminders.

## Features

- Track subscriptions with category, amount, currency, billing period, and renewal date
- View monthly and yearly totals in a selected base currency
- Convert between CNY, USD, EUR, JPY, GBP, AUD, CAD, CHF, HKD, and SGD
- Sort and filter subscriptions by name, amount, renewal date, category, or creation date
- Manage built-in and custom categories
- Import and export subscription data as JSON
- Review spending reports, category breakdowns, top subscriptions, and renewal patterns
- Use optional Supabase authentication and multi-device sync
- Send optional Bark push reminders for upcoming renewals
- Create optional Developer API keys for subscription CRUD automation
- Use light or dark mode on desktop and mobile

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- i18next
- Recharts
- Supabase
- Netlify Functions
- Stripe

## Getting Started

### Requirements

- Node.js 22.12 or newer
- npm

### Run Locally

```bash
git clone https://github.com/jerryyrrej/subscription-manager.git
cd subscription-manager
npm install
npm run dev
```

The Vite development server runs at `http://localhost:5173`.

To test Netlify Functions locally, use:

```bash
npm run dev:full
```

This command requires the Netlify CLI.

## Scripts

```bash
npm run dev                 # Start the Vite development server
npm run dev:full            # Start Netlify local development
npm run build               # Build for production
npm run preview             # Preview the production build
npm run lint                # Run ESLint
npm run typecheck           # Run app and Functions TypeScript checks
npm run test                # Run utility tests
npm run test:functions      # Run Netlify Functions tests
npm run db:verify           # Reset and lint a local Supabase database
npm run check               # Run typecheck, lint, tests, and build
npm run test:notifications  # Test scheduled notification logic
```

## Configuration

The core app runs without environment variables. Optional services use the following configuration:

| Service | Variables | Purpose |
| --- | --- | --- |
| Supabase | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Authentication, cloud sync, scheduled notification access |
| Stripe | `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Payment UI, checkout, and webhook handling |
| Public API | `API_FREE_RATE_LIMIT_PER_HOUR`, `API_PREMIUM_RATE_LIMIT_PER_HOUR`, `API_FREE_ACTIVE_KEYS`, `API_PREMIUM_ACTIVE_KEYS`, `API_FAILED_AUTH_RATE_LIMIT_PER_HOUR`, `API_RATE_LIMIT_RETENTION_HOURS` | Optional API quota overrides |
| AI capture | `OPENROUTER_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, `AI_FALLBACK_MODELS`, `AI_FREE_DAILY_PARSES`, `AI_PREMIUM_DAILY_PARSES`, `AI_MAX_INPUT_CHARS`, `AI_MAX_IMAGE_BYTES`, `AI_MONTHLY_BUDGET_USD` | Optional AI-assisted capture; leave provider keys unset to disable |
| Bark | Configured in the app | Push reminders for upcoming renewals |
| Netlify | `URL` is provided by Netlify | Function callbacks and scheduled reminders |

## AI capture & privacy

Adding a subscription can start from a sentence, a pasted bank/credit-card statement, or a screenshot. The **Add with AI** flow asks the model to extract subscriptions, then you confirm or edit each draft before anything is saved — the AI only proposes, it never writes to your data directly.

- **Optional & swappable.** Set `OPENROUTER_API_KEY` to enable the low-cost OpenRouter path. By default it uses `google/gemini-2.5-flash-lite` with `google/gemini-2.5-flash` as a fallback (`AI_FALLBACK_MODELS`). Anthropic remains available with `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`; leaving provider keys unset falls back to the manual form. The model and every guardrail are env-configurable (`AI_MODEL`, quotas, input caps, monthly budget — see `.env.example`), and the model call sits behind a small `SubscriptionParser` interface.
- **Volume & cost control.** Each user has a daily parse quota (free vs premium), every request caps the input size, and a workspace-wide monthly budget breaker pauses the feature once the configured spend ceiling is reached. The key stays server-side only.
- **Privacy.** What you paste or upload is sent once to the model provider for that single extraction. It is **not stored and not logged** — the server keeps only aggregate token counts (for the budget breaker) and a per-user daily counter, never the content. Screenshots are downscaled in the browser before upload.

## Documentation

- [Mintlify documentation site source](docs-site/README.md)
- [Documentation index](docs/README.md)
- [Getting started](docs/en/getting-started.md)
- [Configuration](docs/en/configuration.md)
- [Deployment](docs/en/deployment.md)
- [Cloud sync with Supabase](docs/en/supabase.md)
- [Renewal reminders with Bark](docs/en/notifications.md)
- [Payments with Stripe](docs/en/payments.md)
- [Public API](docs/en/api.md)
- [Changelog](CHANGELOG.md)

## Project Structure

```text
src/                 React application code
src/components/      UI components
src/hooks/           React hooks
src/services/        Cloud, payment, and sync services
src/utils/           Storage, currency, notification, and validation utilities
netlify/functions/   Serverless functions
supabase/            SQL setup and migrations
tests/               Node test runner utility tests
docs/                Public documentation, split by language
docs-site/           Mintlify documentation site, split by language
dev-docs/            Development notes and archived implementation drafts
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
