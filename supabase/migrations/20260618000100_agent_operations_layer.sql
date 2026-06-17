-- Agent operations layer.
--
-- Three additive changes that move the public API from "agent-callable" to
-- "agent-reliable":
--   1. subscriptions.status      -> lifecycle so "cancel" is a soft state change, not a hard delete.
--   2. api_keys.scopes           -> read-only vs read/write keys, enforced server-side.
--   3. api_audit_log             -> queryable record of every write performed through the API.
--
-- The two auth RPCs are recreated to carry scopes. All defaults backfill existing
-- rows to current behaviour (status 'active', scopes {read,write}), so nothing breaks.

-- 1. Subscription lifecycle ---------------------------------------------------

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'paused', 'cancelled'));

COMMENT ON COLUMN public.subscriptions.status IS
  'Lifecycle state: active (billing), paused (temporarily stopped), cancelled (no longer billing, kept for history).';

CREATE INDEX IF NOT EXISTS subscriptions_user_status_idx
  ON public.subscriptions(user_id, status);

-- 2. API key scopes -----------------------------------------------------------

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['read', 'write']::TEXT[];

ALTER TABLE public.api_keys
  DROP CONSTRAINT IF EXISTS api_keys_scopes_valid;
ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_scopes_valid
  CHECK (
    scopes <@ ARRAY['read', 'write']::TEXT[]
    AND array_position(scopes, 'read') IS NOT NULL
    AND array_length(scopes, 1) BETWEEN 1 AND 2
  );

COMMENT ON COLUMN public.api_keys.scopes IS
  'Granted scopes. read is always present; write additionally permits create/update/delete.';

-- 3. Write audit log ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.api_audit_log (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  api_key_id UUID,
  action TEXT NOT NULL,
  subscription_id UUID,
  request_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT api_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT api_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT api_audit_log_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE SET NULL,
  CONSTRAINT api_audit_log_action_valid CHECK (
    action IN ('subscription.create', 'subscription.update', 'subscription.delete')
  )
);

COMMENT ON TABLE public.api_audit_log IS
  'Append-only record of write operations performed through the public API. before/after/patch live in metadata.';

CREATE INDEX IF NOT EXISTS api_audit_log_user_created_idx
  ON public.api_audit_log(user_id, created_at DESC);

ALTER TABLE public.api_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public.api_audit_log FROM anon, authenticated;
GRANT ALL ON public.api_audit_log TO service_role;

-- 4. Recreate auth RPCs to carry scopes --------------------------------------

DROP FUNCTION IF EXISTS public.lookup_api_key_for_auth(TEXT, TEXT, TIMESTAMPTZ, INTEGER);

CREATE FUNCTION public.lookup_api_key_for_auth(
  p_key_hash TEXT,
  p_identity_hash TEXT,
  p_window_start TIMESTAMPTZ,
  p_failure_limit INTEGER
)
RETURNS TABLE (
  limited BOOLEAN,
  id UUID,
  user_id UUID,
  key_prefix TEXT,
  scopes TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := date_trunc('hour', p_window_start);
  v_failure_count INTEGER;
  v_id UUID;
  v_user_id UUID;
  v_key_prefix TEXT;
  v_scopes TEXT[];
BEGIN
  IF p_key_hash IS NULL
    OR p_identity_hash IS NULL
    OR p_failure_limit IS NULL
    OR p_failure_limit <= 0
    OR p_key_hash !~ '^[a-f0-9]{64}$'
    OR p_identity_hash !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid API key lookup payload';
  END IF;

  SELECT public.api_auth_failure_windows.request_count
  INTO v_failure_count
  FROM public.api_auth_failure_windows
  WHERE identity_hash = p_identity_hash
    AND window_start = v_window_start;

  IF COALESCE(v_failure_count, 0) >= p_failure_limit THEN
    RETURN QUERY SELECT TRUE, NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT[];
    RETURN;
  END IF;

  SELECT api_keys.id, api_keys.user_id, api_keys.key_prefix, api_keys.scopes
  INTO v_id, v_user_id, v_key_prefix, v_scopes
  FROM public.api_keys
  WHERE api_keys.key_hash = p_key_hash
    AND api_keys.revoked_at IS NULL;

  IF FOUND THEN
    RETURN QUERY SELECT FALSE, v_id, v_user_id, v_key_prefix, v_scopes;
    RETURN;
  END IF;

  INSERT INTO public.api_auth_failure_windows (
    identity_hash,
    window_start,
    request_count
  ) VALUES (
    p_identity_hash,
    v_window_start,
    1
  )
  ON CONFLICT (identity_hash, window_start) DO UPDATE
    SET request_count = public.api_auth_failure_windows.request_count + 1
    WHERE public.api_auth_failure_windows.request_count < p_failure_limit
  RETURNING public.api_auth_failure_windows.request_count INTO v_failure_count;

  IF v_failure_count IS NULL THEN
    SELECT public.api_auth_failure_windows.request_count
    INTO v_failure_count
    FROM public.api_auth_failure_windows
    WHERE identity_hash = p_identity_hash
      AND window_start = v_window_start;
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_failure_count, p_failure_limit) >= p_failure_limit,
    NULL::UUID,
    NULL::UUID,
    NULL::TEXT,
    NULL::TEXT[];
