# 使用 Supabase 云同步

[English](../en/supabase.md) | [简体中文](supabase.md)

Supabase 是可选服务。配置后，它会启用登录、用户资料、云同步、分类同步、通知设置和支付激活。

## 必需变量

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` 只能用于服务端。它供不在用户会话中的 Netlify Functions 使用。

## SQL 设置

按计划启用的功能运行对应 SQL 文件：

```text
supabase/migrations/001_premium_features.sql
supabase/01_add_notification_enabled.sql
supabase/02_create_notification_settings.sql
supabase/03_create_notification_delivery_locks.sql
supabase/migrations/002_notification_settings_timezone.sql
supabase/migrations/003_notification_settings_locale.sql
```

可以使用 Supabase Dashboard SQL editor 或 Supabase CLI。

## 数据模型区域

- User profiles 保存账号和 premium 状态。
- Subscriptions 保存周期性付款记录。
- Categories 保存用户自定义分类。
- Notification settings 保存 Bark 提醒偏好和发送历史。
- Delivery locks 防止定时通知重复发送。

## 安全说明

- 用户拥有的数据表应保持 Row Level Security 开启。
- 不要把 service role key 放进浏览器可见变量。
- service role key 只应保存在 Netlify 或其他服务端环境中。
