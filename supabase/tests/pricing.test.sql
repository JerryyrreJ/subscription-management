BEGIN;
SELECT plan(10);
INSERT INTO auth.users(id, raw_user_meta_data)
VALUES ('90000000-0000-4000-8000-000000000009', '{"nickname":"Pricing test"}'::jsonb);

SELECT is(has_function_privilege('authenticated', 'public.consume_api_user_minute_limit(uuid,timestamptz,integer)', 'EXECUTE'), false, 'clients cannot bypass API limiter');
SELECT is(has_function_privilege('authenticated', 'public.release_ai_quota(uuid,date)', 'EXECUTE'), false, 'clients cannot refund quota');
SELECT is(has_function_privilege('service_role', 'public.release_ai_quota(uuid,date)', 'EXECUTE'), true, 'server can refund quota');

SELECT is((SELECT allowed FROM public.consume_api_user_minute_limit('90000000-0000-4000-8000-000000000009', '2026-09-22 12:34:42+00', 1)), true, 'first request allowed');
SELECT is((SELECT allowed FROM public.consume_api_user_minute_limit('90000000-0000-4000-8000-000000000009', '2026-09-22 12:34:59+00', 1)), false, 'same-minute request blocked');
SELECT is((SELECT reset_at FROM public.consume_api_user_minute_limit('90000000-0000-4000-8000-000000000009', '2026-09-22 12:34:59+00', 1)), '2026-09-22 12:35:00+00'::timestamptz, 'resets on next minute');
SELECT is((SELECT allowed FROM public.consume_api_user_minute_limit('90000000-0000-4000-8000-000000000009', '2026-09-22 12:35:00+00', 1)), true, 'next minute is independent');

SELECT is((SELECT allowed FROM public.consume_ai_quota('90000000-0000-4000-8000-000000000009', '2026-09-01', 1)), true, 'AI slot reserved');
SELECT is((SELECT allowed FROM public.consume_ai_quota('90000000-0000-4000-8000-000000000009', '2026-09-01', 1)), false, 'second AI slot denied');
SELECT public.release_ai_quota('90000000-0000-4000-8000-000000000009', '2026-09-01');
SELECT is((SELECT allowed FROM public.consume_ai_quota('90000000-0000-4000-8000-000000000009', '2026-09-01', 1)), true, 'failed parse refund makes slot usable again');
SELECT * FROM finish();
ROLLBACK;
