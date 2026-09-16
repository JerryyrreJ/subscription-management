# 公开指南（`/blog`）

[English](../en/blog.md) | [简体中文](blog.md)

产品站点是 React SPA，但 `/blog` 是构建时从 Markdown **生成的静态 HTML**。爬虫拿到的是完整 HTML。Canonical 一律使用 `https://sub.jerrylu.xyz`（不要用 `*.netlify.app` 别名）。

## URL

| 路径 | 来源 |
| --- | --- |
| `/blog` | `content/blog/` 中的文章索引 |
| `/blog/<slug>` | `content/blog/<slug>.md` |
| `/sitemap.xml` | 首页 + `/blog` + 每篇文章 |
| `/robots.txt` | 指向 canonical sitemap |

应用页脚（无需登录）链到 `/blog`。文章里的软 CTA 链回 `/`。

## 新增一篇文章

1. 复制 `content/blog/how-to-do-a-subscription-audit.md`。
2. 文件名用 `<slug>.md`。frontmatter 里的 `slug` **必须**和文件名一致。
3. 填写 frontmatter：

```yaml
---
title: 标题
slug: your-slug
description: 一两句搜索摘要。
date: YYYY-MM-DD
status: draft
lang: en
---
```

4. 写 Markdown（标题、列表、表格、链接）。成品完成前用 `status: draft`——页面仍然公开，并显示草稿横幅。改成 `status: published` 后横幅消失。
5. 运行 `npm run dev`，打开 `http://localhost:5173/blog/<slug>`。
6. 表述要诚实：不要声称产品会银行抓取、代为取消或账单议价。软 CTA 指向 `/`，且放在读者能独立做完 how-to 之后。

`npm run build` 会生成 `dist/blog/<slug>/index.html`。Netlify 会在 SPA 回退之前提供这些静态文件。

## 软 CTA 规则

- 在清单本身可独立完成之前，不要在导语里提 Subscription Manager。
- CTA 链到 `https://sub.jerrylu.xyz/`（路径 `/`）。
- 不要声称应用会从银行自动发现扣款、替用户取消商家，或代为议价。
