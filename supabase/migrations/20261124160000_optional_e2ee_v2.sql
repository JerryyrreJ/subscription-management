-- Zero-feature-loss optional end-to-end encryption (E2EE v2).
--
-- Design invariants:
--   1. No raw or derived encryption key material (DEK, KEK, mnemonic, PRF output,
--      or Bark AES key) is ever accepted or persisted by the database.
--   2. Subscriptions, custom categories, and API write audit logs are stored per-row
--      as AES-256-GCM envelopes so concurrent multi-device sync, pagination, and
--      per-subscription audit trails work without whole-account conflicts.
--   3. Key slots wrap a single 256-bit DEK under multiple independent outer locks:
--      a mandatory 16-word recovery phrase slot plus optional WebAuthn Passkey PRF slots.
--   4. Scheduled Bark reminders use pre-computed client-encrypted Bark payloads
--      (or zero-metadata generic date triggers) in `encrypted_push_schedules`.
--   5. All authenticated browser access is restricted to first-party sessions via
--      `public.is_direct_user_session()` so OAuth 2.1 tokens must go through `/api/*`.

BEGIN;

-- 1. Envelope validation helper -----------------------------------------------

CREATE OR REPLACE FUNCTION public.is_valid_e2ee_envelope(p_envelope JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    p_envelope IS NOT NULL
    AND jsonb_typeof(p_envelope) = 'object'
    AND p_envelope -> 'version' = '1'::jsonb
    AND jsonb_typeof(p_envelope -> 'nonce') = 'string'
    AND (p_envelope ->> 'nonce') ~ '^[A-Za-z0-9+/]{16}$'
    AND jsonb_typeof(p_envelope -> 'ciphertext') = 'string'
    AND (p_envelope ->> 'ciphertext') ~ '^[A-Za-z0-9+/]+={0,2}$'
    AND char_length(p_envelope ->> 'ciphertext') BETWEEN 24 AND 524288
    AND p_envelope ?& ARRAY['version', 'nonce', 'ciphertext']
    AND (p_envelope - ARRAY['version', 'nonce', 'ciphertext']) = '{}'::jsonb;
$$;

REVOKE ALL ON FUNCTION public.is_valid_e2ee_envelope(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_e2ee_envelope(JSONB) TO anon, authenticated, service_role;

-- 2. Account encryption state & key slots -------------------------------------

CREATE TABLE IF NOT EXISTS public.e2ee_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  key_epoch INTEGER NOT NULL DEFAULT 1 CHECK (key_epoch > 0),
  dek_check JSONB NOT NULL CHECK (public.is_valid_e2ee_envelope(dek_check)),
  dek_verifier_hash TEXT NOT NULL CHECK (dek_verifier_hash ~ '^[a-f0-9]{64}$'),
  bark_mode TEXT NOT NULL DEFAULT 'generic' CHECK (bark_mode IN ('off', 'generic', 'bark_e2ee')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.e2ee_accounts
  ADD COLUMN IF NOT EXISTS dek_verifier_hash TEXT NOT NULL CHECK (dek_verifier_hash ~ '^[a-f0-9]{64}$');

COMMENT ON TABLE public.e2ee_accounts IS
  'Per-account E2EE configuration and DEK verification ciphertext. Never stores keys.';

CREATE TABLE IF NOT EXISTS public.e2ee_key_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.e2ee_accounts(user_id) ON DELETE CASCADE,
  slot_type TEXT NOT NULL CHECK (slot_type IN ('recovery_mnemonic', 'passkey_prf')),
  label TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  credential_id TEXT CHECK (credential_id IS NULL OR char_length(btrim(credential_id)) BETWEEN 1 AND 512),
  kdf_params JSONB NOT NULL DEFAULT '{}'::jsonb
    CONSTRAINT e2ee_key_slots_kdf_params_size_check CHECK (
      jsonb_typeof(kdf_params) = 'object'
      AND octet_length(kdf_params::text) <= 2048
    ),
  wrapped_dek JSONB NOT NULL CHECK (public.is_valid_e2ee_envelope(wrapped_dek)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  CONSTRAINT e2ee_key_slots_credential_type_check CHECK (
    (slot_type = 'passkey_prf' AND credential_id IS NOT NULL)
    OR (slot_type = 'recovery_mnemonic' AND credential_id IS NULL)
  ),
  CONSTRAINT e2ee_key_slots_user_credential_key UNIQUE (user_id, credential_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.e2ee_key_slots'::regclass
      AND conname = 'e2ee_key_slots_kdf_params_size_check'
  ) THEN
    ALTER TABLE public.e2ee_key_slots
      ADD CONSTRAINT e2ee_key_slots_kdf_params_size_check
      CHECK (jsonb_typeof(kdf_params) = 'object' AND octet_length(kdf_params::text) <= 2048);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS e2ee_key_slots_user_idx ON public.e2ee_key_slots(user_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS e2ee_key_slots_one_recovery_per_user_idx
  ON public.e2ee_key_slots(user_id)
  WHERE slot_type = 'recovery_mnemonic';

COMMENT ON TABLE public.e2ee_key_slots IS
  'Wrapped copies of the account DEK (16-word recovery phrase slot + WebAuthn Passkey PRF slots).';

-- 3. Row-level encrypted records & schedules ----------------------------------

CREATE TABLE IF NOT EXISTS public.encrypted_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.e2ee_accounts(user_id) ON DELETE CASCADE,
  envelope JSONB NOT NULL CHECK (public.is_valid_e2ee_envelope(envelope)),
  subscription_hash TEXT CHECK (subscription_hash IS NULL OR subscription_hash ~ '^[a-f0-9]{64}$'),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT encrypted_subscriptions_pkey PRIMARY KEY (user_id, id)
);

ALTER TABLE public.encrypted_subscriptions
  ADD COLUMN IF NOT EXISTS subscription_hash TEXT CHECK (subscription_hash IS NULL OR subscription_hash ~ '^[a-f0-9]{64}$');

CREATE INDEX IF NOT EXISTS encrypted_subscriptions_user_created_idx
  ON public.encrypted_subscriptions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.encrypted_categories (
  category_id TEXT NOT NULL CHECK (char_length(btrim(category_id)) BETWEEN 1 AND 80),
  user_id UUID NOT NULL REFERENCES public.e2ee_accounts(user_id) ON DELETE CASCADE,
  envelope JSONB NOT NULL CHECK (public.is_valid_e2ee_envelope(envelope)),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT encrypted_categories_pkey PRIMARY KEY (user_id, category_id)
);

CREATE INDEX IF NOT EXISTS encrypted_categories_user_idx
  ON public.encrypted_categories(user_id);

CREATE TABLE IF NOT EXISTS public.encrypted_push_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.e2ee_accounts(user_id) ON DELETE CASCADE,
  subscription_hash TEXT NOT NULL CHECK (subscription_hash ~ '^[a-f0-9]{64}$'),
  trigger_date DATE NOT NULL,
  payload_mode TEXT NOT NULL CHECK (payload_mode IN ('bark_ciphertext', 'generic')),
  bark_ciphertext TEXT CHECK (
    bark_ciphertext IS NULL
    OR (bark_ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$' AND char_length(bark_ciphertext) BETWEEN 16 AND 16384)
  ),
  bark_iv TEXT CHECK (bark_iv IS NULL OR bark_iv ~ '^[A-Za-z0-9]{16}$'),
  dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT encrypted_push_schedules_payload_check CHECK (
    (payload_mode = 'bark_ciphertext' AND bark_ciphertext IS NOT NULL AND bark_iv IS NOT NULL)
    OR (payload_mode = 'generic' AND bark_ciphertext IS NULL AND bark_iv IS NULL)
  ),
  CONSTRAINT encrypted_push_schedules_unique_key UNIQUE (user_id, subscription_hash, trigger_date)
);

CREATE INDEX IF NOT EXISTS encrypted_push_schedules_due_idx
  ON public.encrypted_push_schedules(trigger_date, user_id)
  WHERE dispatched_at IS NULL;

CREATE TABLE IF NOT EXISTS public.encrypted_api_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.e2ee_accounts(user_id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  oauth_client_id TEXT CHECK (oauth_client_id IS NULL OR char_length(btrim(oauth_client_id)) BETWEEN 1 AND 255),
  action TEXT NOT NULL CHECK (action IN ('subscription.create', 'subscription.update', 'subscription.delete')),
  subscription_id UUID,
  request_id TEXT,
  envelope JSONB NOT NULL CHECK (public.is_valid_e2ee_envelope(envelope)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.encrypted_api_audit_log
  ADD COLUMN IF NOT EXISTS oauth_client_id TEXT CHECK (oauth_client_id IS NULL OR char_length(btrim(oauth_client_id)) BETWEEN 1 AND 255);

CREATE INDEX IF NOT EXISTS encrypted_api_audit_log_user_created_idx
  ON public.encrypted_api_audit_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.e2ee_account_fences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  epoch BIGINT NOT NULL DEFAULT 0
);

-- 4. Updated-at & revision triggers -------------------------------------------

CREATE OR REPLACE FUNCTION public.bump_e2ee_row_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Changing record owner is not supported' USING ERRCODE = '42501';
    END IF;
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_e2ee_row_revision() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS e2ee_accounts_set_updated_at ON public.e2ee_accounts;
CREATE TRIGGER e2ee_accounts_set_updated_at
BEFORE UPDATE ON public.e2ee_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS encrypted_subscriptions_bump_revision ON public.encrypted_subscriptions;
CREATE TRIGGER encrypted_subscriptions_bump_revision
BEFORE UPDATE ON public.encrypted_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.bump_e2ee_row_revision();

DROP TRIGGER IF EXISTS encrypted_categories_bump_revision ON public.encrypted_categories;
CREATE TRIGGER encrypted_categories_bump_revision
BEFORE UPDATE ON public.encrypted_categories
FOR EACH ROW EXECUTE FUNCTION public.bump_e2ee_row_revision();

-- 5. RLS & OAuth isolation policies -------------------------------------------

ALTER TABLE public.e2ee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2ee_key_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_push_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encrypted_api_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e2ee_account_fences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.e2ee_accounts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.e2ee_key_slots FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.encrypted_subscriptions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.encrypted_categories FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.encrypted_push_schedules FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.encrypted_api_audit_log FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.e2ee_account_fences FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.e2ee_accounts TO authenticated;
GRANT UPDATE (bark_mode) ON public.e2ee_accounts TO authenticated;
GRANT SELECT ON public.e2ee_accounts TO service_role;

GRANT SELECT ON public.e2ee_key_slots TO authenticated;
GRANT UPDATE (last_used_at) ON public.e2ee_key_slots TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.encrypted_subscriptions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encrypted_categories TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encrypted_push_schedules TO authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.encrypted_api_audit_log TO service_role;

-- First-party browser RLS policies + restrictive OAuth block
DROP POLICY IF EXISTS e2ee_accounts_select_own ON public.e2ee_accounts;
DROP POLICY IF EXISTS e2ee_accounts_update_own ON public.e2ee_accounts;
DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.e2ee_accounts;
CREATE POLICY e2ee_accounts_select_own ON public.e2ee_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY e2ee_accounts_update_own ON public.e2ee_accounts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY block_oauth_tokens_direct_access ON public.e2ee_accounts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_direct_user_session()) WITH CHECK (public.is_direct_user_session());

DROP POLICY IF EXISTS e2ee_key_slots_select_own ON public.e2ee_key_slots;
DROP POLICY IF EXISTS e2ee_key_slots_update_own ON public.e2ee_key_slots;
DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.e2ee_key_slots;
CREATE POLICY e2ee_key_slots_select_own ON public.e2ee_key_slots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY e2ee_key_slots_update_own ON public.e2ee_key_slots
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY block_oauth_tokens_direct_access ON public.e2ee_key_slots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_direct_user_session()) WITH CHECK (public.is_direct_user_session());

DROP POLICY IF EXISTS encrypted_subscriptions_manage_own ON public.encrypted_subscriptions;
DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.encrypted_subscriptions;
CREATE POLICY encrypted_subscriptions_manage_own ON public.encrypted_subscriptions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY block_oauth_tokens_direct_access ON public.encrypted_subscriptions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_direct_user_session()) WITH CHECK (public.is_direct_user_session());

DROP POLICY IF EXISTS encrypted_categories_manage_own ON public.encrypted_categories;
DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.encrypted_categories;
CREATE POLICY encrypted_categories_manage_own ON public.encrypted_categories
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY block_oauth_tokens_direct_access ON public.encrypted_categories
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_direct_user_session()) WITH CHECK (public.is_direct_user_session());

DROP POLICY IF EXISTS encrypted_push_schedules_manage_own ON public.encrypted_push_schedules;
DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.encrypted_push_schedules;
CREATE POLICY encrypted_push_schedules_manage_own ON public.encrypted_push_schedules
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY block_oauth_tokens_direct_access ON public.encrypted_push_schedules
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_direct_user_session()) WITH CHECK (public.is_direct_user_session());

