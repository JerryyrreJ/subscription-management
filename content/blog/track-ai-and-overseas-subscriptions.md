---
title: "ChatGPT、Claude、Cursor 等海外软件订阅怎么盘点？多币种折算与防忘续费指南"
seoTitle: "海外 AI 与 SaaS 订阅管理指南：多币种折算、付款通道排查与续费提醒"
slug: track-ai-and-overseas-subscriptions
description: "同时订了 ChatGPT、Claude、Cursor、iCloud 和 VPS？一文讲清美元/日元/港币订阅分散在哪些付款通道、怎么区分固定月费与 API 自动充值，并汇总真实月均开销。"
date: 2026-11-15
status: published
lang: zh
cluster: multi-currency-ai
cta: multi-currency
canonical: https://steadyrenew.com/zh/blog/track-ai-and-overseas-subscriptions/
---

单看每月 $20 美元的 ChatGPT Plus 或 Cursor 好像没多少钱，但隔几个月翻一遍账单才发现：网页端用 Stripe 绑外币卡扣着 Claude Pro、美区 Apple ID 充礼品卡续着另一个 AI 笔记会员、PayPal 挂着一年扣一次的域名和图像工具、再加上 OpenAI / OpenRouter 后台「余额低于 $5 自动续充 $10」，每个月不知不觉就流出好几百甚至上千元人民币。

国内主流记账软件大多按人民币单币种设计，或者根本不覆盖这些分散在海外通道的软件订阅。花 15 分钟把通道摸清、把币种统一折算，才能看清自己每月到底花掉多少。

## 海外 AI 与效率订阅最容易乱在哪 4 个地方？

1. **同一款软件，不同入口价格与开关完全分离**：例如在 iPhone App 内购 ChatGPT 或 Claude，账单走 `APPLE.COM/BILL`（有时甚至比官网网页直付贵一截），取消要去手机「设置 → 订阅」；而在官网用信用卡或 Stripe Link 开通，就只能回网页后台退订。
2. **固定包月和 API 预充值混为一谈**：每月 $20 的会员费是按日期周期扣费；而 OpenAI Platform、Anthropic Console、OpenRouter 里的 **Auto top-up（自动充值）** 是按额度触发。关掉网页会员**不会**停止 API 自动充值。
3. **多币种并存，心里只有模糊估算**：美元（USD）、欧元（EUR）、日元（JPY）、港币（HKD）和人民币（CNY）混在一起，有的按月付、有的按年付，不折算成同一个展示币种根本算不准真实月均支出。
4. **为了某次项目临时升级高价档位忘了降回**：比如临时开了一周试用的录音转写、或者为赶项目升到 $100/$200 一档的编程套餐，项目做完忘了切回基础档或取消。

## 15 分钟把海外订阅通道一次排查完

拿出一张空白表格或本地订阅清单，按以下五个付款入口逐个检查：

