# Public guides (`/blog`)

[English](blog.en.md) | [简体中文](blog.zh-CN.md)

The product site is a React SPA, but `/blog` is a **static HTML content hub** generated at build time from Markdown. Crawlers receive real HTML. Canonical URLs always use `https://steadyrenew.com` (not a `*.netlify.app` alias).

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

The app footer (visible without signing in) links to `/blog` or `/zh/blog` based on the UI language. In-prose soft CTAs and the build-time contextual CTA card (`<aside class="cta">`) link to `/app` (with lightweight `?ref=blog-<slug>` / `?ref=zh-blog-<slug>` attribution for Stripe Checkout metadata).

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
cluster: audit-cleanup # optional: audit-cleanup | trials-refunds | no-bank-alternatives | multi-currency-ai | mcp-automation
cta: audit # optional: audit | trial | alternative | multi-currency | mcp | none
---
```

Use `lang: zh` for a Chinese post. The public path becomes `/zh/blog/<slug>` instead of `/blog/<slug>`. `cluster` automatically appends unlinked same-language guides in the same topic cluster at the bottom of the article to prevent orphan pages; `cta` defaults from `cluster` or can be overridden (set `cta: none` to suppress the card).

4. Write Markdown (headings, lists, tables, links). Use `status: draft` until the finished draft is ready — the page stays public and shows a draft banner. Switch to `status: published` to drop the banner.
5. Run `npm run dev` and open `http://localhost:5173/blog/<slug>` or `http://localhost:5173/zh/blog/<slug>`.
6. Keep claims honest: no bank-scrape / auto-cancel / bill-negotiation product claims. Soft CTA to `/app` only after the how-to stands alone.

Rebuild (`npm run build`) emits `dist/blog/<slug>/index.html` or `dist/zh/blog/<slug>/index.html`. Netlify serves those files before the SPA fallback.

## Soft CTA rules

- Do not mention SteadyRenew in the intro before the checklist works without the product.
- Link CTAs to `https://steadyrenew.com/app` (the renderer automatically injects an `<aside class="cta">` card with `?ref=` attribution before the FAQ section).
- Do not claim the app auto-detects charges from a bank, cancels merchants, or negotiates bills.
