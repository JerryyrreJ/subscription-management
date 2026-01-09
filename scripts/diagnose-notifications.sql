-- 📊 通知功能完整诊断（一键查询）
-- 使用方法：复制整个脚本 → Supabase Dashboard → SQL Editor → 粘贴 → Run

WITH notification_debug AS (
  SELECT
    s.name,
    s.next_payment_date,
    DATE(s.next_payment_date) - CURRENT_DATE AS days_until,
    ns.bark_days_before AS remind_days,
    s.notification_enabled AS sub_enabled,
    ns.bark_enabled AS bark_enabled,
    (ns.bark_history::jsonb)->(s.id::text) AS last_push_time,
    CASE
      WHEN (ns.bark_history::jsonb)->(s.id::text) IS NULL THEN '从未推送'
      WHEN DATE((ns.bark_history::jsonb->>(s.id::text))::timestamp) = CURRENT_DATE THEN '今天已推送'
      ELSE '可以推送'
    END AS push_status
  FROM subscriptions s
  JOIN user_notification_settings ns ON s.user_id = ns.user_id
  WHERE s.notification_enabled = true AND ns.bark_enabled = true
)
SELECT
  name AS "订阅名称",
  TO_CHAR(next_payment_date, 'YYYY-MM-DD') AS "续费日期",
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
FROM notification_debug
ORDER BY days_until;
