# Renewal Reminders With Bark

[English](notifications.md) | [简体中文](../zh-CN/notifications.md)

Subscription Manager can send renewal reminders through Bark. The hosted reminder flow uses a Netlify Scheduled Function and Supabase-backed notification settings.

## What Users Configure

Users configure Bark settings in the app:

- Bark server URL
- Bark device key
- Reminder timing
- Per-subscription notification toggle

## Required Hosted Services

- Supabase for notification settings and subscriptions
- Netlify Functions for scheduled checks
- Bark official server or a self-hosted Bark server

## Required Environment Variables

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Prefer `SUPABASE_SECRET_KEY` for new deployments. The legacy `SUPABASE_SERVICE_ROLE_KEY` name remains supported as an alias.

## SQL Setup

Notification tables and constraints are included in the Supabase migrations. For current deployments, use:

```text
supabase/migrations/20260615000100_baseline.sql
supabase/migrations/20260615000200_harden_existing_schema.sql
```

Older setup notes and legacy migration files are kept in `supabase/legacy/` for reference only.

## Scheduled Function

The scheduled function lives at:

```text
netlify/functions/send-scheduled-notifications.ts
```

It checks eligible subscriptions, sends Bark messages, records delivery history, and avoids duplicate sends.

## Local Testing

```bash
npm run test:notifications
```

Use Netlify Dev when testing the full function runtime:

```bash
npm run dev:full
```
