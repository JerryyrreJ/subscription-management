---
title: "ChatGPT、Claude、Cursor 等海外软件订阅怎么盘点？多币种折算与防忘续费指南"
seoTitle: "海外 AI 订阅管理：ChatGPT/Claude 多币种与续费提醒"
slug: track-ai-and-overseas-subscriptions
description: "同时订了 ChatGPT、Claude、Cursor、iCloud 和 VPS？一文讲清美元/日元/港币订阅分散在哪些付款通道、怎么区分固定月费与 API 自动充值，并汇总真实月均开销。"
summary: "海外 AI 与软件订阅容易失控，核心是扣款分散在苹果内购、官网 Stripe、PayPal 和 API 自动充值四套独立系统里。先把固定周期订阅与 API 按量充值拆开，再按原币种记录并折算成人民币月均总账，最后给高价档位和年付提前设提醒。"
date: 2026-11-15
updated: 2026-11-20
status: published
lang: zh
cluster: multi-currency-ai
cta: multi-currency
image: /blog/ai-dashboard-zh.png
canonical: https://steadyrenew.com/zh/blog/track-ai-and-overseas-subscriptions/
---

如果你同时用着 ChatGPT Plus、Claude Pro、Cursor、Perplexity，再加上几台海外云服务或 iCloud+，账单失控通常不是因为哪一笔特别贵，而是每一笔看起来都只是「$10 到 $25」——可它们分散在美区 Apple ID、外币卡 Stripe、PayPal 和 API 余额自动充值里，月底一加总，轻松就超过一千多块人民币。

国内常见的记账 App 大多默认单币种人民币，也很难覆盖外币卡、虚拟卡和美区礼品卡这些通道。与其找一个到处断连的自动同步工具，不如花 15 分钟把通道摸清、建一份自己看得懂的多币种清单。

## 为什么海外 AI 订阅总是算不清账？

真正让人多花冤枉钱的，往往是这几个具体细节：

- **同一款软件，App 内购和官网直付完全不互通**：在 iPhone 里开的 ChatGPT 或 Claude 走的是 `APPLE.COM/BILL`（有时价格还比网页贵），必须回 iPhone「设置 → 订阅」关闭；在官网用外币卡或 Stripe Link 付的，只能回网页后台退订。很多人只在网页点过注销，下个月苹果照扣不误。
- **网页会员和 API 自动充值是两笔账**：每月 $20 的对话套餐按日期续费；而 OpenAI Platform、Anthropic Console、OpenRouter 里的 **Auto-recharge（余额不足自动充值）** 是按消耗额度触发的。停掉网页会员，API 照样会在后台每次自动充 $10 或 $50。
- **赶项目时临时升档，做完忘了降回去**：比如为了集中写一周代码临时升到 $100/$200 的高配档，或者开了某个录音转写、绘图工具的 7 天试用，项目结束后没人提醒，下个月直接原价续费。
- **多币种 + 月付年付混在一起**：美元（USD）、日元（JPY）、港币（HKD）和国内人民币云服务、视频会员混着扣，靠脑子大概估一个数，通常会比真实月均支出少算 30% 以上。

## 按 5 个付款通道做一次彻底排查

直接按付款入口倒查，比凭记忆列软件名靠谱得多：

