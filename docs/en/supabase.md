# Cloud Sync With Supabase

[English](supabase.md) | [简体中文](../zh-CN/supabase.md)

Supabase is optional. When configured, it enables authentication, user profiles, cloud sync, category sync, notification settings, payment activation, public API keys, and AI capture quota/budget accounting.

## Required Variables

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
```

`SUPABASE_SECRET_KEY` is server-only. It is needed by Netlify Functions that run outside a user session. The legacy `SUPABASE_SERVICE_ROLE_KEY` name remains supported as an alias.

## SQL Setup

The schema is managed by timestamped migrations:

```text
supabase/migrations/20260615000100_baseline.sql
supabase/migrations/20260615000200_harden_existing_schema.sql
supabase/migrations/20260616000100_public_api.sql
supabase/migrations/20260617000100_public_api_security_fixes.sql
supabase/migrations/20260618000100_agent_operations_layer.sql
supabase/migrations/20260619000100_ai_capture.sql
supabase/migrations/20260625000100_ai_budget_reservations.sql
supabase/migrations/20260714000100_preserve_payments_on_account_deletion.sql
```

For a new environment, run `supabase start` and `npm run db:verify`. For an existing production environment, first create a read-only DDL dump, confirm the baseline diff, run `supabase/audit/preflight.sql`, then mark the baseline and apply the hardening migration. See `supabase/README.md` for the complete workflow.

## Data Model Areas

- User profiles store account and premium state.
- Subscriptions store recurring payment records.
- Categories store custom user categories.
- Notification settings store Bark reminder preferences and delivery history.
- Delivery locks prevent duplicate scheduled notification sends.
- API keys store only hashed key material and permission scopes.
- API audit logs record public API write operations.
- AI usage windows track per-user daily AI capture counts.
- AI cost windows track workspace-wide monthly aggregate token usage and budget reservations. They do not store pasted text, screenshots, or parsed content.
- Account deletion removes the Auth user and user-owned application data. The payment `user_id` is set to null while the payment email and necessary transaction fields are retained for financial reconciliation, refunds, payment disputes, and applicable record-keeping obligations.

## Passkeys (experimental)

Passkey sign-in uses Supabase Auth WebAuthn. The app client opts in with `auth.experimental.passkey: true` and requires `@supabase/supabase-js` ≥ 2.105.0.

### Local CLI

`supabase/config.toml` enables:

```toml
[auth.passkey]
enabled = true

[auth.webauthn]
rp_display_name = "Subscription Management"
rp_id = "127.0.0.1"
rp_origins = ["http://127.0.0.1:5173"]
```

Open the app at `http://127.0.0.1:5173` so the browser origin matches `rp_id` / `rp_origins`. Prefer `127.0.0.1` over `localhost` for local Passkey testing with this config.

### Production Dashboard (manual)

In the Supabase Dashboard go to **Authentication → Passkeys**:

1. Enable Passkey authentication.
2. Set **Relying Party Display Name** (for example, `Subscription Management`).
3. Set a stable **Relying Party ID** to the bare domain that serves the app (for production this is typically `sub.jerrylu.xyz` or `jerrylu.xyz` — pick one and keep it stable; changing RP ID invalidates every enrolled Passkey).
4. Set **Relying Party Origins** to the exact HTTPS origins users will use (up to 5). Include `https://sub.jerrylu.xyz` for production. Loopback HTTP is allowed only for local development.
5. Confirm Site URL / Redirect URLs still cover OAuth and password reset; Passkeys themselves do not use redirects, but the browser origin must be listed in RP Origins.

HTTPS is required outside loopback. Deploy Preview hostnames usually cannot share the same RP Origins list (limit 5), so Passkeys may be unavailable there.

## Security Notes

- Keep Row Level Security enabled for user-owned tables.
- Keep the service role key out of browser-exposed variables.
- Store the service role key only in Netlify or another server environment.
- The `delete-account` Function must use the server-side Secret Key for the Supabase Admin API; the browser submits only the current session access token.
