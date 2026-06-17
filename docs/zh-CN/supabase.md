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

正式 schema 由时间戳迁移管理：

```text
supabase/migrations/20260615000100_baseline.sql
supabase/migrations/20260615000200_harden_existing_schema.sql
supabase/migrations/20260616000100_public_api.sql
supabase/migrations/20260617000100_public_api_security_fixes.sql
supabase/migrations/20260618000100_agent_operations_layer.sql
```

全新环境使用 `supabase start` 和 `npm run db:verify`。现有线上环境必须先生成只读 DDL dump、确认 baseline diff、运行 `supabase/audit/preflight.sql`，再标记 baseline 并执行 hardening migration。完整步骤见 `supabase/README.md`。

## 数据模型区域

- User profiles 保存账号和 premium 状态。
- Subscriptions 保存周期性付款记录。
- Categories 保存用户自定义分类。
- Notification settings 保存 Bark 提醒偏好和发送历史。
- Delivery locks 防止定时通知重复发送。
- API keys 只保存哈希后的 Key 信息和权限范围。
- API audit logs 记录开放 API 写操作。

## 安全说明

- 用户拥有的数据表应保持 Row Level Security 开启。
- 不要把 service role key 放进浏览器可见变量。
- service role key 只应保存在 Netlify 或其他服务端环境中。