| 扣款通道 | 具体排查位置 | 最常漏掉的海外项目 |
| --- | --- | --- |
| **Apple 订阅（含美区 / 港区号）** | iPhone **设置 → 姓名 → 订阅**，挨个切号查 | 手机端 AI 对话、翻译、PDF、修图、iCloud+ |
| **Google Play** | [play.google.com/store/account/subscriptions](https://play.google.com/store/account/subscriptions) 切换不同 Gmail | 安卓效率工具、云盘空间、代理服务 |
| **官网直付（Stripe / Link / 外币卡）** | 邮箱搜 `receipt`、`invoice`、`OpenAI`、`Anthropic`、`Cursor` | ChatGPT、Claude、Cursor、Midjourney、Perplexity、Vercel、Supabase |
| **PayPal 自动付款** | PayPal **设置 → 付款 → 自动付款（Automatic payments）** | 年付软件授权、域名、海外服务器、浏览器插件 |
| **API 控制台自动充值** | 检查 OpenAI / Anthropic / OpenRouter **Billing → Auto-recharge** | 接了脚本或 Agent 后静默触发的 $5–$50 自动充值 |

如果其中还有绑在微信或支付宝里的会员，可以顺手对照[微信 / 支付宝 / Apple / Google 自动扣费入口速查](https://steadyrenew.com/zh/blog/how-to-cancel-auto-renew/)一次清完。

## 整理时的 3 条硬规则

1. **固定订阅进清单，API 自动充值直接关掉或设月上限**：不要把按量计费的 API 混进固定月费清单里估算。最省心的做法是直接关掉 API 的 Auto-recharge，改成手动充一笔用完再充，避免脚本死循环刷爆外币卡。
2. **保留原币种，按统一基准币种看汇总**：每条记录按真实扣款币种填（例如 `$20 USD`、`CN¥68`、`¥1,200 JPY`），统计时统一折算成人民币或美元看月均和年化总支出，对账和做预算两边都能对得上。
3. **只保留一个主力月付，其余按需单月开**：同时付两三个功能重叠的 $20 对话或编程套餐非常常见。清完清单后按分类（AI 工具、云服务、娱乐）排一遍，留下每天在用的主力，低频工具改用「需要时开一个月、开完立刻点取消」的策略。

## 用表格还是专用工具？

说实话，**如果你总共只有七八项订阅、而且几乎全是美元**，一张 Google Sheets 配上 `GOOGLEFINANCE` 汇率函数，再给年付项目加个手机日历提醒就够用了，没必要多维护一个工具。

但当你的列表涨到十几二十项、既有美元 SaaS/AI 又有人民币云服务和年付工具时，手动改日期和汇率很快就会荒废。下面是我自己在 [SteadyRenew](https://steadyrenew.com/zh/) 测试账号里放了 19 项中英文混合订阅（含 Perplexity Pro、ChatGPT Plus、Claude Pro、Cursor、Supabase、阿里云、B 站等）后的总览效果：

![SteadyRenew 中文多币种订阅总览，汇总美元与人民币订阅并高亮近期到期项](/blog/ai-dashboard-zh.png "示例数据：19 项美元与人民币混合订阅自动折算为人民币月度总支出，并在卡片上提示即将到期")

用它管理海外订阅时，真正省事的是这几处细节：

- **完全不用绑国内或海外银行卡**：打开即在当前浏览器本地保存，不需要注册就能先建表；想多设备同步或收提醒时再登录免费账号。
- **保留原币种 + 自动折算总账**：卡片上依然显示 `US$20.00` 或 `CN¥68.00`，顶部一键切人民币/美元看每月或每年汇总，快到期时会直接标出「今日到期」「2 天后到期」。
- **不用逐格手填**：点顶部「AI 录入」，把 Stripe 收据截图丢进去，或打一句 `Cursor Pro $20 monthly next 18th`，核对草稿后保存就行（免费版每月 10 次 AI 录入；需要每月 300 次、详细图表与 A4 PDF 导出时，是一次 $9 USD 买断，不是又一笔月费）。
- **Bark 推送 + MCP 查询**：配合 [Bark 续费提醒](https://steadyrenew.com/zh/blog/bark-subscription-renewal-alerts/) 在扣款前几天推到 iPhone；免费版还开放了 API 与 MCP，可以直接在 Claude、Cursor 里顺口问「我这周有哪些订阅快到期了」。

需要说明边界：SteadyRenew **不会**连接银行卡或 PayPal 自动拉流水，也**不会**帮你取消或降级套餐——真正要停扣，仍然需要回到对应的官网或应用商店后台操作。

## 常见问题

### 海外软件走 App Store 内购和官网直付有什么区别？

除了价格可能因为应用商店抽成略高之外，两者的退订入口完全分离：走苹果内购必须回 iPhone「设置 → 订阅」取消，走官网直付必须登录软件官网账号后台取消。在官网删号不会停掉苹果代扣，反之亦然。

### 我在网页上取消了 ChatGPT Plus / Claude Pro，API 还会继续扣费吗？

会的。网页对话会员与开发者 API（如 `platform.openai.com`、`console.anthropic.com`）是两套独立计费系统。退订对话会员后，如果 API 后台还开着自动充值且有调用发生，依然会继续扣款。

### 记录海外订阅需要绑定外币信用卡或 Plaid 才能同步吗？

不需要。对国内与跨区用户来说，外币卡、虚拟卡、礼品卡与 Stripe Link 本身就很难通过单一银行接口稳定抓取。花 15 分钟按付款通道建好清单，之后每次新开试用或换档顺手补一条，比反复断连的银行同步更可靠。

### 怎么避免多个 AI 工具功能重叠、每个月白白多交好几份钱？

把所有 AI 工具拉进同一张清单后按用途分类（对话、编程、绘图、云服务），每月底对照真实使用频率做取舍：同时开着多个 $20 同类套餐时，只留主力那一个长期续费，其余需要时再单月续开并立刻关闭自动续费。

## 相关阅读

- [自动扣费在哪里看、怎么关？微信 / 支付宝 / Apple / Google 入口速查（2026）](https://steadyrenew.com/zh/blog/how-to-cancel-auto-renew/)
- [苹果自动扣费怎么查明细、申请退款？APPLE.COM/BILL 自助退订指南](https://steadyrenew.com/zh/blog/apple-subscription-refund-guide/)
- [怎么用 Bark 给订阅续费和免费试用设到期推送提醒（iPhone 免后台方案）](https://steadyrenew.com/zh/blog/bark-subscription-renewal-alerts/)
- [Connect SteadyRenew to an MCP client（英文）](https://steadyrenew.com/blog/manage-subscriptions-with-mcp/)