-- Service-role policies for Functions (cron reminders, /api/v1/vault, /api/mcp bridge)
DROP POLICY IF EXISTS service_role_read_e2ee_accounts ON public.e2ee_accounts;
DROP POLICY IF EXISTS service_role_manage_encrypted_subscriptions ON public.encrypted_subscriptions;
DROP POLICY IF EXISTS service_role_manage_encrypted_categories ON public.encrypted_categories;
DROP POLICY IF EXISTS service_role_manage_encrypted_push_schedules ON public.encrypted_push_schedules;
DROP POLICY IF EXISTS service_role_manage_encrypted_api_audit_log ON public.encrypted_api_audit_log;
CREATE POLICY service_role_read_e2ee_accounts ON public.e2ee_accounts
  FOR SELECT TO service_role USING (true);
CREATE POLICY service_role_manage_encrypted_subscriptions ON public.encrypted_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_manage_encrypted_categories ON public.encrypted_categories
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_manage_encrypted_push_schedules ON public.encrypted_push_schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_manage_encrypted_api_audit_log ON public.encrypted_api_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Plaintext write guards while E2EE is active ------------------------------

CREATE OR REPLACE FUNCTION public.reject_plaintext_for_encrypted_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing record owner is not supported' USING ERRCODE = '42501';
  END IF;

  v_user := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF v_user IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 821921));

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
    INSERT INTO public.e2ee_account_fences(user_id) VALUES (v_user)
      ON CONFLICT (user_id) DO UPDATE SET epoch = public.e2ee_account_fences.epoch + 1;
  END IF;

  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM public.e2ee_accounts WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'E2EE is enabled for this account; plaintext writes are disabled' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_plaintext_for_encrypted_account() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS e2ee_guard_subscriptions ON public.subscriptions;
