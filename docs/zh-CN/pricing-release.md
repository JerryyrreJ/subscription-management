# $9 Lifetime Pricing 改版与沙盒验收

基于 main 的 20fc855。前端整页重写，保留原有账户、报告与支付数据库流程，修复权益限制和付款边界。代码分支：feature/pricing-lifetime。未改动端到端加密分支。

## 权益

- Free：不限订阅与分类；云同步、提醒、多币种、基础统计、JSON 导入导出；AI 每自然月 10 次。
- Premium：9 美元一次付费，服务运营期间有效；AI 每自然月 300 次；进阶报告、PDF、对应进阶分析接口。
- 两档 API／MCP 均不设月度额度；防刷默认每账户合计 60 次／分钟、5 个有效 Key。旧的免费／付费分别配置的环境变量已停用。

## 部署顺序

先将项目既有 migration 和本次新增的
`supabase/migrations/20260922190912_pricing_abuse_limits.sql`
应用到目标 Supabase（使用现有 Supabase migration 流程），再部署前后端。
新增 RPC 只允许 service_role 调用，不修改用户订阅数据。
不要仅部署前端：新的 API 分钟限流与 AI 失败返还依赖此次 migration。

定价页文案对应默认 10／300 次 AI、60 次／分钟与 5 个 Key；若改这些环境变量，需同时更新页面公开额度。

## Stripe Sandbox

本次环境没有获得测试密钥访问权限，因此未进行真实 Stripe 沙盒交易。
自动审批拒绝了列出 Netlify 全部环境变量的操作，以免暴露部署密钥。
不要把真实支付密钥提交到 git 或发到聊天中。

在隔离的测试部署配置：

- `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_PRICE_ID=price_...`：同一 sandbox 内 active、USD 900 cents、one_time。
- `STRIPE_WEBHOOK_SECRET=whsec_...`：该测试 endpoint 的签名 secret。
- `SITE_URL`：测试站点地址。
- Supabase 浏览器配置和服务端 secret 使用测试项目，避免测试购买给正式账户授予权益。
- `AI_FREE_MONTHLY_PARSES=10`、`AI_PREMIUM_MONTHLY_PARSES=300`。
- `API_RATE_LIMIT_PER_MINUTE=60`、`API_MAX_ACTIVE_KEYS=5`。

Stripe webhook 指向：
`https://<测试站点>/.netlify/functions/stripe-webhook`

订阅两个事件：
`checkout.session.completed`、
`checkout.session.async_payment_succeeded`。

验收：
1. 登录 Free 测试账户 → /pricing → 付款，确认 Stripe 页显示测试模式和 USD $9。
2. 使用 Stripe 文档测试卡 4242 4242 4242 4242、未来日期、任意三位 CVC；确认 webhook 200、账户成为 Premium、报告解锁。
3. 重发同一事件，确认 payments 不重复；刷新页面仍是 Premium，已升级账户不能再次创建付款。
4. 取消付款后仍为 Free。拒付测试不能授予权益。
5. 对启用的延迟付款方式验证：未 paid 的 completed 不开通；async_payment_succeeded 后才开通。
6. Free 账户 AI 配额耗尽返回 429；模型失败返还个人次数；报告入口仍有付费门槛；API/MCP 的配额不随档位改变。

付款成功 URL 不作为授权依据。确认页面只读取服务端账户权益，短时未开通时提示等待，避免重复付费。

## 已验证及边界

本地类型检查、lint、单元／函数回归测试、生产构建；
实际 PostgreSQL 引擎中的新 RPC 分钟边界、AI 额度竞争与返还、角色权限；
浏览器桌面／手机中英文布局、比较锚点、FAQ、Escape 退出；
模拟支付的登录令牌、重复点击、失败重试、跳转、等待／确认成功、取消付款；
真实 Stripe SDK 对 webhook 原始字节的签名验证及篡改拒绝。

本地 mock 测试不能替代真实 Stripe webhook 与 Supabase 的部署联调。
函数异常退出或返还 RPC 故障可能保守占用个人 AI 次数；
模型失败时服务商费用未知，保留全站预算预留，不假设调用免费。
每分钟限流为固定窗口，边界瞬间可能有两段窗口的请求。
已购买拦截和 10 分钟幂等创建减少重复付款，但不是跨时段多个已打开 Checkout 页面的全局锁。

官方资料：
- https://docs.stripe.com/checkout/fulfillment
- https://docs.stripe.com/testing
- https://docs.stripe.com/api/idempotent_requests

保留现有 Stripe SDK 与其匹配的 API 版本，补齐当前 Checkout 履约流程，无需为本次变更强制升级 API。

## 移动端补丁（2026-09-23）

- 手机／触摸设备上的小字号输入控件至少 16px；保留金额大字号和主动双指缩放。
- 新增分类仅在鼠标／精确指针设备自动聚焦，避免手机点击加号时立即触发键盘。
- 统一弹窗滚动锁，支持嵌套引用计数、最后关闭时还原页面位置及原有样式。
- 用 VisualViewport 的可见高度与偏移适配软键盘；主动缩放期间不追逐缩放尺寸。
- 弹窗内部滚动隔离；短表单在键盘弹出后可以内部滚动；独立密码重置页仍使用正常页面滚动。
- Chromium 手机尺寸浏览器验证了字号、大号金额、嵌套锁定、模拟键盘高度和滚动位置恢复；类型检查、lint、构建通过。
- 尚未在真实 iPhone Safari 验证软键盘和焦点缩放。
