-- Server-owned checkout reservations and current payment state. Apply before deploying functions.
CREATE TABLE public.premium_checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  params jsonb NOT NULL,
  stripe_session_id text UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX premium_checkout_one_active_per_user
  ON public.premium_checkout_attempts(user_id) WHERE active;
ALTER TABLE public.premium_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.premium_checkout_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.premium_checkout_attempts TO service_role;

CREATE SEQUENCE public.premium_payment_observation_seq;
REVOKE ALL ON SEQUENCE public.premium_payment_observation_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE public.premium_payment_observation_seq TO service_role;
CREATE TABLE public.premium_payment_states (
  payment_intent_id text PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('active', 'refunded', 'disputed', 'lost')),
  version bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.premium_payment_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.premium_payment_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.premium_payment_states TO service_role;
CREATE INDEX IF NOT EXISTS payments_payment_intent_idx ON public.payments(stripe_payment_intent_id);

CREATE FUNCTION public.begin_premium_payment_sync() RETURNS bigint
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT nextval('public.premium_payment_observation_seq');
$$;

-- Callers serialize on the user's advisory lock before recomputing entitlements.
CREATE FUNCTION public.refresh_premium_entitlement(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE valid_session text;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  SELECT p.stripe_session_id INTO valid_session
  FROM public.payments p
  LEFT JOIN public.premium_payment_states s ON s.payment_intent_id = p.stripe_payment_intent_id
  WHERE p.user_id = p_user_id AND p.product_type = 'premium_lifetime'
    AND p.status = 'completed' AND coalesce(s.state, 'active') = 'active'
  ORDER BY p.created_at, p.id LIMIT 1;
  UPDATE public.user_profiles SET
    is_premium = valid_session IS NOT NULL,
    premium_payment_id = valid_session,
    premium_activated_at = CASE WHEN valid_session IS NOT NULL
      THEN coalesce(premium_activated_at, now()) ELSE NULL END
  WHERE user_id = p_user_id;
END;
$$;

CREATE FUNCTION public.sync_premium_payment_state(
  p_payment_intent_id text, p_state text, p_version bigint
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE owner_id uuid; current_state text;
BEGIN
  IF nullif(p_payment_intent_id, '') IS NULL OR p_version IS NULL OR p_version <= 0
    OR p_state NOT IN ('active', 'refunded', 'disputed', 'lost') OR p_state IS NULL THEN
    RAISE EXCEPTION 'Invalid payment state';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('premium-intent:' || p_payment_intent_id, 0));
  INSERT INTO public.premium_payment_states(payment_intent_id, state, version)
  VALUES (p_payment_intent_id, p_state, p_version)
  ON CONFLICT (payment_intent_id) DO UPDATE SET
    state = EXCLUDED.state, version = EXCLUDED.version, updated_at = now()
  WHERE public.premium_payment_states.version < EXCLUDED.version;
  SELECT state INTO current_state FROM public.premium_payment_states WHERE payment_intent_id = p_payment_intent_id;
  FOR owner_id IN SELECT DISTINCT user_id FROM public.payments
    WHERE stripe_payment_intent_id = p_payment_intent_id AND user_id IS NOT NULL ORDER BY user_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('premium-user:' || owner_id::text, 0));
    UPDATE public.payments SET status = CASE WHEN current_state = 'refunded' THEN 'refunded' ELSE 'completed' END
    WHERE stripe_payment_intent_id = p_payment_intent_id AND user_id = owner_id AND product_type = 'premium_lifetime';
    PERFORM public.refresh_premium_entitlement(owner_id);
  END LOOP;
  -- Deleted accounts retain an accurate ledger without recreating a profile.
  UPDATE public.payments SET status = CASE WHEN current_state = 'refunded' THEN 'refunded' ELSE 'completed' END
  WHERE stripe_payment_intent_id = p_payment_intent_id AND user_id IS NULL AND product_type = 'premium_lifetime';
  RETURN current_state;
END;
$$;

