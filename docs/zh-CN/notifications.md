# 使用 Bark 续费提醒

[English](../en/notifications.md) | [简体中文](notifications.md)

Subscription Manager 可以通过 Bark 发送续费提醒。托管提醒流程使用 Netlify Scheduled Function 和存储在 Supabase 中的通知设置。

## 用户需要配置什么

用户在应用内配置 Bark 设置：

- Bark server URL
- Bark device key
- 提醒时间
- 每个订阅的通知开关

## 必需托管服务

- Supabase，用于保存通知设置和订阅
- Netlify Functions，用于定时检查
- Bark 官方服务器或自托管 Bark 服务器

## 必需环境变量

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

新部署优先使用 `SUPABASE_SECRET_KEY`。旧变量名 `SUPABASE_SERVICE_ROLE_KEY` 仍作为兼容别名支持。

## SQL 设置

通知相关表和约束已经包含在当前 Supabase migrations 中。新部署使用：

```text
supabase/migrations/20260615000100_baseline.sql
supabase/migrations/20260615000200_harden_existing_schema.sql
```

旧安装说明和 legacy migration 文件仅保留在 `supabase/legacy/` 中作为历史参考。

## 定时函数

定时函数位于：

```text
netlify/functions/send-scheduled-notifications.ts
```

它会检查符合条件的订阅，发送 Bark 消息，记录发送历史，并避免重复发送。

## 本地测试

```bash
npm run test:notifications
```

测试完整 function 运行环境时使用 Netlify Dev：

```bash
npm run dev:full
```