| 扣款通道 | 怎么查 | 常见被漏掉的海外项目 |
| --- | --- | --- |
| **Apple 订阅（含美区 / 港区号）** | iPhone **设置 → 姓名 → 订阅**，依次切换不同地区 Apple ID | 手机端 AI 对话、翻译、PDF 阅读、修图会员、iCloud+ |
| **Google Play** | [play.google.com/store/account/subscriptions](https://play.google.com/store/account/subscriptions) 切换不同 Gmail | 安卓端效率工具、云盘空间、VPN |
| **官网直付（Stripe / Link / 外币卡）** | 搜索邮箱里的 `receipt`、`invoice`、`OpenAI`、`Anthropic`、`Cursor` | ChatGPT、Claude、Cursor、Midjourney、Perplexity、Notion、GitHub Copilot |
| **PayPal 自动付款** | 登录 PayPal **设置 → 付款 → 自动付款（Automatic payments）** | 年付软件授权、域名注册、WordPress 插件、海外服务器 |
| **API 控制台自动充值** | 检查 OpenAI / Anthropic / OpenRouter **Billing → Auto-recharge** | 绑定了脚本、插件或代理后静默触发的 $5–$50 自动充值 |

如果其中不少扣款当初是挂在微信或支付宝里的，也可以对照[微信 / 支付宝 / Apple / Google 自动扣费入口速查](https://steadyrenew.com/zh/blog/how-to-cancel-auto-renew/)顺手把国内入口一并清一遍。

## 整理清单时的 3 个实用原则

- **把「固定周期订阅」和「API 自动充值」分开管**：周期订阅记好精确扣款日和周期；API 平台直接进后台把 **Auto-recharge** 关掉，改成手动按需充值或设置月度硬上限，避免代码死循环一夜刷爆外币卡。
- **既留原始扣款币种，又看折算总账**：不要自己按去年记忆的汇率心算。每条记录保留真实扣款货币（比如 `$20 USD` 或 `¥1,200 JPY`），再汇总换算成你日常结算的基准币种（如 CNY 或 USD），对账时两边都能对得上。
- **年付和临时升级提前设闹钟**：把临时开的高价档位或 7 天试用单独标成「到点降级 / 取消」，免费试用提前 2–3 天提醒，年付软件至少提前 2–3 周提醒。

## 用什么工具持续跟进最省事？

如果你手里只有七八项美元订阅，用 Google Sheets 配合 `GOOGLEFINANCE` 汇率函数和日历提醒就完全够用。

如果你更习惯开箱即用的网页界面，可以试下 [SteadyRenew](https://steadyrenew.com/zh/)：

- **不用关联任何国内或海外银行卡**：默认只保存在当前浏览器本地，不需要登录就能直接记。
- **原生支持 10 种常见币种自动折算**：记录保持 USD、EUR、GBP、JPY、HKD、CNY、CAD、AUD、CHF、SGD 原币种金额，顶部按你选定的展示币种汇总月度与年度开销。
- **支持截图与一句话草稿录入**：把 Stripe 收据截图丢进去，或直接打一句 `Cursor Pro $20 monthly next 18th`，AI 会提取成草稿供你核对后保存（免费版每月含 10 次 AI 录入，无需额外付费；如需每月 300 次 AI 录入、详细分析与 A4 PDF 导出，可一次 $9 USD 买断终身高级版）。
- **接入 Bark 推送与 MCP**：配合 [Bark 续费提醒](https://steadyrenew.com/zh/blog/bark-subscription-renewal-alerts/)在扣款前几天发通知到 iPhone；如果你平时就在用 Claude、Cursor 或 ChatGPT，还能通过免费的 API 与 MCP 直接用自然语言查询近期有哪些海外订阅要续费。

SteadyRenew **不会**连接银行或 PayPal 读取消费流水，也**不会**替你取消商家或代为操作降级，取消操作仍需回到对应的官网或应用商店完成。

## 常见问题

### 海外软件走 App Store 内购和官网直付有什么区别？

除了价格可能因为应用商店抽成或汇率定价略高之外，两者的退订入口完全不同：走苹果内购必须回 iPhone「设置 → 订阅」取消，走官网直付必须登录软件自己的官网账号后台取消。在官网删号未必能停掉苹果代扣，反之亦然。

### 我在网页上取消了 ChatGPT Plus / Claude Pro，API 还会继续扣费吗？

会的。网页对话会员与开发者 API（如 `platform.openai.com`、`console.anthropic.com`）是两套独立计费系统。退订对话会员后，如果 API 后台开着自动充值且仍有接口调用，依然会产生扣费。

### 订阅记录需要绑定外币信用卡或 Plaid 才能自动同步吗？

不需要。对国内与跨区用户来说，外币卡、虚拟卡、礼品卡充值与 Stripe Link 本身就很难通过单一银行接口聚合。花 15 分钟按付款通道自己建好清单，之后每次新开试用或换套餐顺手补一条，反而比反复断连的银行同步更完整可靠。

### 怎么避免多个 AI 工具功能重叠、每个月白白多交好几份钱？

把所有 AI 工具拉进同一张清单后按用途标上分类（如对话、编程、绘图），每月底对照真实使用频率做一次取舍：同时开着两三个 $20 编程或对话套餐时，只留主力那一个按月续费，其余用到的时候再单月续开。

## 相关阅读

- [自动扣费在哪里看、怎么关？微信 / 支付宝 / Apple / Google 入口速查（2026）](https://steadyrenew.com/zh/blog/how-to-cancel-auto-renew/)
- [苹果自动扣费怎么查明细、申请退款？APPLE.COM/BILL 自助退订指南](https://steadyrenew.com/zh/blog/apple-subscription-refund-guide/)
- [怎么用 Bark 给订阅续费和免费试用设到期推送提醒（iPhone 免后台方案）](https://steadyrenew.com/zh/blog/bark-subscription-renewal-alerts/)
- [Connect SteadyRenew to an MCP client（英文）](https://steadyrenew.com/blog/manage-subscriptions-with-mcp/)
