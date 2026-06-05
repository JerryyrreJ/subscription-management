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

## SQL Setup

Run the notification SQL files:

```text
supabase/01_add_notification_enabled.sql
supabase/02_create_notification_settings.sql
supabase/03_create_notification_delivery_locks.sql
supabase/migrations/002_notification_settings_timezone.sql
supabase/migrations/003_notification_settings_locale.sql
```

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
