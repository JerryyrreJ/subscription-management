# SteadyRenew 域名迁移

状态记录：2026-10-07（香港时间）。用户已确认产品名为 **SteadyRenew**。本分支统一更新首页、应用、中英文文案、博客、文档、通知、PDF 署名和 MCP 显示名称。

用户确认沿用同域路径结构：`steadyrenew.com/` 是首页，`steadyrenew.com/app` 是应用。已添加的 `app` 子域名仅作为跳转入口。

## 域名分工

| 地址 | 用途 | 平台 |
| --- | --- | --- |
| `https://steadyrenew.com` | 新访客看首页，已使用应用的浏览器直接进入 `/app` | 现有 Netlify site |
| `https://steadyrenew.com/about` | 始终可主动访问的官网首页 | 同一 Netlify site |
| `https://steadyrenew.com/blog`、`/zh/blog` | 英文、中文博客，保持文章 slug | 同一 Netlify site |
| `https://steadyrenew.com/app` | 应用与登录、付款返回；API/Functions 保持主域名原有路径 | 同一 Netlify site |
| `https://app.steadyrenew.com` | 兼容入口，根路径 301 到主域名 `/app`，其他路径原样转到主域名 | 同一 Netlify site |
| `https://docs.steadyrenew.com` | 文档，保持 `/en` 与 `/zh-CN` 路径 | 现有 Mintlify 项目 |
| `https://sub.jerrylu.xyz` | 过渡期旧应用、旧认证回调、旧 API 客户端、本地数据导出 | 保留现有部署与 origin |

结构化配置见 [`ops/steadyrenew/domains.json`](../../ops/steadyrenew/domains.json)。

## 已完成

- 将前一阶段 landing page 保存为 `ce5fcdc`，在 `feat/steadyrenew-domain-migration` 分支继续迁移。
- Netlify CLI 已登录，确认现有 site `subscription-management`，没有新建付费项目。
- 已添加 `steadyrenew.com`、`www.steadyrenew.com`、`app.steadyrenew.com` 三个 domain alias，并再次读取验证。添加前后的公开配置保存在 [`netlify-preparation.json`](../../ops/steadyrenew/netlify-preparation.json)。
- 旧 primary domain 仍为 `sub.jerrylu.xyz`，生产 deploy 仍为 `6ac60c2173a56900081c0bed`；旧站 HTTP 200 已验证。
- 根域名首页、应用域名识别、博客 canonical/sitemap、博客内部链接、应用内文档链接、MCP 接入说明已完成代码调整。
- 旧域名继续打开应用，带 JSON 导出和新站入口说明。没有跨 origin 搬运 session/token，也没有自动导入或覆盖任何用户记录。
- 旧博客路径准备了保留 slug 的 301；旧根路径、认证回调、API、webhook 没有全站重定向。
- `netlify.toml` 配置生产构建域名；preview/branch 构建的应用入口保持 `/app`。
- 本地 Stripe SDK 仅核实了测试账户；未更改测试 webhook、生产商品、账户信息或支付记录。
- 用户已完成 Cloudflare Wrangler OAuth 登录，权限为账户、用户和域名读取。Wrangler 不提供 DNS 编辑 scope；用户已自行在 Dashboard 添加三个 DNS 记录；助手未保存 DNS 修改。公开 DNS 已确认根域名指向 Netlify，www/app CNAME 正确。
- 已续签 Netlify 的现有证书，并通过证书查询与 HTTPS 请求确认覆盖 `steadyrenew.com`、`www.steadyrenew.com`、`app.steadyrenew.com` 和 `sub.jerrylu.xyz`。记录见 [`netlify-tls-preparation.json`](../../ops/steadyrenew/netlify-tls-preparation.json)。新域名目前仍提供旧生产版本，首页和 `/app` 的新路由需部署本分支后生效。
- Mintlify CLI 已登录原组织和 `subscriptionmanager` 项目；CLI 没有域名管理命令，控制台域名绑定待完成。
- 原 Supabase 生产项目已追加新域名和旧域名 `/app`、`/pricing` 回调，RP 显示名已改为 SteadyRenew。原 Site URL、RP ID、RP origins 与已有回调全部保留，记录见 [`supabase-auth-preparation.json`](../../ops/steadyrenew/supabase-auth-preparation.json)。修改前的 URL/RP 配置保存在本地忽略目录 `.netlify/steadyrenew/supabase-auth-before.json`。
- 改名保留现有 localStorage key、API key 前缀、MCP 包名/下载地址/环境变量、仓库和托管项目标识，避免中断现有数据与客户端。Supabase 本地 RP 仅更新显示名称，RP ID 不变。文档中的历史截图及视频可能仍显示旧名。
- `npm run check` 通过：类型检查、lint、172 个工具测试、137 个 Functions 测试和生产构建；Mintlify 文档校验通过。MCP 归档独立安装与 stdio 集成测试通过。三个迁移脚本的 Node 语法检查通过。
- 根路径智能入口已实现并在本地 Netlify Edge 与浏览器验证，见下节；新增检查后 `npm run check` 通过 175 个工具测试、145 个 Functions/Edge 测试、类型检查、lint 和生产构建。该功能随迁移版本发布，当前线上尚未生效。

