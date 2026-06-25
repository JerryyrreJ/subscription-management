BEGIN;

SELECT plan(70);

SELECT has_table('public', 'user_profiles', 'user_profiles exists');
SELECT has_table('public', 'subscriptions', 'subscriptions exists');
SELECT has_table('public', 'user_categories', 'user_categories exists');
SELECT has_table('public', 'user_notification_settings', 'notification settings exists');
SELECT has_table('public', 'notification_delivery_locks', 'delivery locks exist');
SELECT has_table('public', 'payments', 'payments exists');
SELECT has_table('public', 'api_keys', 'api_keys exists');
SELECT has_table('public', 'api_rate_limit_windows', 'api rate limit windows exist');
SELECT has_table('public', 'api_user_rate_limit_windows', 'user rate limit windows exist');
SELECT has_table('public', 'api_auth_failure_windows', 'auth failure windows exist');
SELECT has_table('public', 'api_audit_log', 'API audit log exists');
SELECT has_table('public', 'ai_usage_windows', 'AI usage windows exist');
SELECT has_table('public', 'ai_cost_windows', 'AI cost windows exist');

SELECT has_column('public', 'payments', 'stripe_price_id', 'payments stores the trusted Stripe price');
SELECT has_column('public', 'user_notification_settings', 'locale', 'notification settings store locale');
SELECT has_column('public', 'subscriptions', 'status', 'subscriptions store lifecycle status');
SELECT has_column('public', 'api_keys', 'scopes', 'API keys store permission scopes');
SELECT has_function(
  'public',
  'complete_premium_purchase',
  ARRAY['uuid', 'text', 'text', 'text', 'text', 'integer', 'text', 'text', 'jsonb']
);
SELECT has_function(
  'public',
  'consume_api_rate_limit',
  ARRAY['uuid', 'timestamp with time zone', 'integer']
);
SELECT has_function(
  'public',
  'consume_api_user_rate_limit',
  ARRAY['uuid', 'timestamp with time zone', 'integer']
);
SELECT has_function(
  'public',
  'lookup_api_key_for_auth',
  ARRAY['text', 'text', 'timestamp with time zone', 'integer']
);
SELECT has_function(
  'public',
  'create_api_key_if_under_limit',
  ARRAY['uuid', 'text', 'text', 'text', 'integer', 'text[]']
);
SELECT has_function(
  'public',
  'consume_ai_quota',
  ARRAY['uuid', 'date', 'integer']
);
SELECT has_function(
  'public',
  'add_ai_cost',
  ARRAY['date', 'bigint', 'bigint']
);
SELECT has_function(
  'public',
  'reserve_ai_budget',
  ARRAY['date', 'bigint', 'bigint', 'numeric', 'numeric', 'numeric']
);
SELECT has_function(
  'public',
  'adjust_ai_cost',
  ARRAY['date', 'bigint', 'bigint']
);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_profiles'::regclass), 'user_profiles has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscriptions'::regclass), 'subscriptions has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_categories'::regclass), 'user_categories has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_notification_settings'::regclass), 'notification settings has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.payments'::regclass), 'payments has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notification_delivery_locks'::regclass), 'delivery locks have RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_keys'::regclass), 'api_keys has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_rate_limit_windows'::regclass), 'api rate limit windows have RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_user_rate_limit_windows'::regclass), 'user rate limit windows have RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_auth_failure_windows'::regclass), 'auth failure windows have RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_audit_log'::regclass), 'API audit log has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_usage_windows'::regclass), 'AI usage windows have RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_cost_windows'::regclass), 'AI cost windows have RLS');

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
      AND NOT tgisinternal
  ),
  'new auth users receive a profile'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payments'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'payments have no client write policy'
);

SELECT is(
  has_function_privilege('authenticated', 'public.complete_premium_purchase(uuid,text,text,text,text,integer,text,text,jsonb)', 'EXECUTE'),
  FALSE,
  'authenticated users cannot execute premium completion RPC'
);

SELECT is(
  has_column_privilege('authenticated', 'public.user_profiles', 'is_premium', 'UPDATE'),
  FALSE,
  'authenticated users cannot update premium status'
);

SELECT is(
  has_table_privilege('authenticated', 'public.payments', 'INSERT'),
  FALSE,
  'authenticated users cannot insert payments'
);

SELECT is(
  has_table_privilege('authenticated', 'public.api_keys', 'SELECT'),
  FALSE,
  'authenticated users cannot read API key hashes directly'
);

SELECT is(
  has_table_privilege('authenticated', 'public.api_keys', 'INSERT'),
  FALSE,
  'authenticated users cannot insert API keys directly'
);

SELECT is(
  has_function_privilege('authenticated', 'public.consume_api_rate_limit(uuid,timestamp with time zone,integer)', 'EXECUTE'),
  FALSE,
  'authenticated users cannot execute rate limit RPC'
);

SELECT is(
  has_table_privilege('authenticated', 'public.api_user_rate_limit_windows', 'SELECT'),
  FALSE,
  'authenticated users cannot read user rate limit windows'
);

SELECT is(
  has_table_privilege('authenticated', 'public.api_auth_failure_windows', 'SELECT'),
  FALSE,
  'authenticated users cannot read auth failure windows'
);

SELECT is(
  has_function_privilege('authenticated', 'public.consume_api_user_rate_limit(uuid,timestamp with time zone,integer)', 'EXECUTE'),
  FALSE,
  'authenticated users cannot execute user rate limit RPC'
);

