-- MCP OAuth 2.1 security boundary and client scope storage.
--
-- Supabase Auth's built-in OAuth 2.1 server mints `authenticated` JWTs that carry
-- a non-empty `client_id` claim. SteadyRenew's web SPA uses direct PostgREST access
-- for interactive browser sessions (`client_id` absent), whereas external OAuth
-- clients must go exclusively through `/api/mcp` and `/api/v1/*` so rate limits,
-- read/write scopes, Bark secret isolation, and write audit logs cannot be bypassed.

-- 1. Session type helper ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_direct_user_session()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT NULLIF(
    btrim(
      COALESCE(
        auth.jwt() ->> 'client_id',
        current_setting('request.jwt.claim.client_id', true),
        ''
      )
    ),
    ''
  ) IS NULL;
$$;

COMMENT ON FUNCTION public.is_direct_user_session() IS
  'True only for first-party browser sessions whose JWT has no OAuth client_id claim.';

REVOKE ALL ON FUNCTION public.is_direct_user_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_direct_user_session() TO authenticated, service_role;

-- 2. Restrictive RLS policies on all authenticated tables ---------------------

DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.subscriptions;
CREATE POLICY block_oauth_tokens_direct_access ON public.subscriptions
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_direct_user_session())
  WITH CHECK (public.is_direct_user_session());

DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.user_profiles;
CREATE POLICY block_oauth_tokens_direct_access ON public.user_profiles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_direct_user_session())
  WITH CHECK (public.is_direct_user_session());

DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.user_categories;
CREATE POLICY block_oauth_tokens_direct_access ON public.user_categories
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_direct_user_session())
  WITH CHECK (public.is_direct_user_session());

DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.user_notification_settings;
CREATE POLICY block_oauth_tokens_direct_access ON public.user_notification_settings
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_direct_user_session())
  WITH CHECK (public.is_direct_user_session());

-- `payments` only grants SELECT to `authenticated`; keep the restrictive policy
-- scoped to SELECT so zero write-command policies exist on `payments`.
DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.payments;
CREATE POLICY block_oauth_tokens_direct_access ON public.payments
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (public.is_direct_user_session());

-- 3. Per-client read/write scope preferences ----------------------------------

CREATE TABLE IF NOT EXISTS public.oauth_client_scopes (
  user_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oauth_client_scopes_pkey PRIMARY KEY (user_id, client_id),
  CONSTRAINT oauth_client_scopes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT oauth_client_scopes_client_id_valid
    CHECK (char_length(btrim(client_id)) BETWEEN 1 AND 255),
  CONSTRAINT oauth_client_scopes_client_name_valid
    CHECK (client_name IS NULL OR char_length(btrim(client_name)) BETWEEN 1 AND 120),
  CONSTRAINT oauth_client_scopes_valid
    CHECK (
      scopes <@ ARRAY['read', 'write']::TEXT[]
      AND array_position(scopes, 'read') IS NOT NULL
      AND array_length(scopes, 1) BETWEEN 1 AND 2
    )
);

COMMENT ON TABLE public.oauth_client_scopes IS
  'User-selected SteadyRenew API scopes (read vs read+write) per authorized Supabase OAuth 2.1 client.';

CREATE INDEX IF NOT EXISTS oauth_client_scopes_user_updated_idx
  ON public.oauth_client_scopes(user_id, updated_at DESC);

DROP TRIGGER IF EXISTS oauth_client_scopes_set_updated_at ON public.oauth_client_scopes;
CREATE TRIGGER oauth_client_scopes_set_updated_at
BEFORE UPDATE ON public.oauth_client_scopes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.oauth_client_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_client_scopes_select_own ON public.oauth_client_scopes;
DROP POLICY IF EXISTS oauth_client_scopes_insert_own ON public.oauth_client_scopes;
DROP POLICY IF EXISTS oauth_client_scopes_update_own ON public.oauth_client_scopes;
DROP POLICY IF EXISTS oauth_client_scopes_delete_own ON public.oauth_client_scopes;
DROP POLICY IF EXISTS block_oauth_tokens_direct_access ON public.oauth_client_scopes;

CREATE POLICY oauth_client_scopes_select_own ON public.oauth_client_scopes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY oauth_client_scopes_insert_own ON public.oauth_client_scopes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY oauth_client_scopes_update_own ON public.oauth_client_scopes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY oauth_client_scopes_delete_own ON public.oauth_client_scopes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY block_oauth_tokens_direct_access ON public.oauth_client_scopes
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_direct_user_session())
  WITH CHECK (public.is_direct_user_session());

REVOKE ALL PRIVILEGES ON public.oauth_client_scopes FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.oauth_client_scopes TO authenticated;
GRANT INSERT (user_id, client_id, client_name, scopes) ON public.oauth_client_scopes TO authenticated;
GRANT UPDATE (client_name, scopes) ON public.oauth_client_scopes TO authenticated;
GRANT ALL ON public.oauth_client_scopes TO service_role;

-- 4. Shared failed-auth rate limit check/increment for OAuth bearer tokens ----

CREATE OR REPLACE FUNCTION public.check_or_record_api_auth_failure(
  p_identity_hash TEXT,
  p_window_start TIMESTAMPTZ,
  p_failure_limit INTEGER,
  p_record_failure BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := date_trunc('hour', p_window_start);
  v_failure_count INTEGER;
BEGIN
  IF p_identity_hash IS NULL
    OR p_failure_limit IS NULL
    OR p_failure_limit <= 0
    OR p_identity_hash !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid auth failure check payload';
  END IF;

  v_failure_count := (
    SELECT public.api_auth_failure_windows.request_count
    FROM public.api_auth_failure_windows
    WHERE public.api_auth_failure_windows.identity_hash = p_identity_hash
      AND public.api_auth_failure_windows.window_start = v_window_start
  );

  IF COALESCE(v_failure_count, 0) >= p_failure_limit THEN
    RETURN TRUE;
  END IF;

  IF NOT COALESCE(p_record_failure, FALSE) THEN
    RETURN FALSE;
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
    v_failure_count := (
      SELECT public.api_auth_failure_windows.request_count
      FROM public.api_auth_failure_windows
      WHERE public.api_auth_failure_windows.identity_hash = p_identity_hash
        AND public.api_auth_failure_windows.window_start = v_window_start
    );
  END IF;

  RETURN COALESCE(v_failure_count, p_failure_limit) >= p_failure_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.check_or_record_api_auth_failure(TEXT, TIMESTAMPTZ, INTEGER, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_or_record_api_auth_failure(TEXT, TIMESTAMPTZ, INTEGER, BOOLEAN)
  TO service_role;