## 根路径智能入口

`netlify/edge-functions/smart-entry.ts` 在服务器端处理入口，使用非敏感 Cookie `steadyrenew_entry=app` 记录浏览器曾打开过应用。Cookie 有效期一年，作用于当前 host 的 `/`，使用 `SameSite=Lax`，HTTPS 下增加 `Secure`。它不包含账户信息，不是登录凭据，不参与 API 授权。

- 新访客访问 `/` 仍显示首页。访问 `/app` 或 `/pricing` 的成功 HTML 响应会写入偏好，匿名使用也适用。
- 带偏好访问 `/` 时，Edge 直接返回 **307** 到同域 `/app`，保留查询参数；不会请求或返回首页 HTML。`Location` 不覆盖 fragment，浏览器仍能保留 OAuth hash。
- 登录及付款的旧根路径回调也会进入应用，API、webhook、博客与静态资源不经过这项偏好跳转。
- `/about` 保留官网访问入口，应用页脚的「查看官网 / Visit website」指向这里。访问官网不会清除应用偏好；带认证回调的链接仍由应用处理。
- 动态入口响应设置 `Cache-Control: private, no-store`、CDN `no-store` 和 `Vary: Cookie`，不使用永久重定向。Edge 不因 HEAD、预取、错误或非 HTML 响应写入偏好。

现有 Supabase 登录状态保存在浏览器存储中，Edge 无法读取。对于上线前已经在同一 origin 使用过应用、尚无此 Cookie 的浏览器，入口脚本会先检查已有本地数据或 Supabase 存储 key 是否存在，直接选择应用代码并补写偏好，不先加载或渲染首页。第一次桥接仍需要入口脚本，后续根路径访问才是纯 HTTP 跳转。跨域迁移仍遵循下文的数据导出/登录流程；该偏好不会搬运旧域名的账户状态或数据。

本地实际验证：无 Cookie 的 `/` 返回 200；访问 `/app` 设置 Cookie；再次访问 `/?utm_source=bookmark` 返回 307、`Location: /app?utm_source=bookmark` 和零字节响应正文；带 Cookie 的 `/about` 返回 200；仅带偏好访问 API 仍返回 401。浏览器验证了首页 → Open App → 根地址直接进入应用 → 查看官网，以及跳转前后查询参数、fragment 保留。

部署后可用以下只读请求复核（也可将 origin 换成本地 Netlify Dev 地址）：

```bash
curl -sS -D - -o /dev/null https://steadyrenew.com/
curl -sS -D - -o /dev/null https://steadyrenew.com/app
curl -sS -D - -o /dev/null --cookie 'steadyrenew_entry=app' 'https://steadyrenew.com/?utm_source=bookmark'
curl -sS -D - -o /dev/null --cookie 'steadyrenew_entry=app' https://steadyrenew.com/about
```

## 现有权限与待办

| 服务 | 核实结果 | 后续需要 |
| --- | --- | --- |
| Cloudflare | 域名 nameserver 为 `ian.ns.cloudflare.com`、`tess.ns.cloudflare.com`；Wrangler OAuth 登录成功，用户已手动配置 DNS，根域名已解析，www/app CNAME 已验证 | TLS 已就绪，待 Mintlify 给出文档目标后由用户添加 docs DNS |
| Netlify | CLI 登录有效，域名 alias、DNS、TLS 已就绪；生产 Secret 不可由 CLI/API读取 | 完成其他服务配置后设置 runtime 地址并执行正式部署 |
| Mintlify | `mint status` 已确认登录原组织和 `subscriptionmanager` 项目；旧文档 CNAME 为 `cname.mintlify.builders` | 在现有 Mintlify 项目控制台添加新自定义域名，读取它给出的准确 DNS/验证记录 |
| Supabase | 已通过 Management API 追加 Auth 回调，RP 显示名已改为 SteadyRenew | 正式切换时更新 Site URL 并验证登录；Passkey RP 独立处理，原 RP 暂时保留。不要用 `supabase config push` 将本地开发配置整体覆盖到生产 |
| Stripe | 本地 `.env.local` 仅有 test key；生产 Netlify Secret 不可读 | 通过原生产 Stripe 账户的 Dashboard 或授权 API 核实当前 live webhook、业务网址、客户门户返回地址，以及任何已启用的支付域名配置 |

