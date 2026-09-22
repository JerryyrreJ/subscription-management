# Payments With Stripe

[English](payments.md) | [简体中文](../zh-CN/payments.md)

Stripe is optional. When configured, users can start a Stripe Checkout flow from the app.

## Required Variables

```bash
VITE_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
```

For premium activation after payment, also configure Supabase:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Prefer migrating to `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. The legacy names remain supported during migration.

## Functions

```text
netlify/functions/create-checkout-session.ts
netlify/functions/stripe-webhook.ts
```

`create-checkout-session.ts` creates a one-time Stripe Checkout session. When Supabase is enabled, it requires a valid access token; user identity, email, and Price ID are derived by the server.

`stripe-webhook.ts` verifies the signature, payment state, and purchased Price ID before invoking an idempotent database transaction that records payment and activates Premium. Guest support payments remain available for self-hosted deployments without Supabase, but do not grant Premium.

## Stripe Dashboard Setup

1. Create a Stripe product (for example `Subscription Manager Premium`).
2. Create a **one-time** Price of **$9.00 USD** (lifetime). Do not reuse an old $6 Price — create a new Price and keep the product if you want.
3. Copy the new Price ID (`price_...`) into the trusted server variable `STRIPE_PRICE_ID` (Netlify / local `.env`). Optionally keep `VITE_STRIPE_PRICE_ID` only as a legacy server fallback; the browser does not trust it for checkout.
4. Add your publishable key and secret key to the correct environments.
5. Create a webhook endpoint for:

```text
https://your-site.netlify.app/.netlify/functions/stripe-webhook
```

6. Subscribe the endpoint to `checkout.session.completed`.
7. Store the webhook signing secret in `STRIPE_WEBHOOK_SECRET`.

## Local Webhook Testing

Use the Stripe CLI if you want to test webhooks locally:

```bash
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
```

Run the app through Netlify Dev while testing functions:

```bash
npm run dev:full
```