CREATE TRIGGER e2ee_guard_subscriptions
BEFORE INSERT OR UPDATE OR DELETE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_for_encrypted_account();

DROP TRIGGER IF EXISTS e2ee_guard_categories ON public.user_categories;
CREATE TRIGGER e2ee_guard_categories
BEFORE INSERT OR UPDATE OR DELETE ON public.user_categories
FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_for_encrypted_account();

DROP TRIGGER IF EXISTS e2ee_guard_audit ON public.api_audit_log;
CREATE TRIGGER e2ee_guard_audit
BEFORE INSERT OR UPDATE OR DELETE ON public.api_audit_log
FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_for_encrypted_account();

-- 7. Snapshot, enable, disable & key-slot management RPCs ---------------------

CREATE OR REPLACE FUNCTION public.e2ee_plaintext_snapshot(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'subscriptions', COALESCE(
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.subscriptions s WHERE s.user_id = p_user_id),
      '[]'::jsonb
    ),
    'categories', COALESCE(
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.category_id) FROM public.user_categories c WHERE c.user_id = p_user_id),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.e2ee_plaintext_snapshot(UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prepare_e2ee_migration()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_snapshot JSONB;
BEGIN
  IF v_user IS NULL OR NOT public.is_direct_user_session() THEN
    RAISE EXCEPTION 'Direct browser authentication required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.e2ee_accounts WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'End-to-end encryption is already enabled';
  END IF;

  v_snapshot := public.e2ee_plaintext_snapshot(v_user);
  RETURN jsonb_build_object(
    'snapshot', v_snapshot,
    'token', md5(v_snapshot::text)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_e2ee_migration() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_e2ee_migration() TO authenticated;

-- Drop superseded draft RPC signatures so re-running this migration never leaves
-- legacy overloads callable without DEK control proof or snapshot tokens.
DROP FUNCTION IF EXISTS public.enable_e2ee_vault(TEXT, JSONB, TEXT, JSONB, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.replace_e2ee_recovery_slot(TEXT, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.disable_e2ee_vault(JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.enable_e2ee_vault(
  p_snapshot_token TEXT,
  p_dek_check JSONB,
  p_dek_verifier_hash TEXT,
  p_bark_mode TEXT,
  p_key_slots JSONB,
  p_subscriptions JSONB DEFAULT '[]'::jsonb,
  p_categories JSONB DEFAULT '[]'::jsonb,
  p_push_schedules JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_recovery_count INTEGER;
BEGIN
  IF v_user IS NULL OR NOT public.is_direct_user_session() THEN
    RAISE EXCEPTION 'Direct browser authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 821921));

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
    INSERT INTO public.e2ee_account_fences(user_id) VALUES (v_user)
      ON CONFLICT (user_id) DO UPDATE SET epoch = public.e2ee_account_fences.epoch + 1;
  END IF;

  IF EXISTS (SELECT 1 FROM public.e2ee_accounts WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'End-to-end encryption is already enabled';
  END IF;

  IF p_snapshot_token IS NULL OR p_snapshot_token <> md5(public.e2ee_plaintext_snapshot(v_user)::text) THEN
    RAISE EXCEPTION 'Account data changed on another device. Sync and retry.' USING ERRCODE = '40001';
  END IF;

  IF p_dek_verifier_hash IS NULL OR p_dek_verifier_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'A valid DEK verifier commitment hash is required';
  END IF;

  IF p_key_slots IS NULL OR jsonb_typeof(p_key_slots) <> 'array' OR jsonb_array_length(p_key_slots) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Between 1 and 10 key slots are required';
  END IF;

  SELECT COUNT(*)
  INTO v_recovery_count
  FROM jsonb_array_elements(p_key_slots) AS slot
  WHERE slot ->> 'slot_type' = 'recovery_mnemonic';

  IF COALESCE(v_recovery_count, 0) <> 1 THEN
    RAISE EXCEPTION 'Exactly one 16-word recovery phrase slot is required before enabling encryption';
  END IF;

  -- Remove plaintext records BEFORE inserting e2ee_accounts so guard triggers allow the cleanup
  DELETE FROM public.api_audit_log WHERE user_id = v_user;
  DELETE FROM public.subscriptions WHERE user_id = v_user;
  DELETE FROM public.user_categories WHERE user_id = v_user;
  UPDATE public.user_notification_settings
    SET bark_history = '{}'::jsonb
    WHERE user_id = v_user;

  INSERT INTO public.e2ee_accounts (user_id, key_epoch, dek_check, dek_verifier_hash, bark_mode)
  VALUES (v_user, 1, p_dek_check, p_dek_verifier_hash, COALESCE(p_bark_mode, 'generic'));

  INSERT INTO public.e2ee_key_slots (user_id, slot_type, label, credential_id, kdf_params, wrapped_dek)
  SELECT
    v_user,
    slot ->> 'slot_type',
    slot ->> 'label',
    NULLIF(slot ->> 'credential_id', ''),
    COALESCE(slot -> 'kdf_params', '{}'::jsonb),
    slot -> 'wrapped_dek'
  FROM jsonb_array_elements(p_key_slots) AS slot;

  IF p_subscriptions IS NOT NULL AND jsonb_typeof(p_subscriptions) = 'array' AND jsonb_array_length(p_subscriptions) > 0 THEN
    INSERT INTO public.encrypted_subscriptions (id, user_id, envelope, subscription_hash)
    SELECT
      (item ->> 'id')::UUID,
      v_user,
      item -> 'envelope',
      NULLIF(item ->> 'subscription_hash', '')
    FROM jsonb_array_elements(p_subscriptions) AS item;
  END IF;

  IF p_categories IS NOT NULL AND jsonb_typeof(p_categories) = 'array' AND jsonb_array_length(p_categories) > 0 THEN
    INSERT INTO public.encrypted_categories (category_id, user_id, envelope)
    SELECT
      item ->> 'category_id',
      v_user,
      item -> 'envelope'
    FROM jsonb_array_elements(p_categories) AS item;
  END IF;

  IF p_push_schedules IS NOT NULL AND jsonb_typeof(p_push_schedules) = 'array' AND jsonb_array_length(p_push_schedules) > 0 THEN
    INSERT INTO public.encrypted_push_schedules (
      user_id,
      subscription_hash,
      trigger_date,
      payload_mode,
      bark_ciphertext,
      bark_iv
    )
    SELECT
      v_user,
      item ->> 'subscription_hash',
      (item ->> 'trigger_date')::DATE,
      item ->> 'payload_mode',
      NULLIF(item ->> 'bark_ciphertext', ''),
      NULLIF(item ->> 'bark_iv', '')
    FROM jsonb_array_elements(p_push_schedules) AS item
    ON CONFLICT (user_id, subscription_hash, trigger_date) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.enable_e2ee_vault(TEXT, JSONB, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enable_e2ee_vault(TEXT, JSONB, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.add_e2ee_key_slot(
  p_slot_type TEXT,
  p_label TEXT,
  p_credential_id TEXT,
  p_kdf_params JSONB,
  p_wrapped_dek JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_slot_id UUID;
  v_slot_count INTEGER;
BEGIN
  IF v_user IS NULL OR NOT public.is_direct_user_session() THEN
    RAISE EXCEPTION 'Direct browser authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 821921));

  IF NOT EXISTS (SELECT 1 FROM public.e2ee_accounts WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'End-to-end encryption is not enabled';
  END IF;

  IF p_slot_type <> 'passkey_prf' THEN
    RAISE EXCEPTION 'Only passkey_prf slots can be added; use rotate_e2ee_dek to rotate recovery phrases';
  END IF;

  SELECT COUNT(*)
  INTO v_slot_count
  FROM public.e2ee_key_slots
  WHERE user_id = v_user;

  IF COALESCE(v_slot_count, 0) >= 10 THEN
    RAISE EXCEPTION 'Maximum number of encryption key slots (10) reached';
  END IF;

  INSERT INTO public.e2ee_key_slots (
    user_id,
    slot_type,
    label,
    credential_id,
    kdf_params,
    wrapped_dek
  ) VALUES (
    v_user,
    p_slot_type,
    p_label,
    NULLIF(p_credential_id, ''),
    COALESCE(p_kdf_params, '{}'::jsonb),
    p_wrapped_dek
  )
  RETURNING id INTO v_slot_id;

  RETURN v_slot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_e2ee_key_slot(TEXT, TEXT, TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_e2ee_key_slot(TEXT, TEXT, TEXT, JSONB, JSONB)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.e2ee_encrypted_snapshot_token(p_user UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        jsonb_build_object(
          'key_epoch', COALESCE((SELECT key_epoch FROM public.e2ee_accounts WHERE user_id = p_user), 0),
          'subscriptions', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('id', s.id, 'revision', s.revision, 'updated_at', s.updated_at)
                ORDER BY s.id
              )
              FROM public.encrypted_subscriptions s
              WHERE s.user_id = p_user
            ),
            '[]'::jsonb
          ),
          'categories', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object('category_id', c.category_id, 'revision', c.revision, 'updated_at', c.updated_at)
                ORDER BY c.category_id
              )
              FROM public.encrypted_categories c
              WHERE c.user_id = p_user
            ),
            '[]'::jsonb
          )
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );
$$;

REVOKE ALL ON FUNCTION public.e2ee_encrypted_snapshot_token(UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prepare_e2ee_encrypted_operation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_key_epoch INTEGER;
  v_token TEXT;
  v_subs JSONB;
  v_cats JSONB;
BEGIN
  IF v_user IS NULL OR NOT public.is_direct_user_session() THEN
    RAISE EXCEPTION 'Direct browser authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT key_epoch
  INTO v_key_epoch
  FROM public.e2ee_accounts
  WHERE user_id = v_user;

  IF v_key_epoch IS NULL THEN
    RAISE EXCEPTION 'End-to-end encryption is not enabled';
  END IF;

  v_token := public.e2ee_encrypted_snapshot_token(v_user);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'envelope', s.envelope,
        'revision', s.revision,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      )
      ORDER BY s.id
    ),
    '[]'::jsonb
  )
  INTO v_subs
  FROM public.encrypted_subscriptions s
  WHERE s.user_id = v_user;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'category_id', c.category_id,
        'envelope', c.envelope,
        'revision', c.revision,
        'created_at', c.created_at,
        'updated_at', c.updated_at
      )
      ORDER BY c.category_id
    ),
    '[]'::jsonb
  )
  INTO v_cats
  FROM public.encrypted_categories c
  WHERE c.user_id = v_user;

  RETURN jsonb_build_object(
    'token', v_token,
    'key_epoch', v_key_epoch,
    'snapshot', jsonb_build_object(
      'subscriptions', v_subs,
      'categories', v_cats
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_e2ee_encrypted_operation()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_e2ee_encrypted_operation()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.rotate_e2ee_dek(
  p_snapshot_token TEXT,
  p_current_control_proof TEXT,
  p_new_dek_check JSONB,
  p_new_dek_verifier_hash TEXT,
  p_recovery_label TEXT,
  p_recovery_kdf_params JSONB,
  p_recovery_wrapped_dek JSONB,
  p_subscriptions JSONB DEFAULT '[]'::jsonb,
  p_categories JSONB DEFAULT '[]'::jsonb,
  p_push_schedules JSONB DEFAULT '[]'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_account RECORD;
  v_new_epoch INTEGER;
BEGIN
  IF v_user IS NULL OR NOT public.is_direct_user_session() THEN
    RAISE EXCEPTION 'Direct browser authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 821921));

  SELECT key_epoch, dek_verifier_hash
  INTO v_account
  FROM public.e2ee_accounts
  WHERE user_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'End-to-end encryption is not enabled';
  END IF;

  IF p_current_control_proof IS NULL
    OR p_current_control_proof !~ '^[a-f0-9]{64}$'
    OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_current_control_proof, 'UTF8')), 'hex') <> v_account.dek_verifier_hash
  THEN
    RAISE EXCEPTION 'Valid vault key proof is required to rotate encryption keys' USING ERRCODE = '42501';
  END IF;

  IF p_snapshot_token IS NULL OR p_snapshot_token <> public.e2ee_encrypted_snapshot_token(v_user) THEN
    RAISE EXCEPTION 'Encrypted vault changed on another device. Sync and retry.' USING ERRCODE = '40001';
  END IF;

  IF p_new_dek_verifier_hash IS NULL OR p_new_dek_verifier_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'A valid new DEK verifier commitment hash is required';
  END IF;

  v_new_epoch := v_account.key_epoch + 1;

  UPDATE public.e2ee_accounts
  SET
    key_epoch = v_new_epoch,
    dek_check = p_new_dek_check,
    dek_verifier_hash = p_new_dek_verifier_hash
  WHERE user_id = v_user;

  -- Rotating the DEK invalidates all prior wrapped key slots (old recovery phrase & Passkey slots)
  -- as well as old audit entries encrypted under the prior epoch's DEK.
  DELETE FROM public.e2ee_key_slots WHERE user_id = v_user;
  INSERT INTO public.e2ee_key_slots (
    user_id,
    slot_type,
    label,
    credential_id,
    kdf_params,
    wrapped_dek
  ) VALUES (
    v_user,
    'recovery_mnemonic',
    p_recovery_label,
    NULL,
    COALESCE(p_recovery_kdf_params, '{}'::jsonb),
    p_recovery_wrapped_dek
  );

  DELETE FROM public.encrypted_subscriptions WHERE user_id = v_user;
  IF p_subscriptions IS NOT NULL AND jsonb_typeof(p_subscriptions) = 'array' AND jsonb_array_length(p_subscriptions) > 0 THEN
    INSERT INTO public.encrypted_subscriptions (id, user_id, envelope, subscription_hash)
    SELECT
      (item ->> 'id')::UUID,
      v_user,
      item -> 'envelope',
      NULLIF(item ->> 'subscription_hash', '')
    FROM jsonb_array_elements(p_subscriptions) AS item;
  END IF;

  DELETE FROM public.encrypted_categories WHERE user_id = v_user;
  IF p_categories IS NOT NULL AND jsonb_typeof(p_categories) = 'array' AND jsonb_array_length(p_categories) > 0 THEN
    INSERT INTO public.encrypted_categories (category_id, user_id, envelope)
    SELECT
      item ->> 'category_id',
      v_user,
      item -> 'envelope'
    FROM jsonb_array_elements(p_categories) AS item;
  END IF;

  DELETE FROM public.encrypted_push_schedules WHERE user_id = v_user;
  IF p_push_schedules IS NOT NULL AND jsonb_typeof(p_push_schedules) = 'array' AND jsonb_array_length(p_push_schedules) > 0 THEN
    INSERT INTO public.encrypted_push_schedules (
      user_id,
      subscription_hash,
      trigger_date,
      payload_mode,
      bark_ciphertext,
      bark_iv
    )
    SELECT
      v_user,
      item ->> 'subscription_hash',
      (item ->> 'trigger_date')::DATE,
      item ->> 'payload_mode',
      NULLIF(item ->> 'bark_ciphertext', ''),
      NULLIF(item ->> 'bark_iv', '')
    FROM jsonb_array_elements(p_push_schedules) AS item
    ON CONFLICT (user_id, subscription_hash, trigger_date) DO NOTHING;
  END IF;

  DELETE FROM public.encrypted_api_audit_log WHERE user_id = v_user;

  RETURN v_new_epoch;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_e2ee_dek(TEXT, TEXT, JSONB, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_e2ee_dek(TEXT, TEXT, JSONB, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_e2ee_key_slot(p_slot_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_slot_type TEXT;
  v_remaining_recovery INTEGER;
BEGIN
  IF v_user IS NULL OR NOT public.is_direct_user_session() THEN
    RAISE EXCEPTION 'Direct browser authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 821921));

  SELECT slot_type
  INTO v_slot_type
  FROM public.e2ee_key_slots
  WHERE id = p_slot_id AND user_id = v_user;

  IF v_slot_type IS NULL THEN
    RAISE EXCEPTION 'Key slot not found';
  END IF;

  IF v_slot_type = 'recovery_mnemonic' THEN
    SELECT COUNT(*)
    INTO v_remaining_recovery
    FROM public.e2ee_key_slots
    WHERE user_id = v_user
      AND slot_type = 'recovery_mnemonic'
      AND id <> p_slot_id;

    IF COALESCE(v_remaining_recovery, 0) < 1 THEN
      RAISE EXCEPTION 'Cannot remove your active 16-word recovery phrase slot; regenerate it instead';
    END IF;
  END IF;

  DELETE FROM public.e2ee_key_slots WHERE id = p_slot_id AND user_id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_e2ee_key_slot(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_e2ee_key_slot(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.disable_e2ee_vault(
  p_snapshot_token TEXT,
  p_control_proof TEXT,
  p_subscriptions JSONB DEFAULT '[]'::jsonb,
  p_categories JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_verifier_hash TEXT;
BEGIN
  IF v_user IS NULL OR NOT public.is_direct_user_session() THEN
    RAISE EXCEPTION 'Direct browser authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 821921));

  SELECT dek_verifier_hash
  INTO v_verifier_hash
  FROM public.e2ee_accounts
  WHERE user_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'End-to-end encryption is not enabled';
  END IF;

  IF p_control_proof IS NULL
    OR p_control_proof !~ '^[a-f0-9]{64}$'
    OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_control_proof, 'UTF8')), 'hex') <> v_verifier_hash
  THEN
    RAISE EXCEPTION 'Valid vault key proof is required to disable encryption' USING ERRCODE = '42501';
  END IF;

  IF p_snapshot_token IS NULL OR p_snapshot_token <> public.e2ee_encrypted_snapshot_token(v_user) THEN
    RAISE EXCEPTION 'Encrypted vault changed on another device. Sync and retry.' USING ERRCODE = '40001';
  END IF;

  -- Deleting e2ee_accounts cascades all encrypted rows, slots, push schedules, and audit logs,
  -- and immediately lifts the plaintext write guard trigger for the re-insertion below.
  DELETE FROM public.e2ee_accounts WHERE user_id = v_user;

  IF p_subscriptions IS NOT NULL AND jsonb_typeof(p_subscriptions) = 'array' AND jsonb_array_length(p_subscriptions) > 0 THEN
    INSERT INTO public.subscriptions (
      id,
      user_id,
      name,
      category,
      amount,
      currency,
      period,
      last_payment_date,
      next_payment_date,
      billing_anchor_day,
      custom_date,
      notification_enabled,
      is_trial,
      trial_ends_on,
      status
    )
    SELECT
      COALESCE((item ->> 'id')::UUID, gen_random_uuid()),
      v_user,
      item ->> 'name',
      item ->> 'category',
      (item ->> 'amount')::NUMERIC(10, 2),
      COALESCE(item ->> 'currency', 'USD'),
      item ->> 'period',
      (item ->> 'last_payment_date')::DATE,
      (item ->> 'next_payment_date')::DATE,
      NULLIF(item ->> 'billing_anchor_day', '')::SMALLINT,
      NULLIF(item ->> 'custom_date', ''),
      COALESCE((item ->> 'notification_enabled')::BOOLEAN, TRUE),
      COALESCE((item ->> 'is_trial')::BOOLEAN, FALSE),
      NULLIF(item ->> 'trial_ends_on', '')::DATE,
      COALESCE(item ->> 'status', 'active')
    FROM jsonb_array_elements(p_subscriptions) AS item;
  END IF;

  IF p_categories IS NOT NULL AND jsonb_typeof(p_categories) = 'array' AND jsonb_array_length(p_categories) > 0 THEN
    INSERT INTO public.user_categories (
      user_id,
      category_id,
      name,
      "order",
      is_built_in,
      is_hidden
    )
    SELECT
      v_user,
      item ->> 'category_id',
      item ->> 'name',
      COALESCE((item ->> 'order')::INTEGER, 0),
      COALESCE((item ->> 'is_built_in')::BOOLEAN, FALSE),
      COALESCE((item ->> 'is_hidden')::BOOLEAN, FALSE)
    FROM jsonb_array_elements(p_categories) AS item;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.disable_e2ee_vault(TEXT, TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disable_e2ee_vault(TEXT, TEXT, JSONB, JSONB)
  TO authenticated;

COMMIT;
