# 部署

[English](../en/deployment.md) | [简体中文](deployment.md)

项目已经为 Netlify 配置好，但前端也可以部署到任何支持 Vite 静态构建的平台。

## 静态前端

构建应用：

```bash
npm run build
```

生产产物会输出到 `dist/`。

## Netlify

`netlify.toml` 定义了：

- `npm run build` 作为构建命令
- `dist` 作为发布目录
- `netlify/functions` 作为 functions 目录
- SPA 请求重定向到 `index.html`
- 基础安全响应头

## Functions

Netlify Functions 用于：

- 创建 Stripe Checkout sessions
- 处理 Stripe webhooks
- 运行定时 Bark 提醒检查

本地测试 functions 时使用 Netlify Dev：

```bash
npm run dev:full
```

## 部署检查清单

- 只添加计划启用的服务所需环境变量。
- 启用云同步或定时通知前，先运行 Supabase SQL migrations。
- Netlify 站点 URL 可用后，再配置 Stripe webhook URL。
- 在没有可选变量的情况下测试本地优先行为。
- 按需启用 Supabase、Stripe 和通知设置后，再测试托管行为。
