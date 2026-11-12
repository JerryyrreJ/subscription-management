# Database workflow

The timestamped files in `migrations/` are the only supported schema entrypoint.
Files in `legacy/` are retained for historical reference and must not be run on a
new environment.

The checked-in baseline was captured from production project
`uikhflwvhhgifvbuhebi` and reconciled to a zero schema diff on June 15, 2026.
Existing production environments must mark it as applied rather than execute it.

## New local environment

```bash
supabase start
npm run db:verify
```

The current 13-migration chain is:

```text
20260615000100_baseline.sql
20260615000200_harden_existing_schema.sql
20260616000100_public_api.sql
20260617000100_public_api_security_fixes.sql
20260618000100_agent_operations_layer.sql
20260619000100_ai_capture.sql
20260625000100_ai_budget_reservations.sql
20260714000100_preserve_payments_on_account_deletion.sql
20260821000100_monthly_billing_anchor.sql
20260916000100_subscription_trials.sql
20260922000100_ai_monthly_quota.sql
20260922190912_pricing_abuse_limits.sql
20260927012800_payment_lifecycle.sql
```

## Existing production environment

1. Link the project with `supabase link --project-ref <project-ref>`.
2. Add `SUPABASE_DB_PASSWORD='...'` to the Git-ignored `.env.local`, or provide a read-only `SUPABASE_DB_URL` environment variable.
3. Run `./scripts/dump-supabase-schema.sh`. The script prefers an explicit read-only URL and otherwise uses the linked project's session pooler.
4. Run `./scripts/verify-supabase-baseline.sh` (only when onboarding a pre-baseline instance); it must report a zero diff.
5. Run `supabase db query --linked --file supabase/audit/preflight.sql`; it must return zero rows.
6. Capture `supabase/audit/row-counts.sql` output.
7. If onboarding a legacy pre-baseline project, mark legacy history versions `001` and `002` as reverted, then mark `20260615000100` as applied without executing the baseline SQL.
8. Run `supabase db push --dry-run` and confirm that the pending list contains only unapplied timestamped migrations after the baseline.
9. Apply the pending migrations with `supabase db push`.
10. Re-run row counts and `npm run check`, then verify cloud sync, AI capture quotas, API/MCP endpoints, payment test mode, and scheduled notifications.

## Migration checks and rollback

- `20260615000100_baseline.sql`: initial schema baseline for clean local databases (`npm run db:verify`). Never execute directly on an existing database.
- `20260615000200_harden_existing_schema.sql`: schema constraints and RLS hardening (`audit/preflight.sql` zero rows required).
- `20260616000100_public_api.sql`: creates Developer API key (`api_keys`) and rate-limit tables plus RPCs.
- `20260617000100_public_api_security_fixes.sql`: adds per-user API rate limits and failed-auth throttling.
- `20260618000100_agent_operations_layer.sql`: adds subscription lifecycle `status`, API key `scopes`, and `api_audit_log`.
- `20260619000100_ai_capture.sql`: introduces AI capture usage and workspace monthly token cost tables (counters only, never pasted text or screenshots; user window later upgraded from daily to monthly in `20260922000100_ai_monthly_quota.sql`).
- `20260625000100_ai_budget_reservations.sql`: adds atomic workspace monthly AI budget reservation and adjustment RPCs.
- `20260714000100_preserve_payments_on_account_deletion.sql`: makes `payments.user_id` nullable (`ON DELETE SET NULL`) so self-serve account deletion preserves anonymized payment records for financial reconciliation.
- `20260821000100_monthly_billing_anchor.sql`: adds `billing_anchor_day` (`1..31`) to preserve monthly calendar-day anchors across short months.
- `20260916000100_subscription_trials.sql`: adds `is_trial` and `trial_ends_on` constraints for one-shot free trials.
- `20260922000100_ai_monthly_quota.sql`: switches per-user AI capture quotas to monthly windows (`10/month` Free, `300/month` Premium by default, charged on successful parses only).
- `20260922190912_pricing_abuse_limits.sql`: aligns unified API/MCP abuse-protection limits (`5` active keys, `60` requests/minute on both plans).
- `20260927012800_payment_lifecycle.sql`: adds full Stripe payment, async checkout, refund, and dispute reconciliation state (`fulfill_premium_checkout` / payment lifecycle ledger).

Never use `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` as a Postgres connection credential.
