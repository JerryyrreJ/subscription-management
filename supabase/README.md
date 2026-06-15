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

## Existing production environment

1. Link the project with `supabase link --project-ref <project-ref>`.
2. Add `SUPABASE_DB_PASSWORD='...'` to the Git-ignored `.env.local`, or provide a read-only `SUPABASE_DB_URL` environment variable.
3. Run `./scripts/dump-supabase-schema.sh`. The script prefers an explicit read-only URL and otherwise uses the linked project's session pooler.
4. Run `./scripts/verify-supabase-baseline.sh`; it must report a zero diff.
5. Run `supabase db query --linked --file supabase/audit/preflight.sql`; it must return zero rows.
6. Capture `supabase/audit/row-counts.sql` output.
7. In the reviewed rollout window, mark legacy history versions `001` and `002` as reverted, then mark `20260615000100` as applied. These commands change migration history only; they must not execute the baseline SQL.
8. Run `supabase db push --dry-run` and confirm that only `20260615000200_harden_existing_schema.sql` is pending.
9. Apply the hardening migration.
10. Re-run the audit and row counts, then run application checks, cloud sync, payment test mode, and notification smoke tests.

## Migration checks and rollback

- `20260615000100_baseline.sql`: pre-check is a clean local database; post-check is `npm run db:verify`. Existing databases must never execute this migration directly. Rollback is to discard and recreate the local database.
- `20260615000200_harden_existing_schema.sql`: pre-check is a zero-row result from `audit/preflight.sql`; post-check is `npm run db:verify` plus production row-count comparison and application smoke tests. If production verification fails, stop traffic to payment writes, restore the pre-migration schema snapshot, and redeploy the previous Functions bundle. Do not attempt an automated data rollback.

Never use `SUPABASE_SERVICE_ROLE_KEY` as a database connection credential.
