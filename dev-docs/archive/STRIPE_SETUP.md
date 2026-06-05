# Stripe集成设置指南

本指南将帮助你配置Stripe支付功能。

## 前置要求

- Netlify账户（或其他支持Serverless Functions的平台）
- Stripe账户（免费注册：https://stripe.com）

---

## 步骤1：创建Stripe账户并获取API密钥

1. 访问 [Stripe Dashboard](https://dashboard.stripe.com/)
2. 进入 **Developers → API keys**
3. 你会看到两种密钥：
   - **Publishable key** (以 `pk_` 开头) - 可以公开，用于前端
   - **Secret key** (以 `sk_` 开头) - 绝密，仅用于后端

**测试环境：**
- Publishable: `pk_test_...`
- Secret: `sk_test_...`

**生产环境：**
- Publishable: `pk_live_...`
- Secret: `sk_live_...`

---

## 步骤2：创建产品和价格

### 在Stripe Dashboard创建：

1. 进入 **Products → Add Product**
2. 填写产品信息：
   - **Name**: `Subscription Manager Premium` (或 `Support Developer`)
   - **Description**: `Lifetime access to premium features`
3. 添加价格：
   - **Price**: `$6.00`
   - **Billing**: `One time`（一次性付费）
   - **Currency**: `USD`
4. 点击 **Save product**
5. 复制 **Price ID**（格式：`price_xxxxxxxxxxxxx`）

---

## 步骤3：配置环境变量

### 本地开发（`.env`文件）：

在项目根目录创建 `.env` 文件（不要提交到git）：

```bash
# Stripe配置
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
VITE_STRIPE_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx  # 暂时留空，稍后配置
```

### Netlify部署配置：

1. 登录Netlify Dashboard
2. 进入你的项目 → **Site settings → Environment variables**
3. 添加以下环境变量：
   - `VITE_STRIPE_PUBLISHABLE_KEY`
   - `VITE_STRIPE_PRICE_ID`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET` (稍后添加)

---

## 步骤4：配置Stripe Webhook

Webhook用于接收支付成功的通知。

### 4.1 部署到Netlify

首先将代码部署到Netlify，获取你的网站URL（例如：`https://your-app.netlify.app`）

### 4.2 在Stripe Dashboard创建Webhook

1. 进入 **Developers → Webhooks**
2. 点击 **Add endpoint**
3. 填写信息：
   - **Endpoint URL**: `https://your-app.netlify.app/.netlify/functions/stripe-webhook`
   - **Events to send**: 选择以下事件
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
4. 点击 **Add endpoint**
5. 复制 **Signing secret**（格式：`whsec_xxxxxxxxxxxxx`）

### 4.3 添加Webhook Secret

将获取的 Signing secret 添加到：
- 本地：`.env` 文件的 `STRIPE_WEBHOOK_SECRET`
- Netlify：环境变量 `STRIPE_WEBHOOK_SECRET`

---

## 步骤5：本地测试

### 5.1 安装Stripe CLI（可选）

用于本地测试webhook：

```bash
# macOS
brew install stripe/stripe-cli/stripe

# 登录
stripe login
```

### 5.2 监听Webhook事件

```bash
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
```

### 5.3 启动本地开发

```bash
# Terminal 1: 启动Netlify Dev
netlify dev

# Terminal 2: 启动Stripe Webhook监听（可选）
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
```

---

## 步骤6：测试支付流程

### 测试模式下的测试卡号：

Stripe提供测试卡号用于开发：

- **成功支付**: `4242 4242 4242 4242`
- **需要3D验证**: `4000 0025 0000 3155`
- **支付失败**: `4000 0000 0000 9995`

其他信息随便填：
- **过期日期**: 任何未来日期（如 `12/34`）
- **CVC**: 任何3位数字（如 `123`）
- **邮编**: 任何5位数字（如 `12345`）

### 测试流程：

1. 运行 `npm run dev`
2. 打开应用，点击定价页面
3. 点击 "Upgrade Now" 或 "Support Project"
4. 应该跳转到Stripe Checkout页面
5. 使用测试卡号完成支付
6. 支付成功后应该跳回你的应用

---

## 步骤7：切换到生产环境

当准备上线时：

### 7.1 在Stripe Dashboard激活账户

1. 进入 **Settings → Account**
2. 完成企业信息填写
3. 激活你的账户

### 7.2 更新环境变量

将所有 `pk_test_` 和 `sk_test_` 替换为 `pk_live_` 和 `sk_live_`

### 7.3 更新Webhook

创建生产环境的Webhook endpoint（与测试环境步骤相同）

---

## 故障排查

### 问题1：点击按钮没有反应

- 检查浏览器控制台是否有错误
- 确认 `VITE_STRIPE_PUBLISHABLE_KEY` 和 `VITE_STRIPE_PRICE_ID` 已配置

### 问题2：跳转到Stripe后显示错误

- 检查 `STRIPE_SECRET_KEY` 是否正确
- 确认Price ID是否正确
- 查看Netlify Functions日志

### 问题3：支付成功但webhook未触发

- 检查Stripe Dashboard的Webhook日志
- 确认Webhook URL正确
- 确认 `STRIPE_WEBHOOK_SECRET` 已配置

### 问题4：本地开发Webhook不工作

- 使用Stripe CLI进行本地转发
- 或者暂时跳过webhook测试，直接在Stripe Dashboard手动确认

---

## 安全注意事项

⚠️ **永远不要提交以下内容到git：**
- `.env` 文件
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

✅ **可以公开的：**
- `VITE_STRIPE_PUBLISHABLE_KEY`（Publishable key设计就是可以公开的）
- `VITE_STRIPE_PRICE_ID`（Price ID也可以公开）

---

## 支持的支付方式

Stripe Checkout默认支持：
- 信用卡/借记卡（Visa, Mastercard, Amex等）
- Apple Pay（如果用户设备支持）
- Google Pay（如果用户设备支持）

可以在Stripe Dashboard的 **Settings → Payment methods** 中启用更多支付方式。

---

## 下一步

成功配置后，你的应用将能够：
- ✅ 接受一次性支付（$6 lifetime）
- ✅ 自动处理支付成功/失败
- ✅ 通过webhook接收支付通知
- ✅ 根据配置自动切换显示模式（Premium vs Support Developer）

如有问题，请查看：
- [Stripe文档](https://stripe.com/docs)
- [Netlify Functions文档](https://docs.netlify.com/functions/overview/)