不要将 API token、Stripe key、webhook secret 或 Supabase service key写入此文件、脚本或版本库。已有本地密钥不需要贴到聊天中。

## 1. Cloudflare DNS 与 TLS

Netlify alias 和以下三个 DNS 记录已完成，使用 Cloudflare DNS-only，保留现有 nameserver。文档域名仍待绑定。根域名使用 Cloudflare 的 CNAME flattening，指向 Netlify 官方负载均衡地址。

| 类型 | 名称 | 内容 | Proxy |
| --- | --- | --- | --- |
| CNAME | `@` | `apex-loadbalancer.netlify.com` | DNS only |
| CNAME | `www` | `subscription-management.netlify.app` | DNS only |
| CNAME | `app` | `subscription-management.netlify.app` | DNS only |
| Mintlify 指定 | `docs` 与验证记录 | 读取现有 Mintlify 项目给出的目标后填写 | 按 Mintlify 要求，默认 DNS only |

DNS 脚本默认只读，完整校验冲突后才允许新增记录；不会替换现有 A/AAAA/CNAME，不会修改邮件/TXT/CAA记录，也不会自动创建文档记录：

```bash
# 在私密环境中配置 CLOUDFLARE_API_TOKEN 后：
node scripts/migration/cloudflare-dns.mjs
node scripts/migration/cloudflare-dns.mjs --apply
```

三个 Netlify 域名 HTTPS 已验证。Netlify 已有 Let's Encrypt 证书时，使用其 `POST /api/v1/sites/{site_id}/ssl/renew` 续签接口；不要调用“创建证书”接口覆盖现有证书。文档域名 HTTPS 需在 Mintlify 绑定后独立验证。

官方参考：

