# AI 录入

[English](../en/ai-capture.md) | [简体中文](ai-capture.md)

AI 录入允许已登录用户用自然语言描述订阅变更，或上传账单/截图。模型只返回待确认的结构化操作；应用会展示核对界面，只有用户确认后才写入数据。

## 支持的操作

- 从文本、收据、账单片段或截图中新增一个或多个订阅。
- 通过名称或 id 修改已有订阅。
- 一次请求批量修改多个订阅。
- 在核对后删除已有订阅。
- 在应用内确认、编辑、丢弃或撤销 AI 产生的操作。

AI 不会直接写入订阅数据，它只准备结构化命令。

## 必需服务

- Supabase auth。
- Supabase migrations 至少执行到 `20260625000100_ai_budget_reservations.sql`。
- Netlify Functions。
- `OPENROUTER_API_KEY` 或 `ANTHROPIC_API_KEY`。

如果没有配置 provider key，应用会回退到手动添加表单。

## 服务端变量

```bash
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=
AI_PROVIDER=openrouter
AI_MODEL=google/gemini-2.5-flash-lite
AI_FALLBACK_MODELS=google/gemini-2.5-flash
OPENROUTER_SITE_URL=https://your-site.example
OPENROUTER_APP_TITLE=Subscription Manager
AI_FREE_DAILY_PARSES=20
AI_PREMIUM_DAILY_PARSES=200
AI_MAX_INPUT_CHARS=20000
AI_MAX_IMAGE_BYTES=4194304
AI_MONTHLY_BUDGET_USD=50
AI_INPUT_USD_PER_MTOK=0.1
AI_OUTPUT_USD_PER_MTOK=0.4
```

## 隐私

用户粘贴的文本或上传的截图只会为了本次识别发送给配置的模型供应商一次。Subscription Manager 不存储、不记录这些内容。数据库只保存每用户每日调用计数和工作区级月度聚合 token 计数。

完整指南见 Mintlify 页面：`docs-site/zh-CN/integrations/ai-capture.mdx`。
