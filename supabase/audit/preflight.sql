-- Run against the target database before the hardening migration.
-- Any returned row must be resolved manually before migration.
-- This query intentionally references only columns present in the production baseline.

SELECT 'duplicate_user_profile' AS issue, user_id::text AS record, count(*)::text AS details
FROM public.user_profiles
GROUP BY user_id
HAVING count(*) > 1

UNION ALL

SELECT 'duplicate_user_category', user_id::text || ':' || category_id, count(*)::text
FROM public.user_categories
GROUP BY user_id, category_id
HAVING count(*) > 1

UNION ALL

SELECT 'duplicate_notification_settings', user_id::text, count(*)::text
FROM public.user_notification_settings
GROUP BY user_id
HAVING count(*) > 1

UNION ALL

SELECT 'duplicate_stripe_session', stripe_session_id, count(*)::text
FROM public.payments
GROUP BY stripe_session_id
HAVING count(*) > 1

UNION ALL

SELECT 'duplicate_delivery_lock', user_id::text || ':' || subscription_id::text, count(*)::text
FROM public.notification_delivery_locks
GROUP BY user_id, subscription_id, channel, delivery_date
HAVING count(*) > 1

UNION ALL

SELECT 'invalid_user_profile', id::text, concat_ws(', ', user_id::text, nickname)
FROM public.user_profiles
WHERE user_id IS NULL
  OR char_length(btrim(nickname)) NOT BETWEEN 2 AND 30
  OR is_premium IS NULL
  OR created_at IS NULL
  OR updated_at IS NULL

UNION ALL

SELECT 'invalid_subscription_amount', id::text, amount::text
FROM public.subscriptions
WHERE amount IS NULL
  OR amount < 0
  OR amount > 999999.99
  OR amount <> round(amount, 2)

UNION ALL

SELECT 'invalid_subscription_text', id::text, concat_ws(', ', name, category)
FROM public.subscriptions
WHERE char_length(btrim(name)) NOT BETWEEN 1 AND 120
  OR char_length(btrim(category)) NOT BETWEEN 1 AND 80

UNION ALL

SELECT 'invalid_subscription_owner_or_timestamps', id::text, user_id::text
FROM public.subscriptions
WHERE user_id IS NULL
  OR notification_enabled IS NULL
  OR created_at IS NULL
  OR updated_at IS NULL

UNION ALL

SELECT 'invalid_subscription_period', id::text, period
FROM public.subscriptions
WHERE period NOT IN ('monthly', 'yearly', 'custom')

UNION ALL

SELECT 'invalid_subscription_currency', id::text, currency
FROM public.subscriptions
WHERE currency NOT IN ('CNY', 'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD')

UNION ALL

SELECT 'invalid_subscription_dates', id::text, last_payment_date::text || ' -> ' || next_payment_date::text
FROM public.subscriptions
WHERE last_payment_date IS NULL OR next_payment_date IS NULL

UNION ALL

SELECT 'invalid_subscription_custom_period', id::text, concat_ws(':', period, custom_date)
FROM public.subscriptions
WHERE (period <> 'custom' AND custom_date IS NOT NULL)
  OR (period = 'custom' AND (custom_date IS NULL OR custom_date !~ '^[1-9][0-9]*$'))

UNION ALL

SELECT 'invalid_category_timestamps', id::text, user_id::text
FROM public.user_categories
WHERE created_at IS NULL OR updated_at IS NULL

UNION ALL

SELECT 'invalid_notification_settings', id::text, bark_days_before::text
FROM public.user_notification_settings
WHERE bark_enabled IS NULL
  OR bark_server_url IS NULL
  OR bark_device_key IS NULL
  OR bark_days_before IS NULL
  OR bark_days_before NOT IN (1, 3, 7, 14)
  OR bark_history IS NULL
  OR jsonb_typeof(bark_history) <> 'object'
  OR created_at IS NULL
  OR updated_at IS NULL

UNION ALL

SELECT 'invalid_payment', id::text, concat_ws(', ', amount_total::text, status, product_type)
FROM public.payments
WHERE amount_total IS NULL
  OR amount_total < 0
  OR status IS NULL
  OR status NOT IN ('completed', 'failed', 'refunded')
  OR product_type IS NULL
  OR product_type <> 'premium_lifetime'
  OR created_at IS NULL
  OR updated_at IS NULL

UNION ALL

SELECT 'invalid_delivery_lock', id::text, concat_ws(', ', channel, delivery_date::text)
FROM public.notification_delivery_locks
WHERE created_at IS NULL

UNION ALL

SELECT 'orphan_profile', profile.id::text, profile.user_id::text
FROM public.user_profiles AS profile
LEFT JOIN auth.users AS account ON account.id = profile.user_id
WHERE account.id IS NULL

UNION ALL

SELECT 'orphan_subscription', subscription.id::text, subscription.user_id::text
FROM public.subscriptions AS subscription
LEFT JOIN auth.users AS account ON account.id = subscription.user_id
WHERE account.id IS NULL

UNION ALL

SELECT 'orphan_category', category.id::text, category.user_id::text
FROM public.user_categories AS category
LEFT JOIN auth.users AS account ON account.id = category.user_id
WHERE account.id IS NULL

UNION ALL

SELECT 'orphan_payment', payment.id::text, payment.user_id::text
FROM public.payments AS payment
LEFT JOIN auth.users AS account ON account.id = payment.user_id
WHERE account.id IS NULL

UNION ALL

SELECT 'orphan_notification_settings', settings.id::text, settings.user_id::text
FROM public.user_notification_settings AS settings
LEFT JOIN auth.users AS account ON account.id = settings.user_id
WHERE account.id IS NULL

UNION ALL

SELECT 'orphan_delivery_lock_user', delivery_lock.id::text, delivery_lock.user_id::text
FROM public.notification_delivery_locks AS delivery_lock
LEFT JOIN auth.users AS account ON account.id = delivery_lock.user_id
WHERE account.id IS NULL

UNION ALL

SELECT 'orphan_delivery_lock_subscription', delivery_lock.id::text, delivery_lock.subscription_id::text
FROM public.notification_delivery_locks AS delivery_lock
LEFT JOIN public.subscriptions AS subscription ON subscription.id = delivery_lock.subscription_id
WHERE subscription.id IS NULL

UNION ALL

SELECT 'delivery_lock_user_mismatch', delivery_lock.id::text,
  delivery_lock.user_id::text || ' <> ' || subscription.user_id::text
FROM public.notification_delivery_locks AS delivery_lock
JOIN public.subscriptions AS subscription ON subscription.id = delivery_lock.subscription_id
WHERE delivery_lock.user_id <> subscription.user_id

UNION ALL

SELECT 'missing_auth_profile_trigger', 'auth.users', 'on_auth_user_created'
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_trigger
  WHERE tgrelid = 'auth.users'::regclass
    AND tgname = 'on_auth_user_created'
    AND NOT tgisinternal
);
