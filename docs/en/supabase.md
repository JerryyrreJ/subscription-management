# Cloud Sync With Supabase

[English](supabase.md) | [简体中文](../zh-CN/supabase.md)

Supabase is optional. When configured, it enables authentication, user profiles, cloud sync, category sync, notification settings, and payment activation.

## Required Variables

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It is needed by Netlify Functions that run outside a user session.

## SQL Setup

Run the SQL files that match the features you plan to enable:

```text
supabase/migrations/001_premium_features.sql
supabase/01_add_notification_enabled.sql
supabase/02_create_notification_settings.sql
supabase/03_create_notification_delivery_locks.sql
supabase/migrations/002_notification_settings_timezone.sql
supabase/migrations/003_notification_settings_locale.sql
```

Use the Supabase Dashboard SQL editor or the Supabase CLI.

## Data Model Areas

- User profiles store account and premium state.
- Subscriptions store recurring payment records.
- Categories store custom user categories.
- Notification settings store Bark reminder preferences and delivery history.
- Delivery locks prevent duplicate scheduled notification sends.

## Security Notes

- Keep Row Level Security enabled for user-owned tables.
- Keep the service role key out of browser-exposed variables.
- Store the service role key only in Netlify or another server environment.
