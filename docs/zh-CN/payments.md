# 使用 Stripe 支付

[English](../en/payments.md) | [简体中文](payments.md)

Stripe 是可选服务。配置后，用户可以从应用中启动 Stripe Checkout 流程。

## 必需变量

```bash
VITE_STRIPE_PUBLISHABLE_KEY=
VITE_STRIPE_PRICE_ID=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

如果支付后需要激活 premium 状态，还需要配置 Supabase：

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Functions

```text
netlify/functions/create-checkout-session.ts
netlify/functions/stripe-webhook.ts
```

`create-checkout-session.ts` 创建一次性 Stripe Checkout session。

`stripe-webhook.ts` 校验 Stripe webhook 签名，记录已完成支付，并在 Supabase 已配置时激活 premium 状态。

## Stripe Dashboard 设置

1. 创建 Stripe product。
2. 创建一次性 price。
3. 将 Price ID 填入 `VITE_STRIPE_PRICE_ID`。
4. 将 publishable key 和 secret key 添加到对应环境。
5. 创建 webhook endpoint：

```text
https://your-site.netlify.app/.netlify/functions/stripe-webhook
```

6. 为 endpoint 订阅 `checkout.session.completed`。
7. 将 webhook signing secret 保存到 `STRIPE_WEBHOOK_SECRET`。

## 本地 Webhook 测试

如果要在本地测试 webhooks，可以使用 Stripe CLI：

```bash
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
```

测试 functions 时通过 Netlify Dev 运行应用：

```bash
npm run dev:full
```
