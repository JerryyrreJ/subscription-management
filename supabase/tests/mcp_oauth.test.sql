BEGIN;

SELECT plan(19);

SELECT has_table('public', 'oauth_client_scopes', 'oauth_client_scopes exists');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.oauth_client_scopes'::regclass),
  'oauth_client_scopes has RLS enabled'
);
SELECT is(
  has_column_privilege('authenticated', 'public.oauth_client_scopes', 'last_used_at', 'UPDATE'),
  FALSE,
  'authenticated users cannot forge oauth_client_scopes.last_used_at'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.check_or_record_api_auth_failure(text,timestamp with time zone,integer,boolean)',
    'EXECUTE'
  ),
  FALSE,
  'authenticated users cannot execute auth failure limiter RPC'
);
SELECT is(
  has_function_privilege(
    'service_role',
    'public.check_or_record_api_auth_failure(text,timestamp with time zone,integer,boolean)',
    'EXECUTE'
  ),
  TRUE,
  'service_role can execute auth failure limiter RPC'
);

INSERT INTO auth.users (id, raw_user_meta_data)
VALUES
  ('70000000-0000-4000-8000-000000000001', '{"nickname":"OAuth User"}'::jsonb),
  ('70000000-0000-4000-8000-000000000002', '{"nickname":"Other User"}'::jsonb);

INSERT INTO public.subscriptions (
  id, user_id, name, category, amount, currency, period,
  last_payment_date, next_payment_date
)
VALUES (
  '70000000-0000-4000-8000-000000000011',
  '70000000-0000-4000-8000-000000000001',
  'ChatGPT Plus', 'AI', 20, 'USD', 'monthly',
  '2026-10-01', '2026-11-01'
);

INSERT INTO public.user_categories (user_id, category_id, name)
VALUES ('70000000-0000-4000-8000-000000000001', 'ai', 'AI');

INSERT INTO public.user_notification_settings (user_id, bark_device_key)
VALUES ('70000000-0000-4000-8000-000000000001', 'secret-bark-key');

INSERT INTO public.payments (
  user_id, stripe_session_id, stripe_price_id, amount_total,
  currency, status, product_type
)
VALUES (
  '70000000-0000-4000-8000-000000000001', 'cs_oauth_test', 'price_test',
  1900, 'usd', 'completed', 'premium_lifetime'
);

-- Direct first-party browser session (no `client_id` claim) works normally.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',
  TRUE
);
SELECT set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', TRUE);
SELECT set_config('request.jwt.claim.client_id', '', TRUE);
SET LOCAL ROLE authenticated;

INSERT INTO public.oauth_client_scopes (user_id, client_id, client_name, scopes)
VALUES (
  '70000000-0000-4000-8000-000000000001',
  'client_chatgpt_1',
  'ChatGPT',
  ARRAY['read', 'write']
);

SELECT is(
  (SELECT count(*)::integer FROM public.oauth_client_scopes),
  1,
  'browser session can insert and read its own oauth_client_scopes'
);

SELECT is(
  (SELECT count(*)::integer FROM public.subscriptions),
  1,
  'browser session can read its own subscriptions'
);

-- OAuth access token session (contains `client_id` claim) is blocked from ALL
-- direct PostgREST table reads and writes across every authenticated table.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","client_id":"client_chatgpt_1"}',
  TRUE
);

SELECT is(
  (SELECT count(*)::integer FROM public.subscriptions),
  0,
  'OAuth token cannot read subscriptions directly via PostgREST'
);
SELECT is(
  (SELECT count(*)::integer FROM public.user_profiles),
  0,
  'OAuth token cannot read user_profiles directly via PostgREST'
);
SELECT is(
  (SELECT count(*)::integer FROM public.user_categories),
  0,
  'OAuth token cannot read user_categories directly via PostgREST'
);
SELECT is(
  (SELECT count(*)::integer FROM public.user_notification_settings),
  0,
  'OAuth token cannot read Bark notification settings directly via PostgREST'
);
SELECT is(
  (SELECT count(*)::integer FROM public.payments),
  0,
  'OAuth token cannot read payments directly via PostgREST'
);
SELECT is(
  (SELECT count(*)::integer FROM public.oauth_client_scopes),
  0,
  'OAuth token cannot read oauth_client_scopes directly via PostgREST'
);

SELECT throws_ok(
  $$
    INSERT INTO public.subscriptions (
      user_id, name, category, amount, currency, period,
      last_payment_date, next_payment_date
    ) VALUES (
      '70000000-0000-4000-8000-000000000001',
      'Bypass attempt', 'AI', 10, 'USD', 'monthly',
      '2026-10-01', '2026-11-01'
    )
  $$,
  '42501',
  NULL,
  'OAuth token cannot insert subscriptions directly via PostgREST'
);

SELECT throws_ok(
  $$
    INSERT INTO public.oauth_client_scopes (user_id, client_id, scopes)
    VALUES ('70000000-0000-4000-8000-000000000001', 'escalated_client', ARRAY['read', 'write'])
  $$,
  '42501',
  NULL,
  'OAuth token cannot escalate its own scopes via PostgREST'
);

DELETE FROM public.subscriptions
WHERE id = '70000000-0000-4000-8000-000000000011';

UPDATE public.user_notification_settings
SET bark_device_key = 'tampered'
WHERE user_id = '70000000-0000-4000-8000-000000000001';

RESET ROLE;

SELECT is(
  (SELECT count(*)::integer FROM public.subscriptions WHERE id = '70000000-0000-4000-8000-000000000011'),
  1,
  'OAuth token direct DELETE on subscriptions is a no-op'
);

SELECT is(
  (SELECT bark_device_key FROM public.user_notification_settings WHERE user_id = '70000000-0000-4000-8000-000000000001'),
  'secret-bark-key',
  'OAuth token direct UPDATE on Bark settings is a no-op'
);

SELECT is(
  public.check_or_record_api_auth_failure(
    repeat('a', 64),
    '2026-11-24T01:15:00Z'::timestamptz,
    2,
    TRUE
  ),
  FALSE,
  'first auth failure is below limit'
);

SELECT is(
  public.check_or_record_api_auth_failure(
    repeat('a', 64),
    '2026-11-24T01:30:00Z'::timestamptz,
    2,
    TRUE
  ),
  TRUE,
  'reaching failure limit triggers rate limiting'
);

SELECT * FROM finish();
ROLLBACK;
