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

The current migration chain is:

```text
20260615000100_baseline.sql
20260615000200_harden_existing_schema.sql
20260616000100_public_api.sql
20260617000100_public_api_security_fixes.sql
20260618000100_agent_operations_layer.sql
20260619000100_ai_capture.sql
20260625000100_ai_budget_reservations.sql
20260714000100_preserve_payments_on_account_deletion.sql
```

## Existing production environment

1. Link the project with `supabase link --project-ref <project-ref>`.
2. Add `SUPABASE_DB_PASSWORD='...'` to the Git-ignored `.env.local`, or provide a read-only `SUPABASE_DB_URL` environment variable.
3. Run `./scripts/dump-supabase-schema.sh`. The script prefers an explicit read-only URL and otherwise uses the linked project's session pooler.
4. Run `./scripts/verify-supabase-baseline.sh`; it must report a zero diff.
5. Run `supabase db query --linked --file supabase/audit/preflight.sql`; it must return zero rows.
6. Capture `supabase/audit/row-counts.sql` output.
7. In the reviewed rollout window, mark legacy history versions `001` and `002` as reverted, then mark `20260615000100` as applied. These commands change migration history only; they must not execute the baseline SQL.
8. Run `supabase db push --dry-run` and confirm that the pending list contains only timestamped migrations after the baseline. For a production project that has not received the public API and AI capture work yet, that usually means `20260615000200_harden_existing_schema.sql`, `20260616000100_public_api.sql`, `20260617000100_public_api_security_fixes.sql`, `20260618000100_agent_operations_layer.sql`, `20260619000100_ai_capture.sql`, `20260625000100_ai_budget_reservations.sql`, and `20260714000100_preserve_payments_on_account_deletion.sql`.
9. Apply the pending migrations with `supabase db push`.
10. Re-run the audit and row counts, then run application checks, cloud sync, payment test mode, and notification smoke tests.

## Migration checks and rollback

- `20260615000100_baseline.sql`: pre-check is a clean local database; post-check is `npm run db:verify`. Existing databases must never execute this migration directly. Rollback is to discard and recreate the local database.
- `20260615000200_harden_existing_schema.sql`: pre-check is a zero-row result from `audit/preflight.sql`; post-check is `npm run db:verify` plus production row-count comparison and application smoke tests. If production verification fails, stop traffic to payment writes, restore the pre-migration schema snapshot, and redeploy the previous Functions bundle. Do not attempt an automated data rollback.
- `20260616000100_public_api.sql`: creates public API key and rate-limit tables plus RPCs. Pre-check is successful hardening migration; post-check is `npm run db:verify` and API key creation smoke tests. Rollback is to restore the pre-migration schema snapshot and redeploy the previous Functions bundle.
- `20260617000100_public_api_security_fixes.sql`: adds per-user API rate limits and failed-auth throttling. Pre-check is the public API migration; post-check is `npm run db:verify` plus authentication and rate-limit smoke tests. Rollback is to restore the pre-migration schema snapshot and redeploy the previous Functions bundle.
- `20260618000100_agent_operations_layer.sql`: adds subscription lifecycle status, API key scopes, and public API audit logs. Pre-check is the security fixes migration; post-check is `npm run db:verify` plus public API read/write, read-only key, status update, analytics, and audit endpoint smoke tests. Rollback is to restore the pre-migration schema snapshot and redeploy the previous Functions bundle.
- `20260619000100_ai_capture.sql`: adds daily AI capture quota windows and monthly aggregate token accounting. It stores counters only, never pasted text or image content. Pre-check is the agent operations layer; post-check is `npm run db:verify` plus an AI capture smoke test with the provider key configured. Rollback is to restore the pre-migration schema snapshot and redeploy the previous Functions bundle.
- `20260625000100_ai_budget_reservations.sql`: adds atomic AI budget reservation and adjustment RPCs so concurrent AI requests cannot exceed the configured monthly budget. Pre-check is the AI capture migration; post-check is `npm run db:verify` plus quota, budget-exceeded, and provider-failure smoke tests. Rollback is to restore the pre-migration schema snapshot and redeploy the previous Functions bundle.
- `20260714000100_preserve_payments_on_account_deletion.sql`: makes `payments.user_id` nullable and changes the Auth foreign key to `ON DELETE SET NULL`. Account deletion therefore preserves the payment ledger while all other user-owned rows continue to cascade. Pre-check is a zero-row audit result; post-check is `npm run db:verify` plus an account-deletion smoke test in a non-production environment. Rollback requires restoring the previous foreign key only after confirming there are no retained payments with a null owner.

Never use `SUPABASE_SERVICE_ROLE_KEY` as a database connection credential.
