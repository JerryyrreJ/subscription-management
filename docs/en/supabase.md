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

The schema is managed by timestamped migrations:

```text
supabase/migrations/20260615000100_baseline.sql
supabase/migrations/20260615000200_harden_existing_schema.sql
```

For a new environment, run `supabase start` and `npm run db:verify`. For an existing production environment, first create a read-only DDL dump, confirm the baseline diff, run `supabase/audit/preflight.sql`, then mark the baseline and apply the hardening migration. See `supabase/README.md` for the complete workflow.

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