- [Netlify 外部 DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
- [Netlify 域名 alias](https://docs.netlify.com/manage/domains/configure-domains/add-a-domain-alias/)
- [Mintlify 自定义域名](https://www.mintlify.com/docs/deploy/custom-domain)

## 2. Supabase Auth 与用户数据

生产项目继续使用 `uikhflwvhhgifvbuhebi`，preview 继续使用 `acoynfyopsgbcfhqhhiv`。不迁数据库，不新建用户，不重置 Premium 或 API key。

已读取生产 Auth 配置并保存本地备份，以下地址已追加到原 Redirect URLs/`uri_allow_list`，保留了所有现有条目，同时补充旧 `sub.jerrylu.xyz` 的 `/app` 和 `/pricing` 回调：

```text
https://steadyrenew.com/
https://steadyrenew.com/app
https://steadyrenew.com/app?auth=recovery
https://steadyrenew.com/pricing
https://steadyrenew.com/pricing?auth=recovery
```

本项目注册和 OAuth 默认回到 `/app`；找回密码会保留发起页面的 pathname 并添加 `auth=recovery`，因此 `/pricing` 的找回密码回调也要覆盖。可以使用 Supabase 支持的同域回调通配符，但不能删除已有允许项。原 OAuth 提供商若仍回调到同一个 Supabase 项目域名，一般不需要更换其 callback；需要检查提供商显示的应用主页、隐私政策/条款 URL 等品牌信息。

等 HTTPS 验证后将 Supabase Site URL 改为 `https://steadyrenew.com/app`，依次验证注册确认邮件、密码登录、OAuth、找回密码、云同步、已有 Premium 和 API key。

**Passkey 不能随域名自动迁移。** `jerrylu.xyz`/`sub.jerrylu.xyz` 与 `steadyrenew.com` 是不同 RP 范围。过渡期不要直接修改已有 RP ID，不要删除旧凭证。在用户确认其他登录方式后，单独安排新 RP `steadyrenew.com` 与 origin `https://steadyrenew.com`，并由用户重新注册凭证。新域名 Passkey 在这一步验证完成前不能算迁移完成。

仅存在浏览器本地的数据，用户在旧域名导出 JSON、在新域名导入；云端用户使用原账户重新登录。不要把旧应用根路径立即 301 到新域名，否则用户可能无法导出本地数据。不要将密码、session 或 refresh token 放在跨域 URL 中。

## 3. Stripe 与运行时地址

生产构建的三个 `VITE_*` URL 已放入 `netlify.toml`。**Netlify 文件中的 build environment 不等于 Functions runtime environment**；正式切换时还需要在生产 Functions 环境设置：

```dotenv
SITE_URL=https://steadyrenew.com/app
OPENROUTER_SITE_URL=https://steadyrenew.com
OPENROUTER_APP_TITLE=SteadyRenew
```

保持原 live Stripe 账户、`STRIPE_PRICE_ID`、webhook event 集合、API 版本、customer 和数据库权益不变。当前生产 Price ID 只做了配置读取，尚未获得 live API 权限核实其商品。

先在生产 Stripe 核实当前 endpoint。待 `https://steadyrenew.com/.netlify/functions/stripe-webhook` 可用后，优先原地更新已有 endpoint URL；不要重复创建另一个 endpoint 或复制测试 signing secret。更新后通过 Stripe 投递记录和重试验证签名、订单及权益处理。若服务确实返回新 signing secret，先在正确生产环境保存，不能输出到日志。

Checkout 的 success/cancel URL 由 Functions 的 `SITE_URL` 生成，因此最终部署后新订单返回 `https://steadyrenew.com/app`。已有未完成 Checkout Session 可能仍使用旧 return URL，必须继续支持旧域名回调。复用中的 session 不应为了换域名强行清理或造成用户重复付款。

品牌名已确认：Stripe Dashboard 业务显示名称使用 `SteadyRenew`，Premium 商品显示名称使用 `SteadyRenew Premium`，业务网址使用 `https://steadyrenew.com`，在获得 live 账户权限后操作。法人名称、税务信息和收款账户不随产品改名修改。账单描述符需核实账户与 Stripe 限制后再更新。只有实际使用了 Stripe Payment Method Domains/嵌入式 Checkout/自定义 Checkout 域名时才更新对应配置；本项目目前使用 Stripe 托管 Checkout，不假设需要新增这些服务。不要借迁移触发真实扣款。

测试账户中启用的 endpoint 当前是 `stripe-sandbox--subscription-management.netlify.app`，必须保留，不能改成生产应用域名。

## 4. Mintlify 与博客

在已有 Mintlify 项目中添加 `docs.steadyrenew.com`，而不是新建空项目。使用项目界面给出的 CNAME 和验证记录，不能只复制旧 CNAME 就当作完成。

保留旧 `docs.sub.jerrylu.xyz` 的过渡访问；确认新域名所有 `/en`、`/zh-CN` 和 API 页面正常后，配置旧文档域名到新文档域名的保留路径 301。旧域名现有 CNAME 指向 Mintlify，Netlify 的 redirect 规则无法控制它，应在 Mintlify 支持的域名重定向功能或旧域名所在 Cloudflare zone 中处理。

博客文章保持 slug 和语言路径，canonical 改成 `steadyrenew.com`，旧站 `/blog/*` 与 `/zh/blog/*` 301 到新主域名。更新 sitemap 后再提交搜索引擎；旧根路径继续承载应用，不能对旧域名做不区分路径的全站迁移重定向。

## 5. 切换与验收

只有 DNS、TLS、Auth、文档和生产支付配置具备条件后才发布当前分支。当前生产部署未被本迁移覆盖。

1. 读取并私密备份当前 Netlify runtime URL、Supabase Auth 配置、Stripe webhook URL/设置、Mintlify 域名设置。
2. 应用 Cloudflare DNS，验证 Netlify/Mintlify 域名所有权和 HTTPS。
3. 追加并验证 Auth 回调；保留旧域名、现有 RP 和旧支付回调。
4. 在生产 Functions 环境配置新 `SITE_URL`，发布迁移版本；确认新旧应用入口分别工作。
5. 检查新首页、应用、博客、文档、登录和已有数据，之后修改 Netlify primary domain 为 `steadyrenew.com`，将旧域名保留为 alias。确认主域名 `/` 对新访客展示首页、对带应用偏好的浏览器返回 307 到 `/app`，`/about` 保留官网入口，`/app` 展示应用，`app` 子域名根路径跳转到主域名 `/app`。
6. 核实新 webhook 可达后更新原 Stripe endpoint URL，验证投递；不要删除沙盒 endpoint。
7. 验证旧博客 301、旧应用 200、新 sitemap、新文档，并安排 Passkey 过渡的独立验收。

```bash
npm run check
node scripts/migration/verify-domains.mjs
# 或者只检查一个已部署的完整预览：
node scripts/migration/verify-domains.mjs https://preview-host.example
```

`verify-domains` 只发 GET：检查 HTTP、canonical、静态 Agent 资源、未认证 API 返回 401，以及 webhook 对 GET 返回 405。生产模式还检查旧应用根路径保持 200、旧博客保留路径的 301 和 www 跳转。它不会发送通知、创建订单、修改用户数据或替代浏览器中的路由、真实登录及支付投递验收。

## 回滚

若新域名阶段出错，恢复原 runtime `SITE_URL`、Supabase Site URL 和原 Stripe endpoint URL，恢复 Netlify deploy `6ac60c2173a56900081c0bed`，把 `sub.jerrylu.xyz` 保持/恢复为 primary。新的 domain alias 可以留作排查，不需要删除旧用户数据或 API key。不要回滚整个数据库，也不要把 live/test 密钥互换。

DNS 与证书传播不是即时的，因此正式切换前要确认旧站仍可用。Passkey RP 变更不可用单纯部署回滚代替，必须单独记录并恢复其原值。
