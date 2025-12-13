-- 用户通知设置表（简化版 - 只保留 Bark 推送）
-- 存储用户的 Bark 推送配置和通知历史
-- 移除浏览器通知功能，推送完全由后端处理

CREATE TABLE IF NOT EXISTS user_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Bark Push Settings
  bark_enabled BOOLEAN DEFAULT false,
  bark_server_url TEXT DEFAULT 'https://api.day.app',
  bark_device_key TEXT DEFAULT '',
  bark_days_before INTEGER DEFAULT 3,
  bark_history JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one settings per user
  UNIQUE(user_id)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id
ON user_notification_settings(user_id);

-- 创建索引：快速查询启用了 Bark 的用户（后端定时任务需要）
CREATE INDEX IF NOT EXISTS idx_notification_settings_bark_enabled
ON user_notification_settings(bark_enabled)
WHERE bark_enabled = true;

-- 启用 RLS (Row Level Security)
ALTER TABLE user_notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能访问自己的通知设置
CREATE POLICY "Users can view their own notification settings"
  ON user_notification_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification settings"
  ON user_notification_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification settings"
  ON user_notification_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notification settings"
  ON user_notification_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- 创建 updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_notification_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_settings_updated_at
  BEFORE UPDATE ON user_notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_settings_updated_at();

-- 为后端定时任务创建服务角色访问策略
-- 允许服务角色（Netlify Function）读取所有用户的设置以发送通知
CREATE POLICY "Service role can read all notification settings"
  ON user_notification_settings
  FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role can update all notification settings"
  ON user_notification_settings
  FOR UPDATE
  USING (auth.jwt()->>'role' = 'service_role');

-- 注释
COMMENT ON TABLE user_notification_settings IS '用户通知设置表（简化版 - 只保留 Bark 推送）';
COMMENT ON COLUMN user_notification_settings.bark_history IS '存储已发送推送的记录，格式: {"subscription_id": "2024-01-01T00:00:00.000Z"}';
COMMENT ON COLUMN user_notification_settings.bark_enabled IS '全局 Bark 开关（需同时满足：全局开关=true + 订阅开关=true）';
COMMENT ON COLUMN user_notification_settings.bark_days_before IS '提前几天提醒（1/3/7/14）';