END;
$$;

DROP FUNCTION IF EXISTS public.create_api_key_if_under_limit(UUID, TEXT, TEXT, TEXT, INTEGER);

CREATE FUNCTION public.create_api_key_if_under_limit(
  p_user_id UUID,
  p_name TEXT,
  p_key_prefix TEXT,
  p_key_hash TEXT,
  p_active_key_limit INTEGER,
  p_scopes TEXT[]
)
RETURNS TABLE (
  created BOOLEAN,
  id UUID,
  name TEXT,
  key_prefix TEXT,
  scopes TEXT[],
  created_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_count INTEGER;
  v_scopes TEXT[];
  v_id UUID;
  v_name TEXT;
  v_key_prefix TEXT;
  v_created_at TIMESTAMPTZ;
  v_last_used_at TIMESTAMPTZ;
  v_revoked_at TIMESTAMPTZ;
BEGIN
  -- Normalise scopes: read is mandatory, write is optional, nothing else is allowed.
  v_scopes := CASE
    WHEN p_scopes IS NULL THEN ARRAY['read', 'write']::TEXT[]
    WHEN array_position(p_scopes, 'write') IS NOT NULL THEN ARRAY['read', 'write']::TEXT[]
    ELSE ARRAY['read']::TEXT[]
  END;

  IF p_user_id IS NULL
    OR p_name IS NULL
    OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80
    OR p_key_prefix IS NULL
    OR char_length(btrim(p_key_prefix)) NOT BETWEEN 6 AND 80
    OR p_key_hash IS NULL
    OR p_key_hash !~ '^[a-f0-9]{64}$'
    OR p_active_key_limit IS NULL
    OR p_active_key_limit <= 0
  THEN
    RAISE EXCEPTION 'Invalid API key creation payload';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT count(*)::INTEGER
  INTO v_active_count
  FROM public.api_keys AS existing_keys
  WHERE existing_keys.user_id = p_user_id
    AND existing_keys.revoked_at IS NULL;

  IF v_active_count >= p_active_key_limit THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT[], NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  INSERT INTO public.api_keys (
    user_id,
    name,
    key_prefix,
    key_hash,
    scopes
  ) VALUES (
    p_user_id,
    btrim(p_name),
    btrim(p_key_prefix),
    p_key_hash,
    v_scopes
  )
  RETURNING api_keys.id, api_keys.name, api_keys.key_prefix, api_keys.scopes, api_keys.created_at, api_keys.last_used_at, api_keys.revoked_at
  INTO v_id, v_name, v_key_prefix, v_scopes, v_created_at, v_last_used_at, v_revoked_at;

  RETURN QUERY SELECT TRUE, v_id, v_name, v_key_prefix, v_scopes, v_created_at, v_last_used_at, v_revoked_at;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_api_key_for_auth(TEXT, TEXT, TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_api_key_if_under_limit(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.lookup_api_key_for_auth(TEXT, TEXT, TIMESTAMPTZ, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_api_key_if_under_limit(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT[])
  TO service_role;
