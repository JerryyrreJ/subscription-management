-- 📊 通知功能完整诊断（一键查询）
-- 使用方法：复制整个脚本 → Supabase Dashboard → SQL Editor → 粘贴 → Run

WITH RECURSIVE notification_base AS (
  SELECT
    s.id,
    s.name,
    s.next_payment_date::date AS stored_next_payment_date,
    s.period,
    s.custom_date,
    COALESCE(tz.name, 'UTC') AS time_zone,
    (NOW() AT TIME ZONE COALESCE(tz.name, 'UTC'))::date AS local_today,
    ns.bark_days_before AS remind_days,
    s.notification_enabled AS sub_enabled,
    ns.bark_enabled AS bark_enabled,
    ns.bark_history::jsonb AS bark_history
  FROM subscriptions s
  JOIN user_notification_settings ns ON s.user_id = ns.user_id
  LEFT JOIN pg_timezone_names tz ON tz.name = NULLIF(ns.time_zone, '')
  WHERE s.notification_enabled = true AND ns.bark_enabled = true
),
renewed AS (
  SELECT
    *,
    stored_next_payment_date AS effective_next_payment_date,
    0 AS renewal_steps
  FROM notification_base

  UNION ALL

  SELECT
    id,
    name,
    stored_next_payment_date,
    period,
    custom_date,
    time_zone,
    local_today,
    remind_days,
    sub_enabled,
    bark_enabled,
    bark_history,
    CASE
      WHEN period = 'monthly' THEN (effective_next_payment_date + INTERVAL '1 month')::date
      WHEN period = 'yearly' THEN (effective_next_payment_date + INTERVAL '1 year')::date
      WHEN period = 'custom' AND custom_date ~ '^[0-9]+$' AND custom_date::int > 0
        THEN effective_next_payment_date + custom_date::int
      ELSE effective_next_payment_date
    END AS effective_next_payment_date,
    renewal_steps + 1
  FROM renewed
  WHERE effective_next_payment_date < local_today
    AND renewal_steps < 240
    AND CASE
      WHEN period = 'monthly' THEN (effective_next_payment_date + INTERVAL '1 month')::date
      WHEN period = 'yearly' THEN (effective_next_payment_date + INTERVAL '1 year')::date
      WHEN period = 'custom' AND custom_date ~ '^[0-9]+$' AND custom_date::int > 0
        THEN effective_next_payment_date + custom_date::int
      ELSE effective_next_payment_date
    END <> effective_next_payment_date
),
latest_renewed AS (
  SELECT DISTINCT ON (id)
    *,
    effective_next_payment_date - local_today AS days_until,
    (bark_history)->(id::text) AS last_push_time,
    CASE
      WHEN (bark_history)->(id::text) IS NULL THEN '从未推送'
      WHEN ((bark_history->>(id::text))::timestamptz AT TIME ZONE time_zone)::date = local_today THEN '今天已推送'
      ELSE '可以推送'
    END AS push_status
  FROM renewed
  ORDER BY id, renewal_steps DESC
)
SELECT
  name AS "订阅名称",
  TO_CHAR(stored_next_payment_date, 'YYYY-MM-DD') AS "数据库续费日期",
  TO_CHAR(effective_next_payment_date, 'YYYY-MM-DD') AS "有效续费日期",
  time_zone AS "通知时区",
  TO_CHAR(local_today, 'YYYY-MM-DD') AS "时区今日",
  days_until AS "距离天数",
  remind_days AS "设置提前天数",
  CASE
    WHEN days_until = remind_days THEN '✅ 匹配'
    ELSE '❌ 不匹配 (' || days_until || ' ≠ ' || remind_days || ')'
  END AS "天数是否匹配",
  push_status AS "推送状态",
  CASE
    WHEN days_until = remind_days AND push_status != '今天已推送' THEN '🔔 应该推送'
    WHEN days_until != remind_days THEN '⏭️ 天数不符'
    WHEN push_status = '今天已推送' THEN '⏭️ 今天已推送'
    ELSE '⏭️ 其他原因'
  END AS "结论"
FROM latest_renewed
ORDER BY days_until;
