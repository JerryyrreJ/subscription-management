-- 为 subscriptions 表添加通知开关字段
-- 允许用户为每个订阅单独控制是否接收通知

-- 添加 notification_enabled 字段，默认为 true（向后兼容）
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN DEFAULT true;

-- 创建索引以优化查询性能（后端定时任务会频繁使用）
CREATE INDEX IF NOT EXISTS idx_subscriptions_notification_enabled
ON subscriptions(notification_enabled);

-- 创建复合索引：同时过滤用户和通知状态
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_notification
ON subscriptions(user_id, notification_enabled);

-- 注释
COMMENT ON COLUMN subscriptions.notification_enabled IS '是否为该订阅启用通知提醒（默认 true）';
