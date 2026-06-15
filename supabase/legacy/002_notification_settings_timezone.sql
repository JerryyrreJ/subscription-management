ALTER TABLE user_notification_settings
ADD COLUMN IF NOT EXISTS time_zone TEXT;

COMMENT ON COLUMN user_notification_settings.time_zone IS
'用户通知计算时区，使用 IANA 时区标识，例如 Asia/Shanghai';
