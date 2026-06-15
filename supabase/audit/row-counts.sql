-- Capture immediately before and after a production migration.
-- Counts must remain identical unless a reviewed migration explicitly adds rows.

SELECT 'notification_delivery_locks' AS table_name, count(*) AS row_count
FROM public.notification_delivery_locks
UNION ALL
SELECT 'payments', count(*) FROM public.payments
UNION ALL
SELECT 'subscriptions', count(*) FROM public.subscriptions
UNION ALL
SELECT 'user_categories', count(*) FROM public.user_categories
UNION ALL
SELECT 'user_notification_settings', count(*) FROM public.user_notification_settings
UNION ALL
SELECT 'user_profiles', count(*) FROM public.user_profiles
ORDER BY table_name;
