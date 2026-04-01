-- 原子化通知去重锁
-- 用于确保同一用户的同一订阅在同一天、同一渠道只会被一个任务成功占位并发送

CREATE TABLE IF NOT EXISTS notification_delivery_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, subscription_id, channel, delivery_date)
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_locks_lookup
ON notification_delivery_locks(user_id, subscription_id, channel, delivery_date);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_locks_created_at
ON notification_delivery_locks(created_at);

ALTER TABLE notification_delivery_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage notification delivery locks"
  ON notification_delivery_locks
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

COMMENT ON TABLE notification_delivery_locks IS 'Bark 等通知渠道的每日去重发送锁';
COMMENT ON COLUMN notification_delivery_locks.channel IS '通知渠道，例如 bark';
COMMENT ON COLUMN notification_delivery_locks.delivery_date IS '通知去重日期，按 UTC 日期维度去重';
