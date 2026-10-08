# Landing page 与域名配置

`/` 展示产品首页，`/app` 打开订阅管理工具，`/pricing` 保留现有 Premium 页面。原来的付款返回、OAuth 和密码重置链接仍进入应用，并保留参数。指南继续位于 `/blog` 和 `/zh/blog`。

首页支持中英文、深浅色主题和移动端。产品预览使用实际 `/app` 页面截图，标注示例数据，点击可查看大图。示例数据不写入用户记录。应用按需加载，访问首页不会初始化 Supabase 登录或订阅同步。

## 同域部署

SteadyRenew 采用此结构：`steadyrenew.com/` 是首页，`steadyrenew.com/app` 是应用。`app.steadyrenew.com` 只作为跳转入口。

在 Netlify 的构建环境中设置以下变量并重新构建：

```dotenv
VITE_SITE_URL=https://example.com
VITE_APP_URL=/app
SITE_URL=https://example.com/app
```

将 `example.com` 替换为实际域名。`VITE_SITE_URL` 同时更新首页分享信息、博客 canonical、sitemap 和 robots.txt；留空时使用 `steadyrenew.com`。`SITE_URL` 是现有付款后端使用的应用站点地址。实际迁移进度和切换顺序见 [域名迁移操作记录](../operations/steadyrenew-domain-migration.md)。

## 可选：自托管使用应用子域名

```dotenv
VITE_SITE_URL=https://example.com
VITE_APP_URL=https://app.example.com/
SITE_URL=https://app.example.com
```

主域名展示 landing page，按钮进入应用子域名。相同代码部署到应用子域名后，会识别 `VITE_APP_URL` 的 origin 并打开应用。两个域名需要实际指向部署；环境变量不会创建 DNS 记录。如果使用同一个 Netlify site，确认域名配置不会把应用子域名强制重定向到主域名。

在应用域名部署原有 Netlify Functions，并为该部署配置现有 Supabase、Stripe 等变量。Supabase Auth 的重定向允许列表应包含新应用域名的 `/app`（包括密码恢复参数），并在过渡期间保留旧域名回调。Stripe 的 `SITE_URL` 应使用应用域名，不能使用 landing page 专用部署。支付回调逻辑不变。

换域名前，在旧域名导出仅保存在本地的 JSON 数据，到新域名导入；同域从 `/` 移到 `/app` 不影响浏览器本地记录。云端用户在新域名重新登录原账户即可同步。

## 本地预览

```bash
npm run dev
```

打开终端给出的地址查看首页，追加 `/app` 查看应用。布局与交互由 `src/components/landing/LandingPage.tsx` 和 `landing.css` 管理；文案在同目录的 `copy.ts` 中。

## 产品截图与品牌

首页复用 `public/icon.png`，字体、颜色和卡片样式沿用应用。Blog、Docs 入口集中放在页脚。连接图展示 SteadyRenew → MCP → Claude / ChatGPT / Gemini，API 在说明中单独介绍。

应用界面更新后，启动 `npm run dev`，运行 `node scripts/capture-landing.mjs`。脚本在隔离浏览器中添加四笔示例记录，使用实际页面和控件，生成中英文、深浅色四张截图。可用 `CAPTURE_ORIGIN` 指定本地服务器地址。

文档链接基址为 `https://steadyrenew.com/docs`，通过 `VITE_DOCS_URL` 可覆盖；URL 拼接保留 `/docs` 路径。文档由 `netlify/edge-functions/docs-proxy.ts` 在 SPA fallback 之前转发至 `subscriptionmanager.mintlify.site`，保留 `/docs` 前缀、查询参数及 HTTP 方法，并禁用代理缓存。`/.well-known/vercel/*` 也转发用于域名验证；根路径的其他机器可读文件继续由应用提供。

文案参考 [Google 的语气指南](https://developers.google.com/style/tone)：使用直接、具体的表达，减少口号和不提供信息的修饰。


## 公开页面 SEO

构建时通过 `scripts/prerender.ts` 渲染实际 LandingPage 组件，直接输出首页与价格页正文。
英文地址为 `/`、`/pricing`，中文地址为 `/zh`、`/zh/pricing`；每页有独立标题、描述和 canonical，并通过 hreflang 互相对应。
`/about` 保留为可绕过应用偏好的主页入口，canonical 指向 `/`。
`/app` 与其他 SPA 路径使用独立的 noindex HTML 外壳。
主 sitemap 包含公开页面与博客；robots.txt 同时声明主 sitemap 和 `/docs/sitemap.xml`。