-- Retain the existing server-only definer: fulfillment must check auth.users
-- without granting service_role access to the Auth schema. EXECUTE remains revoked for clients.
CREATE OR REPLACE FUNCTION public.complete_premium_purchase(
  purchase_user_id uuid, purchase_stripe_session_id text, purchase_payment_intent_id text,
  purchase_customer_id text, purchase_price_id text, purchase_amount_total integer,
  purchase_currency text, purchase_customer_email text, purchase_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE persisted public.payments%ROWTYPE; current_state text;
BEGIN
  IF purchase_user_id IS NULL OR nullif(btrim(purchase_stripe_session_id), '') IS NULL
    OR nullif(btrim(purchase_price_id), '') IS NULL OR purchase_amount_total IS NULL
    OR purchase_amount_total < 0 OR nullif(btrim(purchase_currency), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid premium purchase payload';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('premium-intent:' || coalesce(purchase_payment_intent_id, purchase_stripe_session_id), 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('premium-user:' || purchase_user_id::text, 0));
  SELECT * INTO persisted FROM public.payments WHERE stripe_session_id = purchase_stripe_session_id;
  IF FOUND AND persisted.user_id IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = purchase_user_id) THEN RETURN false; END IF;
  SELECT state INTO current_state FROM public.premium_payment_states WHERE payment_intent_id = purchase_payment_intent_id;
  INSERT INTO public.payments(user_id, stripe_session_id, stripe_payment_intent_id, stripe_customer_id,
    stripe_price_id, amount_total, currency, status, product_type, customer_email, metadata)
  VALUES (purchase_user_id, purchase_stripe_session_id, purchase_payment_intent_id, purchase_customer_id,
    purchase_price_id, purchase_amount_total, lower(purchase_currency),
    CASE WHEN current_state = 'refunded' THEN 'refunded' ELSE 'completed' END,
    'premium_lifetime', purchase_customer_email, coalesce(purchase_metadata, '{}'::jsonb))
  ON CONFLICT (stripe_session_id) DO NOTHING;
  SELECT * INTO persisted FROM public.payments WHERE stripe_session_id = purchase_stripe_session_id FOR UPDATE;
  IF persisted.user_id IS DISTINCT FROM purchase_user_id OR persisted.product_type <> 'premium_lifetime'
    OR persisted.amount_total <> purchase_amount_total OR lower(persisted.currency) <> lower(purchase_currency)
    OR (persisted.stripe_price_id IS NOT NULL AND persisted.stripe_price_id <> purchase_price_id)
    OR persisted.stripe_payment_intent_id IS DISTINCT FROM purchase_payment_intent_id THEN
    RAISE EXCEPTION 'Stripe session is already associated with a different purchase';
  END IF;
  -- Never turn an already-refunded ledger row into a completed purchase on replay.
  UPDATE public.payments SET stripe_price_id = coalesce(stripe_price_id, purchase_price_id)
  WHERE id = persisted.id;
  INSERT INTO public.user_profiles(user_id, nickname) VALUES (purchase_user_id, 'User')
  ON CONFLICT (user_id) DO NOTHING;
  PERFORM public.refresh_premium_entitlement(purchase_user_id);
  RETURN true;
END;
$$;

CREATE FUNCTION public.acquire_premium_checkout(p_user_id uuid, p_params jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE attempt public.premium_checkout_attempts%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('premium-user:' || p_user_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = p_user_id AND is_premium) THEN
    RETURN jsonb_build_object('already_premium', true);
  END IF;
  SELECT * INTO attempt FROM public.premium_checkout_attempts WHERE user_id = p_user_id AND active;
  IF NOT FOUND THEN
    INSERT INTO public.premium_checkout_attempts(user_id, params) VALUES (p_user_id, p_params) RETURNING * INTO attempt;
  END IF;
  RETURN to_jsonb(attempt);
END;
$$;

CREATE FUNCTION public.attach_premium_checkout(p_attempt_id uuid, p_session_id text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.premium_checkout_attempts SET stripe_session_id = p_session_id
  WHERE id = p_attempt_id AND active AND (stripe_session_id IS NULL OR stripe_session_id = p_session_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout reservation changed'; END IF;
END;
$$;

-- Only called after Stripe confirms the old session cannot accept another payment.
CREATE FUNCTION public.finish_premium_checkout(p_attempt_id uuid, p_session_id text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.premium_checkout_attempts SET active = false
  WHERE id = p_attempt_id AND stripe_session_id = p_session_id;
$$;

REVOKE ALL ON FUNCTION public.begin_premium_payment_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_premium_entitlement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_premium_payment_state(text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_premium_purchase(uuid,text,text,text,text,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acquire_premium_checkout(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_premium_checkout(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_premium_checkout(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_premium_payment_sync(), public.refresh_premium_entitlement(uuid),
  public.sync_premium_payment_state(text,text,bigint), public.complete_premium_purchase(uuid,text,text,text,text,integer,text,text,jsonb),
  public.acquire_premium_checkout(uuid,jsonb), public.attach_premium_checkout(uuid,text),
  public.finish_premium_checkout(uuid,text) TO service_role;
