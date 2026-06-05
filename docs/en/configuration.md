# Configuration

[English](configuration.md) | [简体中文](../zh-CN/configuration.md)

The core app runs without environment variables. Add environment variables only for the services you want to enable.

## Environment Variables

| Variable | Required For | Scope |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase auth and cloud sync | Browser |
| `VITE_SUPABASE_ANON_KEY` | Supabase auth and cloud sync | Browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Scheduled notifications and payment activation | Server only |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe checkout | Browser |
| `VITE_STRIPE_PRICE_ID` | Stripe checkout | Browser |
| `STRIPE_SECRET_KEY` | Stripe checkout session creation | Server only |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Server only |
| `URL` | Netlify function callback URLs | Provided by Netlify |

## Browser Variables

Variables prefixed with `VITE_` are included in the browser bundle. Do not put secrets in them.

## Server Variables

Server-only variables must be configured in the hosting provider, such as Netlify environment variables. Never commit service role keys, Stripe secret keys, or webhook secrets.

## Feature Detection

The app checks environment variables at runtime:

- Supabase variables enable authentication and cloud sync.
- Stripe variables enable payment flow.
- Missing optional variables keep the app in local-first mode.

## Bark Settings

Bark notification settings are configured in the app UI. Users provide their Bark server URL, device key, and reminder timing.
