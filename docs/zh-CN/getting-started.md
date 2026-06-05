# 快速开始

[English](../en/getting-started.md) | [简体中文](getting-started.md)

Subscription Manager 是一个基于 React 和 TypeScript 的 Vite 应用。默认本地设置会把数据保存在浏览器里，不需要数据库账号。

## 环境要求

- Node.js 22.12 或更新版本
- npm

## 安装

```bash
git clone https://github.com/jerryyrrej/subscription-manager.git
cd subscription-manager
npm install
```

## 运行应用

```bash
npm run dev
```

Vite 会在 `http://localhost:5173` 启动应用。

## 使用 Netlify Functions 运行

测试 Stripe checkout、Stripe webhook 或定时通知逻辑等 serverless functions 时，使用 Netlify Dev。

```bash
npm run dev:full
```

这需要安装 Netlify CLI。

## 常用命令

```bash
npm run build               # 生产构建
npm run preview             # 预览生产构建
npm run lint                # 运行 ESLint
npm run test                # 运行工具函数测试
npm run test:notifications  # 测试定时通知逻辑
```

## 本地优先行为

没有 Supabase 配置时，订阅、分类、偏好设置和导入导出数据都会保存在浏览器中。用户仍然可以记录订阅、筛选和排序数据、切换币种、查看分析，以及使用深色模式。