SELECT is(
  has_function_privilege('authenticated', 'public.lookup_api_key_for_auth(text,text,timestamp with time zone,integer)', 'EXECUTE'),
  FALSE,
  'authenticated users cannot execute API key lookup RPC'
);

SELECT is(
  has_function_privilege('authenticated', 'public.create_api_key_if_under_limit(uuid,text,text,text,integer,text[])', 'EXECUTE'),
  FALSE,
  'authenticated users cannot execute API key creation RPC'
);

SELECT is(
  has_function_privilege('authenticated', 'public.reserve_ai_budget(date,bigint,bigint,numeric,numeric,numeric)', 'EXECUTE'),
  FALSE,
  'authenticated users cannot execute AI budget reservation RPC'
);

SELECT is(
  has_function_privilege('authenticated', 'public.adjust_ai_cost(date,bigint,bigint)', 'EXECUTE'),
  FALSE,
  'authenticated users cannot execute AI cost adjustment RPC'
);

SELECT is(
  has_table_privilege('authenticated', 'public.api_audit_log', 'SELECT'),
  FALSE,
  'authenticated users cannot read API audit logs directly'
);

SELECT is(
  has_table_privilege('service_role', 'public.api_user_rate_limit_windows', 'INSERT'),
  TRUE,
  'service_role can write user rate limit windows'
);

SELECT is(
  has_table_privilege('service_role', 'public.api_auth_failure_windows', 'INSERT'),
  TRUE,
  'service_role can write auth failure windows'
);

SELECT is(
  has_table_privilege('service_role', 'public.api_audit_log', 'INSERT'),
  TRUE,
  'service_role can write API audit logs'
);

SELECT is(
  has_function_privilege('service_role', 'public.consume_api_user_rate_limit(uuid,timestamp with time zone,integer)', 'EXECUTE'),
  TRUE,
  'service_role can execute user rate limit RPC'
);

SELECT is(
  has_function_privilege('service_role', 'public.lookup_api_key_for_auth(text,text,timestamp with time zone,integer)', 'EXECUTE'),
  TRUE,
  'service_role can execute API key lookup RPC'
);

SELECT is(
  has_function_privilege('service_role', 'public.create_api_key_if_under_limit(uuid,text,text,text,integer,text[])', 'EXECUTE'),
  TRUE,
  'service_role can execute API key creation RPC'
);

SELECT is(
  has_function_privilege('service_role', 'public.reserve_ai_budget(date,bigint,bigint,numeric,numeric,numeric)', 'EXECUTE'),
  TRUE,
  'service_role can execute AI budget reservation RPC'
);

SELECT is(
  has_function_privilege('service_role', 'public.adjust_ai_cost(date,bigint,bigint)', 'EXECUTE'),
  TRUE,
  'service_role can execute AI cost adjustment RPC'
);

INSERT INTO auth.users (id, raw_user_meta_data)
VALUES
  ('10000000-0000-0000-0000-000000000001', '{"nickname":"Tenant A"}'::jsonb),
  ('20000000-0000-0000-0000-000000000002', '{"nickname":"Tenant B"}'::jsonb);

INSERT INTO public.subscriptions (
  id, user_id, name, category, amount, currency, period,
  last_payment_date, next_payment_date
)
VALUES
  (
    '10000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000001',
    'Tenant A subscription', 'Software', 10, 'USD', 'monthly',
    '2026-06-01', '2026-07-01'
  ),
  (
    '20000000-0000-0000-0000-000000000022',
    '20000000-0000-0000-0000-000000000002',
    'Tenant B subscription', 'Software', 20, 'USD', 'monthly',
    '2026-06-01', '2026-07-01'
  );

INSERT INTO public.user_categories (user_id, category_id, name)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'tenant-a', 'Tenant A category'),
  ('20000000-0000-0000-0000-000000000002', 'tenant-b', 'Tenant B category');

INSERT INTO public.user_notification_settings (user_id)
VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002');

INSERT INTO public.payments (
  user_id, stripe_session_id, stripe_price_id, amount_total,
  currency, status, product_type
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001', 'cs_tenant_a', 'price_test',
    1000, 'usd', 'completed', 'premium_lifetime'
  ),
  (
    '20000000-0000-0000-0000-000000000002', 'cs_tenant_b', 'price_test',
    2000, 'usd', 'completed', 'premium_lifetime'
  );

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', TRUE);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.user_profiles),
  1,
  'tenant can read only its own profile'
);

SELECT is(
  (SELECT count(*)::integer FROM public.subscriptions),
  1,
  'tenant can read only its own subscriptions'
);

UPDATE public.subscriptions
SET name = 'forged'
WHERE id = '20000000-0000-0000-0000-000000000022';

SELECT is(
  (SELECT count(*)::integer FROM public.user_categories),
  1,
  'tenant can read only its own categories'
);

SELECT is(
  (SELECT count(*)::integer FROM public.user_notification_settings),
  1,
  'tenant can read only its own notification settings'
);

UPDATE public.user_notification_settings
SET bark_enabled = TRUE
WHERE user_id = '20000000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT count(*)::integer FROM public.payments),
  1,
  'tenant can read only its own payments'
);

RESET ROLE;

SELECT is(
  (
    SELECT name
    FROM public.subscriptions
    WHERE id = '20000000-0000-0000-0000-000000000022'
  ),
  'Tenant B subscription',
  'tenant cannot update another tenant subscription'
);

SELECT is(
  (
    SELECT bark_enabled
    FROM public.user_notification_settings
    WHERE user_id = '20000000-0000-0000-0000-000000000002'
  ),
  FALSE,
  'tenant cannot update another tenant notification settings'
);

SELECT * FROM finish();
ROLLBACK;
