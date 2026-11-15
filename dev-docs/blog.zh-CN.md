# 公开指南（`/blog`）

[English](blog.en.md) | [简体中文](blog.zh-CN.md)

产品站点是 React SPA，但 `/blog` 是构建时从 Markdown **生成的静态 HTML**。爬虫拿到的是完整 HTML。Canonical 一律使用 `https://steadyrenew.com`（不要用 `*.netlify.app` 别名）。

英文指南在 `/blog/…`。中文指南在 `/zh/blog/…`。英文不需要 `/en` 前缀。

## URL

| 路径 | 来源 |
| --- | --- |
| `/blog` | `content/blog/` 中 `lang: en` 的文章索引 |
| `/blog/<slug>` | 英文 `content/blog/<slug>.md` |
| `/zh/blog` | `lang: zh` 的中文文章索引 |
| `/zh/blog/<slug>` | 中文 `content/blog/<slug>.md` |
| `/sitemap.xml` | 首页 + 两个索引 + 每篇文章 |
| `/robots.txt` | 指向 canonical sitemap |

应用页脚（无需登录）会按界面语言链到 `/blog` 或 `/zh/blog`。正文中的软 CTA 与文末自动渲染的场景化 CTA 卡片（`<aside class="cta">`）统一链回 `/app`（并附带轻量 `?ref=blog-<slug>` / `?ref=zh-blog-<slug>` 来源标识用于 Stripe Checkout 归因）。

中英文是**独立页面**，不是同一 URL 切语言。除非两篇是真正的对应译本，否则不要加 `hreflang`。

## 新增一篇文章

1. 复制 `content/blog/how-to-do-a-subscription-audit.md`（英文）或 `content/blog/how-to-cancel-auto-renew.md`（中文）。
2. 文件名用 `<slug>.md`。frontmatter 里的 `slug` **必须**和文件名一致。
3. 填写 frontmatter：

```yaml
---
title: 标题
slug: your-slug
description: 一两句搜索摘要。
date: YYYY-MM-DD
status: draft
lang: zh
cluster: audit-cleanup # 可选: audit-cleanup | trials-refunds | no-bank-alternatives | multi-currency-ai | mcp-automation
cta: audit # 可选: audit | trial | alternative | multi-currency | mcp | none
---
```

中文稿使用 `lang: zh`，公开路径是 `/zh/blog/<slug>`，不是 `/blog/<slug>`。`cluster` 用于在文末自动补充同语言、同主题簇且正文未重复链接的指南卡片，避免出现孤岛页；`cta` 默认按 `cluster` 自动选择，也可显式指定或设为 `none` 关闭自动 CTA 卡片。

4. 写 Markdown（标题、列表、表格、链接）。成品完成前用 `status: draft`——页面仍然公开，并显示草稿横幅。改成 `status: published` 后横幅消失。
5. 运行 `npm run dev`，打开 `http://localhost:5173/blog/<slug>` 或 `http://localhost:5173/zh/blog/<slug>`。
6. 表述要诚实：不要声称产品会银行抓取、代为取消或账单议价。正文软 CTA 指向 `https://steadyrenew.com/app`，且放在读者能独立做完 how-to 之后。

`npm run build` 会生成 `dist/blog/<slug>/index.html` 或 `dist/zh/blog/<slug>/index.html`。Netlify 会在 SPA 回退之前提供这些静态文件。

## 软 CTA 规则

- 在清单本身可独立完成之前，不要在导语里提 SteadyRenew。
- CTA 链到 `https://steadyrenew.com/app`（构建期会在 FAQ 前自动插入带 `?ref=` 归因的 `<aside class="cta">` 卡片）。
- 不要声称应用会从银行自动发现扣款、替用户取消商家，或代为议价。
