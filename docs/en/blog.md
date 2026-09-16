# Public guides (`/blog`)

[English](blog.md) | [简体中文](../zh-CN/blog.md)

The product site is a React SPA, but `/blog` is a **static HTML content hub** generated at build time from Markdown. Crawlers receive real HTML. Canonical URLs always use `https://sub.jerrylu.xyz` (not a `*.netlify.app` alias).

English guides live at `/blog/…`. Chinese guides live at `/zh/blog/…`. There is no `/en` prefix.

## URLs

| Path | Source |
| --- | --- |
| `/blog` | Index of English posts in `content/blog/` (`lang: en`) |
| `/blog/<slug>` | English `content/blog/<slug>.md` |
| `/zh/blog` | Index of Chinese posts (`lang: zh`) |
| `/zh/blog/<slug>` | Chinese `content/blog/<slug>.md` |
| `/sitemap.xml` | Home + both indexes + every post |
| `/robots.txt` | Points at the canonical sitemap |

The app footer (visible without signing in) links to `/blog` or `/zh/blog` based on the UI language. Article CTAs link back to `/`.

These Chinese and English posts are **separate pages**, not language toggles of the same URL. Do not add `hreflang` unless two pages are true localized equivalents.

## Add a post

1. Copy `content/blog/how-to-do-a-subscription-audit.md` (English) or `content/blog/how-to-cancel-auto-renew.md` (Chinese).
2. Name the file `<slug>.md`. The `slug` in frontmatter **must** match the filename.
3. Fill frontmatter:

```yaml
---
title: Your title
slug: your-slug
description: One or two sentences for search snippets.
date: YYYY-MM-DD
status: draft
lang: en
---
```

Use `lang: zh` for a Chinese post. The public path becomes `/zh/blog/<slug>` instead of `/blog/<slug>`.

4. Write Markdown (headings, lists, tables, links). Use `status: draft` until the finished draft is ready — the page stays public and shows a draft banner. Switch to `status: published` to drop the banner.
5. Run `npm run dev` and open `http://localhost:5173/blog/<slug>` or `http://localhost:5173/zh/blog/<slug>`.
6. Keep claims honest: no bank-scrape / auto-cancel / bill-negotiation product claims. Soft CTA to `/` only after the how-to stands alone.

Rebuild (`npm run build`) emits `dist/blog/<slug>/index.html` or `dist/zh/blog/<slug>/index.html`. Netlify serves those files before the SPA fallback.

## Soft CTA rules

- Do not mention Subscription Manager in the intro before the checklist works without the product.
- Link CTAs to `https://sub.jerrylu.xyz/` (path `/`).
- Do not claim the app auto-detects charges from a bank, cancels merchants, or negotiates bills.
