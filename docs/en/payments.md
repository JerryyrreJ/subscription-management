# Payments With Stripe

[English](payments.md) | [简体中文](../zh-CN/payments.md)

Stripe is optional. When configured, users can start a Stripe Checkout flow from the app.

## Required Variables

```bash
VITE_STRIPE_PUBLISHABLE_KEY=
VITE_STRIPE_PRICE_ID=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

For premium activation after payment, also configure Supabase:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Functions

```text
netlify/functions/create-checkout-session.ts
netlify/functions/stripe-webhook.ts
```

`create-checkout-session.ts` creates a one-time Stripe Checkout session.

`stripe-webhook.ts` verifies Stripe webhook signatures, records completed payments, and activates premium status when Supabase is configured.

## Stripe Dashboard Setup

1. Create a Stripe product.
2. Create a one-time price.
3. Copy the Price ID into `VITE_STRIPE_PRICE_ID`.
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
