CREATE TABLE public.api_keys (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash),
  CONSTRAINT api_keys_name_valid CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT api_keys_hash_valid CHECK (key_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE public.api_rate_limit_windows (
  api_key_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT api_rate_limit_windows_pkey PRIMARY KEY (api_key_id, window_start),
  CONSTRAINT api_rate_limit_windows_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE,
  CONSTRAINT api_rate_limit_windows_count_nonnegative CHECK (request_count >= 0)
);

COMMENT ON TABLE public.api_keys IS 'Public API keys. Full keys are shown once and only SHA-256 hashes are stored.';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'Short non-secret prefix used for display and support.';
COMMENT ON TABLE public.api_rate_limit_windows IS 'Fixed-window API request counters keyed by API key.';

CREATE INDEX api_keys_user_id_idx ON public.api_keys(user_id);
CREATE INDEX api_keys_active_user_id_idx ON public.api_keys(user_id) WHERE revoked_at IS NULL;
CREATE INDEX api_rate_limit_windows_window_start_idx ON public.api_rate_limit_windows(window_start);

CREATE TRIGGER api_rate_limit_windows_set_updated_at
BEFORE UPDATE ON public.api_rate_limit_windows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limit_windows ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public.api_keys FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.api_rate_limit_windows FROM anon, authenticated;
GRANT ALL ON public.api_keys TO service_role;
GRANT ALL ON public.api_rate_limit_windows TO service_role;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_api_key_id UUID,
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
  IF p_api_key_id IS NULL OR p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'Invalid rate limit payload';
  END IF;

  INSERT INTO public.api_rate_limit_windows (
    api_key_id,
    window_start,
    request_count
  ) VALUES (
    p_api_key_id,
    v_window_start,
    1
  )
  ON CONFLICT (api_key_id, window_start) DO UPDATE
    SET request_count = public.api_rate_limit_windows.request_count + 1
    WHERE public.api_rate_limit_windows.request_count < p_limit
  RETURNING public.api_rate_limit_windows.request_count INTO v_count;

  IF v_count IS NULL THEN
    SELECT public.api_rate_limit_windows.request_count
    INTO v_count
    FROM public.api_rate_limit_windows
    WHERE api_key_id = p_api_key_id
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

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(UUID, TIMESTAMPTZ, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(UUID, TIMESTAMPTZ, INTEGER)
  TO service_role;
