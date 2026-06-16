# Subscription Manager

[English](README.md) | [简体中文](README.zh-CN.md)

在线使用：[sub.jerrylu.app](https://sub.jerrylu.app)

Subscription Manager 是一个本地优先的 Web 应用，用于跟踪周期性订阅。它支持多币种、续费提醒、数据分析、导入导出，以及可选的云同步。

应用不需要账号也能使用，数据默认保存在浏览器中。如果需要托管同步、支付或服务端提醒，可以配置 Supabase、Stripe、Netlify Functions 和 Bark 通知。

## 功能

- 记录订阅名称、分类、金额、币种、计费周期和续费日期
- 按所选基准货币查看月度和年度总支出
- 支持 CNY、USD、EUR、JPY、GBP、AUD、CAD、CHF、HKD 和 SGD 之间的换算
- 按名称、金额、续费日期、分类或创建时间排序和筛选订阅
- 管理内置分类和自定义分类
- 以 JSON 文件导入和导出订阅数据
- 查看支出报告、分类占比、最高支出订阅和续费分布
- 可选启用 Supabase 登录和多设备同步
- 可选通过 Bark 推送发送续费提醒
- 可选创建开发者 API Key，用于自动化增删查改订阅
- 支持桌面端和移动端的浅色/深色模式

## 技术栈

- React 18
- TypeScript
- Vite
- Tailwind CSS
- i18next
- Recharts
- Supabase
- Netlify Functions
- Stripe

## 快速开始

### 环境要求

- Node.js 22.12 或更新版本
- npm

### 本地运行

```bash
git clone https://github.com/jerryyrrej/subscription-manager.git
cd subscription-manager
npm install
npm run dev
```

Vite 开发服务器运行在 `http://localhost:5173`。

如果需要本地测试 Netlify Functions，使用：

```bash
npm run dev:full
```

这个命令需要安装 Netlify CLI。

## 脚本

```bash
npm run dev                 # 启动 Vite 开发服务器
npm run dev:full            # 启动 Netlify 本地开发环境
npm run build               # 生产构建
npm run preview             # 预览生产构建
npm run lint                # 运行 ESLint
npm run typecheck           # 运行前端和 Functions TypeScript 检查
npm run test                # 运行工具函数测试
npm run test:functions      # 运行 Netlify Functions 测试
npm run db:verify           # 重置并 lint 本地 Supabase 数据库
npm run check               # 运行 typecheck、lint、测试和构建
npm run test:notifications  # 测试定时通知逻辑
```

## 配置

核心应用不需要环境变量。可选服务使用以下配置：

| 服务 | 变量 | 用途 |
| --- | --- | --- |
| Supabase | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | 登录、云同步、定时通知访问 |
| Stripe | `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | 支付界面、Checkout 和 webhook 处理 |
| 开放 API | `API_FREE_RATE_LIMIT_PER_HOUR`, `API_PREMIUM_RATE_LIMIT_PER_HOUR`, `API_FREE_ACTIVE_KEYS`, `API_PREMIUM_ACTIVE_KEYS` | 可选覆盖 API 配额 |
| Bark | 在应用内配置 | 订阅续费推送提醒 |
| Netlify | `URL` 由 Netlify 提供 | 函数回调和定时提醒 |

## 文档

- [文档入口](docs/README.md)
- [快速开始](docs/zh-CN/getting-started.md)
- [配置](docs/zh-CN/configuration.md)
- [部署](docs/zh-CN/deployment.md)
- [使用 Supabase 云同步](docs/zh-CN/supabase.md)
- [使用 Bark 续费提醒](docs/zh-CN/notifications.md)
- [使用 Stripe 支付](docs/zh-CN/payments.md)
- [开放 API](docs/zh-CN/api.md)
- [更新日志](CHANGELOG.md)

## 项目结构

```text
src/                 React 应用代码
src/components/      UI 组件
src/hooks/           React hooks
src/services/        云服务、支付和同步服务
src/utils/           存储、货币、通知和校验工具
netlify/functions/   Serverless functions
supabase/            SQL 设置和迁移
tests/               Node test runner 工具测试
docs/                按语言拆分的公开文档
dev-docs/            开发笔记和归档实现草稿
```

## 许可证

本项目使用 MIT License。详情见 [LICENSE](LICENSE)。
