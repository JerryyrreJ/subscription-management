CREATE TABLE public.api_user_rate_limit_windows (
  user_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT api_user_rate_limit_windows_pkey PRIMARY KEY (user_id, window_start),
  CONSTRAINT api_user_rate_limit_windows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT api_user_rate_limit_windows_count_nonnegative CHECK (request_count >= 0)
);

CREATE TABLE public.api_auth_failure_windows (
  identity_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT api_auth_failure_windows_pkey PRIMARY KEY (identity_hash, window_start),
  CONSTRAINT api_auth_failure_windows_identity_hash_valid CHECK (identity_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT api_auth_failure_windows_count_nonnegative CHECK (request_count >= 0)
);

COMMENT ON TABLE public.api_user_rate_limit_windows IS 'Fixed-window public API request counters keyed by user.';
COMMENT ON TABLE public.api_auth_failure_windows IS 'Fixed-window failed API key authentication counters keyed by hashed client identity.';

CREATE INDEX api_user_rate_limit_windows_window_start_idx ON public.api_user_rate_limit_windows(window_start);
CREATE INDEX api_auth_failure_windows_window_start_idx ON public.api_auth_failure_windows(window_start);

CREATE TRIGGER api_user_rate_limit_windows_set_updated_at
BEFORE UPDATE ON public.api_user_rate_limit_windows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER api_auth_failure_windows_set_updated_at
BEFORE UPDATE ON public.api_auth_failure_windows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.api_user_rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_auth_failure_windows ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public.api_user_rate_limit_windows FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.api_auth_failure_windows FROM anon, authenticated;
GRANT ALL ON public.api_user_rate_limit_windows TO service_role;
GRANT ALL ON public.api_auth_failure_windows TO service_role;

CREATE OR REPLACE FUNCTION public.consume_api_user_rate_limit(
  p_user_id UUID,
  p_window_start TIMESTAMPTZ,
  p_limit INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  request_count INTEGER,
  remaining INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := date_trunc('hour', p_window_start);
  v_count INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'Invalid user rate limit payload';
  END IF;

  INSERT INTO public.api_user_rate_limit_windows (
    user_id,
    window_start,
    request_count
  ) VALUES (
    p_user_id,
    v_window_start,
    1
  )
  ON CONFLICT (user_id, window_start) DO UPDATE
    SET request_count = public.api_user_rate_limit_windows.request_count + 1
    WHERE public.api_user_rate_limit_windows.request_count < p_limit
  RETURNING public.api_user_rate_limit_windows.request_count INTO v_count;

  IF v_count IS NULL THEN
    SELECT public.api_user_rate_limit_windows.request_count
    INTO v_count
    FROM public.api_user_rate_limit_windows
    WHERE user_id = p_user_id
      AND window_start = v_window_start;

    RETURN QUERY SELECT
      FALSE,
      COALESCE(v_count, p_limit),
      0,
      v_window_start + INTERVAL '1 hour';
    RETURN;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    v_count,
    GREATEST(p_limit - v_count, 0),
    v_window_start + INTERVAL '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_api_key_for_auth(
  p_key_hash TEXT,
  p_identity_hash TEXT,
  p_window_start TIMESTAMPTZ,
  p_failure_limit INTEGER
)
RETURNS TABLE (
  limited BOOLEAN,
  id UUID,
  user_id UUID,
  key_prefix TEXT
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
    RETURN QUERY SELECT TRUE, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  SELECT api_keys.id, api_keys.user_id, api_keys.key_prefix
  INTO v_id, v_user_id, v_key_prefix
  FROM public.api_keys
  WHERE api_keys.key_hash = p_key_hash
    AND api_keys.revoked_at IS NULL;

  IF FOUND THEN
    RETURN QUERY SELECT FALSE, v_id, v_user_id, v_key_prefix;
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
    NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_api_key_if_under_limit(
  p_user_id UUID,
  p_name TEXT,
  p_key_prefix TEXT,
  p_key_hash TEXT,
  p_active_key_limit INTEGER
)
RETURNS TABLE (
  created BOOLEAN,
  id UUID,
  name TEXT,
  key_prefix TEXT,
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
  v_id UUID;
  v_name TEXT;
  v_key_prefix TEXT;
  v_created_at TIMESTAMPTZ;
  v_last_used_at TIMESTAMPTZ;
  v_revoked_at TIMESTAMPTZ;
BEGIN
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
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  INSERT INTO public.api_keys (
    user_id,
    name,
    key_prefix,
    key_hash
  ) VALUES (
    p_user_id,
    btrim(p_name),
    btrim(p_key_prefix),
    p_key_hash
  )
  RETURNING api_keys.id, api_keys.name, api_keys.key_prefix, api_keys.created_at, api_keys.last_used_at, api_keys.revoked_at
  INTO v_id, v_name, v_key_prefix, v_created_at, v_last_used_at, v_revoked_at;

  RETURN QUERY SELECT TRUE, v_id, v_name, v_key_prefix, v_created_at, v_last_used_at, v_revoked_at;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_user_rate_limit(UUID, TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lookup_api_key_for_auth(TEXT, TEXT, TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_api_key_if_under_limit(UUID, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_api_user_rate_limit(UUID, TIMESTAMPTZ, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.lookup_api_key_for_auth(TEXT, TEXT, TIMESTAMPTZ, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_api_key_if_under_limit(UUID, TEXT, TEXT, TEXT, INTEGER)
  TO service_role;
