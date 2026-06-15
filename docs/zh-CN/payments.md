# 使用 Stripe 支付

[English](../en/payments.md) | [简体中文](payments.md)

Stripe 是可选服务。配置后，用户可以从应用中启动 Stripe Checkout 流程。

## 必需变量

```bash
VITE_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
```

如果支付后需要激活 premium 状态，还需要配置 Supabase：

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

推荐逐步迁移到 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY` 和 `SUPABASE_SECRET_KEY`。旧变量名暂时兼容。

## Functions

```text
netlify/functions/create-checkout-session.ts
netlify/functions/stripe-webhook.ts
```

`create-checkout-session.ts` 创建一次性 Stripe Checkout session。启用 Supabase 时必须携带有效登录 access token；用户 ID、邮箱和 Price ID 都由服务端决定。

`stripe-webhook.ts` 校验签名、支付状态和实际购买的 Price ID，再通过数据库事务 RPC 幂等记录付款并激活 Premium。无 Supabase 的自托管赞助模式仍允许游客付款，但不会产生 Premium 权益。

## Stripe Dashboard 设置

1. 创建 Stripe product。
2. 创建一次性 price。
3. 只把 Price ID 配置到服务端可信变量 `STRIPE_PRICE_ID`。
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
