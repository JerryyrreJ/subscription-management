ALTER TABLE user_notification_settings
ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en';

UPDATE user_notification_settings
SET locale = 'en'
WHERE locale IS NULL OR locale = '';

COMMENT ON COLUMN user_notification_settings.locale IS
'通知文案语言，当前支持 en / zh-CN';
