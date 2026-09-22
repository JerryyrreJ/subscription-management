# Optional end-to-end encrypted subscription vault

Branch: `feature/optional-e2ee`. Default: off. This is an account-wide, opt-in feature.

## User flow

Settings → Encryption → switch on → save the displayed recovery key → paste it
back to confirm → encrypt existing cloud data → unlock with the saved key.
Turning the switch on starts setup; the account is only marked encrypted after the
migration transaction commits. Canceling setup does not change the account.

The first version uses a random 256-bit recovery key (not a user-chosen password).
The key is generated in the browser, imported as a non-extractable Web Crypto
AES-256-GCM key and never sent to the backend. Each save uses a new random 96-bit
nonce and a 128-bit authentication tag. Additional authenticated data binds the
format version, purpose and account UUID. JSON contains subscriptions and custom
categories. Existing paused/cancelled states and trial/billing-anchor fields are
preserved. The existing dashboard, forms, local analytics, categories and import/
export UI remain available. Plaintext exports require an explicit warning.

Keys and decrypted caches exist only in the active page's memory. Refresh,
manual lock, navigation away or sign-out requires unlocking again. Saves require
network access; failed subscription/category writes are not silently persisted as
plaintext offline drafts. Losing the key loses access to the vault. Resetting the
login password does not recover it. Disabling encryption and key rotation are not
implemented in this version and the setup screen states this before activation.

## Intentionally unavailable in encrypted mode

- Server-generated Bark reminders (no generic cloud reminders in this release).
- Cloud AI capture and ordinary public API/MCP access. Existing keys are revoked;
  new key creation is blocked while encrypted.
- Durable offline access/drafts, remembered decryption keys, and device approval.

Login email, profile, account/payment data and synchronization metadata remain
outside the encrypted vault. The server can observe ciphertext size, account ID
and update timestamps. It cannot independently decrypt the vault content.

## Database deployment order

1. Back up and rehearse on an isolated staging project with the same migrations.
2. Apply **only the new migration**
   `supabase/migrations/20260921123950_optional_e2ee.sql` to existing environments
   whose earlier migrations are already applied. Do not rerun the baseline.
3. Deploy the frontend and functions from this patch together. The updated UI
   fails closed if the vault table is absent or encryption state cannot be checked.
4. Test normal accounts, then enable with a disposable account, check from another
   device, and verify that an old client cannot insert plaintext.

If using the Supabase SQL Editor, run the entire new SQL file once. It contains a
transaction. Check the migration history separately if your normal deployment uses
Supabase CLI migrations; do not apply the same migration twice.

Do not roll the application back to a pre-encryption version after users enable
this feature. Never remove the encrypted table as a rollback. Old clients cannot
display encrypted accounts and must upgrade.

## Migration and access controls

The client reads a complete server snapshot via `prepare_encrypted_vault` (not a
paginated table listing), encrypts it and verifies a local decrypt roundtrip. The
server receives only a concurrency token and the ciphertext, not the key or the
original JSON. `enable_encrypted_vault` checks that the snapshot has not changed,
then atomically deletes plaintext subscriptions, categories, notification settings
and audit logs, revokes API keys, and inserts the encrypted vault. A failure rolls
back the entire transaction. The database cannot prove the client encrypted the
correct data; the client performs this verification before requesting migration.

Every legacy write path is guarded at the database, including service-role writes.
Per-account advisory locks and a private fencing-row write serialize migration
with old writers. The fencing write also makes conflicting repeatable-read
transactions fail rather than rely on a stale snapshot. Ownership changes are
rejected. RLS remains enabled. Authenticated clients only SELECT their own vault;
mutations go through narrowly granted, identity-bound SECURITY DEFINER RPCs with
an empty search_path. Service-role integration checks can SELECT only user_id.
No RPC accepts a caller-selected account ID for vault reads or writes. Saving uses
an expected revision; a stale revision fails instead of overwriting another save.

Plaintext writers already in flight may fail or be rolled back. The setup asks
users to sync all devices and close other tabs. A notification or AI request that
started before activation may already be in flight and cannot be recalled. New
requests fail closed. Browser caches on other devices, exported files, historical
logs and backups cannot be remotely erased; document retention schedules and do
not claim historical copies have vanished. Updated clients purge their account's
known plaintext caches on detecting encryption; obsolete clients can retain theirs.

## Security boundaries

This feature protects content from database inspection and server-side storage
exposure. It does not protect a compromised device, XSS, malicious browser
extensions, a malicious web-client update, deletion/denial of service, or all forms
of a malicious server replaying an older valid encrypted snapshot. There is no
independent rollback-detection anchor in this version. A valid recovery key grants
access to the decrypted content when paired with account access. The web operator
still controls future JavaScript releases; use a reviewed release process and
independent security review before marketing an unconditional zero-knowledge claim.

## Verification

`npm ci && npm run check`

The check includes crypto tampering/account-binding tests, protected-cache tests,
API/AI integration tests, and an embedded PostgreSQL suite applying **all** project
migrations. The database suite checks migration conflict and rollback, real RLS
roles, legacy/service-role plaintext rejection, API-key revocation, audit cleanup,
optimistic revision checks and account deletion. The embedded Auth schema is a
fixture, not a live Supabase deployment. Run `npm run db:verify` with the Supabase
CLI and Docker in staging/local infrastructure as well, and test true concurrent
transactions using separate database connections before production rollout.
