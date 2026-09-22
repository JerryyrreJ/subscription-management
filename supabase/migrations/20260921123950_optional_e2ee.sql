-- Optional account-wide E2EE. No key material is accepted by any RPC.
BEGIN;
CREATE TABLE public.encrypted_vaults (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  envelope jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vault_envelope_valid CHECK (
    jsonb_typeof(envelope) = 'object' AND envelope->'version' = '1'::jsonb
    AND jsonb_typeof(envelope->'nonce') = 'string'
    AND (envelope->>'nonce') ~ '^[A-Za-z0-9+/]{16}$'
    AND jsonb_typeof(envelope->'ciphertext') = 'string'
    AND (envelope->>'ciphertext') ~ '^[A-Za-z0-9+/]+={0,2}$'
    AND length(envelope->>'ciphertext') BETWEEN 24 AND 5592408
    AND envelope - ARRAY['version','nonce','ciphertext'] = '{}'::jsonb
    AND envelope ?& ARRAY['version','nonce','ciphertext']
  )
);
ALTER TABLE public.encrypted_vaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.encrypted_vaults FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.encrypted_vaults TO authenticated;
GRANT SELECT (user_id) ON public.encrypted_vaults TO service_role;
CREATE POLICY vault_select_own ON public.encrypted_vaults FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE TABLE public.e2ee_account_fences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  epoch bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.e2ee_account_fences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.e2ee_account_fences FROM PUBLIC, anon, authenticated, service_role;

-- The helper is private by privilege, never a caller-supplied user lookup API.
CREATE FUNCTION public.e2ee_plaintext_snapshot(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'subscriptions', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.subscriptions s WHERE s.user_id = p_user_id), '[]'::jsonb),
    'categories', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.user_categories c WHERE c.user_id = p_user_id), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.e2ee_plaintext_snapshot(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.prepare_encrypted_vault() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_snapshot jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.encrypted_vaults WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'Encryption already enabled';
  END IF;
  v_snapshot := public.e2ee_plaintext_snapshot(v_user);
  -- Only a concurrency token, not a password hash or an authenticity proof.
  RETURN jsonb_build_object('snapshot', v_snapshot, 'token', md5(v_snapshot::text));
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_encrypted_vault() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_encrypted_vault() TO authenticated;

-- Serialization against old clients, service-role API writers and background jobs.
-- SECURITY DEFINER is necessary to inspect vault state even for service roles
-- that cannot read the ciphertext. No exposed parameterized user lookup.
CREATE FUNCTION public.reject_plaintext_for_encrypted_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing record owner is not supported' USING ERRCODE = '42501';
  END IF;
  v_user := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 821921));
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
    INSERT INTO public.e2ee_account_fences(user_id) VALUES(v_user)
      ON CONFLICT (user_id) DO UPDATE SET epoch = public.e2ee_account_fences.epoch + 1;
  END IF;
  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM public.encrypted_vaults WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'E2EE enabled: upgrade and unlock your client; plaintext writes are disabled' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_plaintext_for_encrypted_account() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER e2ee_guard_subscriptions BEFORE INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_for_encrypted_account();
CREATE TRIGGER e2ee_guard_categories BEFORE INSERT OR UPDATE OR DELETE ON public.user_categories
  FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_for_encrypted_account();
CREATE TRIGGER e2ee_guard_notifications BEFORE INSERT OR UPDATE OR DELETE ON public.user_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_for_encrypted_account();
CREATE TRIGGER e2ee_guard_api_keys BEFORE INSERT OR UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_for_encrypted_account();
CREATE TRIGGER e2ee_guard_audit BEFORE INSERT OR UPDATE OR DELETE ON public.api_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.reject_plaintext_for_encrypted_account();

CREATE FUNCTION public.enable_encrypted_vault(p_snapshot_token text, p_envelope jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 821921));
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
    INSERT INTO public.e2ee_account_fences(user_id) VALUES(v_user)
      ON CONFLICT (user_id) DO UPDATE SET epoch = public.e2ee_account_fences.epoch + 1;
  END IF;
  IF EXISTS (SELECT 1 FROM public.encrypted_vaults WHERE user_id = v_user) THEN RAISE EXCEPTION 'Encryption already enabled'; END IF;
  IF p_snapshot_token IS NULL OR p_snapshot_token <> md5(public.e2ee_plaintext_snapshot(v_user)::text) THEN
    RAISE EXCEPTION 'Data changed on another device. Sync and retry.' USING ERRCODE = '40001';
  END IF;
  -- A single transaction: failed validation/insert rolls back all cleanup.
  DELETE FROM public.api_audit_log WHERE user_id = v_user;
  DELETE FROM public.subscriptions WHERE user_id = v_user;
  DELETE FROM public.user_categories WHERE user_id = v_user;
  DELETE FROM public.user_notification_settings WHERE user_id = v_user;
  UPDATE public.api_keys SET revoked_at = coalesce(revoked_at, now()) WHERE user_id = v_user;
  INSERT INTO public.encrypted_vaults(user_id, envelope) VALUES (v_user, p_envelope);
END;
$$;
REVOKE ALL ON FUNCTION public.enable_encrypted_vault(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enable_encrypted_vault(text,jsonb) TO authenticated;

CREATE FUNCTION public.save_encrypted_vault(p_expected_revision bigint, p_envelope jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid(); v_revision bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  UPDATE public.encrypted_vaults SET envelope = p_envelope, revision = revision + 1, updated_at = now()
    WHERE user_id = v_user AND revision = p_expected_revision RETURNING revision INTO v_revision;
  IF v_revision IS NULL THEN RAISE EXCEPTION 'Vault changed. Sync before saving again.' USING ERRCODE = '40001'; END IF;
  RETURN v_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.save_encrypted_vault(bigint,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_encrypted_vault(bigint,jsonb) TO authenticated;
COMMIT;
