BEGIN;
SELECT plan(1);
-- Assertions run against the real migration/RPCs. No Stripe calls or real users.
DO $$
DECLARE
  u uuid := '79999999-1111-4111-8111-111111111111';
  a jsonb; b jsonb; v1 bigint; v2 bigint;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (u, 'payment-lifecycle@example.test');
  INSERT INTO public.user_profiles(user_id, nickname) VALUES (u, 'Fixture') ON CONFLICT (user_id) DO NOTHING;
  a := public.acquire_premium_checkout(u, '{"mode":"payment","customer_email":"first@example.test"}');
  b := public.acquire_premium_checkout(u, '{"mode":"payment","customer_email":"changed@example.test"}');
  ASSERT a->>'id' = b->>'id', 'reuse active attempt';
  ASSERT b->'params'->>'customer_email' = 'first@example.test', 'freeze Stripe parameters across retries';
  PERFORM public.attach_premium_checkout((a->>'id')::uuid, 'cs_lifecycle');
  BEGIN
    INSERT INTO public.premium_checkout_attempts(user_id, params) VALUES (u, '{}');
    RAISE EXCEPTION 'duplicate active attempt accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  PERFORM public.finish_premium_checkout((a->>'id')::uuid, 'wrong_session');
  ASSERT (SELECT active FROM public.premium_checkout_attempts WHERE id = (a->>'id')::uuid), 'wrong session cannot release order';
  PERFORM public.finish_premium_checkout((a->>'id')::uuid, 'cs_lifecycle');
  b := public.acquire_premium_checkout(u, '{}');
  ASSERT a->>'id' <> b->>'id', 'terminal session permits a fresh attempt';

  -- Refund can arrive before completed Checkout; replay must never grant access.
  PERFORM public.sync_premium_payment_state('pi_lifecycle', 'refunded', public.begin_premium_payment_sync());
  PERFORM public.complete_premium_purchase(u, 'cs_lifecycle', 'pi_lifecycle', NULL, 'price_test', 900, 'usd', 'buyer@example.test', '{}');
  ASSERT NOT (SELECT is_premium FROM public.user_profiles WHERE user_id = u), 'refund before fulfillment';
  ASSERT (SELECT status = 'refunded' FROM public.payments WHERE stripe_session_id = 'cs_lifecycle'), 'refunded ledger';
  PERFORM public.complete_premium_purchase(u, 'cs_lifecycle', 'pi_lifecycle', NULL, 'price_test', 900, 'usd', 'buyer@example.test', '{}');
  ASSERT NOT (SELECT is_premium FROM public.user_profiles WHERE user_id = u), 'replay cannot regrant refunded purchase';
  ASSERT (SELECT count(*) = 1 FROM public.payments WHERE stripe_session_id = 'cs_lifecycle'), 'idempotent fulfillment';

  -- Another valid purchase keeps access when the first one is reversed.
  PERFORM public.complete_premium_purchase(u, 'cs_second', 'pi_second', NULL, 'price_test', 900, 'usd', 'buyer@example.test', '{}');
  ASSERT (SELECT is_premium FROM public.user_profiles WHERE user_id = u), 'second valid purchase grants';
  a := public.acquire_premium_checkout(u, '{}');
  ASSERT (a->>'already_premium')::boolean, 'database also prevents repurchasing Premium';
  PERFORM public.sync_premium_payment_state('pi_lifecycle', 'refunded', public.begin_premium_payment_sync());
  ASSERT (SELECT is_premium FROM public.user_profiles WHERE user_id = u), 'other valid purchase survives refund';
  PERFORM public.sync_premium_payment_state('pi_second', 'disputed', public.begin_premium_payment_sync());
  ASSERT NOT (SELECT is_premium FROM public.user_profiles WHERE user_id = u), 'formal dispute suspends';
  v1 := public.begin_premium_payment_sync(); v2 := public.begin_premium_payment_sync();
  PERFORM public.sync_premium_payment_state('pi_second', 'active', v2);
  PERFORM public.sync_premium_payment_state('pi_second', 'disputed', v1);
  ASSERT (SELECT is_premium FROM public.user_profiles WHERE user_id = u), 'old snapshot cannot undo dispute win';
  PERFORM public.sync_premium_payment_state('pi_second', 'lost', public.begin_premium_payment_sync());
  ASSERT NOT (SELECT is_premium FROM public.user_profiles WHERE user_id = u), 'lost dispute revokes';

  ASSERT NOT has_table_privilege('authenticated', 'public.premium_checkout_attempts', 'SELECT'), 'orders are server only';
  ASSERT NOT has_table_privilege('anon', 'public.premium_payment_states', 'INSERT'), 'state is server only';
  ASSERT NOT has_function_privilege('authenticated', 'public.sync_premium_payment_state(text,text,bigint)', 'EXECUTE'), 'no client grants';
  ASSERT NOT has_function_privilege('authenticated', 'public.acquire_premium_checkout(uuid,jsonb)', 'EXECUTE'), 'no client reservations';
  ASSERT NOT has_function_privilege('anon', 'public.complete_premium_purchase(uuid,text,text,text,text,integer,text,text,jsonb)', 'EXECUTE'), 'no anonymous grants';
  ASSERT has_function_privilege('service_role', 'public.sync_premium_payment_state(text,text,bigint)', 'EXECUTE'), 'server can reconcile';
  ASSERT (SELECT bool_and(NOT prosecdef) FROM pg_proc WHERE proname IN ('sync_premium_payment_state', 'acquire_premium_checkout')), 'RPCs do not need definer privileges';
  DELETE FROM auth.users WHERE id = u;
  PERFORM public.sync_premium_payment_state('pi_second', 'refunded', public.begin_premium_payment_sync());
  PERFORM public.complete_premium_purchase(u, 'cs_second', 'pi_second', NULL, 'price_test', 900, 'usd', 'buyer@example.test', '{}');
  ASSERT NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = u), 'late webhook must not recreate deleted account';
  ASSERT (SELECT status = 'refunded' FROM public.payments WHERE stripe_session_id = 'cs_second'), 'deleted account ledger still reconciles';
END;
$$;
SELECT pass('Payment reservations, lifecycle, event ordering and permissions');
SELECT * FROM finish();
ROLLBACK;
