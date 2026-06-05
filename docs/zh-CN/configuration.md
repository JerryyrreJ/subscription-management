# 配置

[English](../en/configuration.md) | [简体中文](configuration.md)

核心应用不需要环境变量。只在需要启用某个服务时添加对应变量。

## 环境变量

| 变量 | 用于 | 作用域 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase 登录和云同步 | 浏览器 |
| `VITE_SUPABASE_ANON_KEY` | Supabase 登录和云同步 | 浏览器 |
| `SUPABASE_SERVICE_ROLE_KEY` | 定时通知和支付激活 | 仅服务端 |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe checkout | 浏览器 |
| `VITE_STRIPE_PRICE_ID` | Stripe checkout | 浏览器 |
| `STRIPE_SECRET_KEY` | 创建 Stripe checkout session | 仅服务端 |
| `STRIPE_WEBHOOK_SECRET` | 校验 Stripe webhook | 仅服务端 |
| `URL` | Netlify function 回调 URL | Netlify 提供 |

## 浏览器变量

以 `VITE_` 开头的变量会被打包进浏览器代码。不要把密钥放进这些变量。

## 服务端变量

仅服务端使用的变量需要配置在托管平台中，例如 Netlify environment variables。不要提交 service role key、Stripe secret key 或 webhook secret。

## 功能检测

应用会在运行时检查环境变量：

- Supabase 变量启用登录和云同步。
- Stripe 变量启用支付流程。
- 缺少可选变量时，应用保持本地优先模式。

## Bark 设置

Bark 通知设置在应用界面中配置。用户需要提供 Bark server URL、device key 和提醒时间。
