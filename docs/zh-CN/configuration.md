# 配置

[English](../en/configuration.md) | [简体中文](configuration.md)

核心应用不需要环境变量。只在需要启用某个服务时添加对应变量。

## 环境变量

| 变量 | 用于 | 作用域 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase 登录和云同步 | 浏览器 |
| `VITE_SUPABASE_ANON_KEY` | Supabase 登录和云同步 | 浏览器 |
| `SUPABASE_URL` | Functions 使用的 Supabase URL | 仅服务端 |
| `SUPABASE_PUBLISHABLE_KEY` | Functions 验证用户 access token | 仅服务端 |
| `SUPABASE_SECRET_KEY` | 定时通知和支付激活 | 仅服务端 |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SECRET_KEY` 的旧版兼容名 | 仅服务端 |
| `VITE_STRIPE_PUBLISHABLE_KEY` | 启用支付界面，不作为 checkout 授权依据 | 浏览器 |
| `STRIPE_SECRET_KEY` | 创建 Stripe checkout session | 仅服务端 |
| `STRIPE_WEBHOOK_SECRET` | 校验 Stripe webhook | 仅服务端 |
| `STRIPE_PRICE_ID` | 服务端允许购买的唯一 Stripe Price | 仅服务端 |
| `SITE_URL` | Checkout 成功和取消回调地址 | 仅服务端 |
| `URL` | Netlify function 回调 URL | Netlify 提供 |

## 浏览器变量

以 `VITE_` 开头的变量会被打包进浏览器代码。不要把密钥放进这些变量。

## 服务端变量

仅服务端使用的变量需要配置在托管平台中，例如 Netlify environment variables。不要提交 service role key、Stripe secret key 或 webhook secret。

Functions 优先读取不带 `VITE_` 的服务端变量，并在迁移期兼容现有的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 和 `VITE_STRIPE_PRICE_ID`。其中 `VITE_STRIPE_PRICE_ID` 只作为旧版服务端回退值，浏览器代码不再读取它。

## 功能检测

应用会在运行时检查环境变量：

- Supabase 变量启用登录和云同步。
- Stripe 变量启用支付流程。
- 缺少可选变量时，应用保持本地优先模式。

## Bark 设置

Bark 通知设置在应用界面中配置。用户需要提供 Bark server URL、device key 和提醒时间。
