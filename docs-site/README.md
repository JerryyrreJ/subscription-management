# SteadyRenew Docs Site

This directory is the canonical Mintlify documentation site for SteadyRenew, published at `https://steadyrenew.com/docs`.

## Structure

```text
docs-site/
  docs.json          # Mintlify configuration and bilingual navigation
  api/openapi.yaml   # OpenAPI 3.1 spec (drives API Reference + /agent/openapi.yaml)
  api/ai-tools.json  # Canonical 11-tool schema (drives MCP + /agent/ai-tools.json)
  en/                # English documentation
  zh-CN/             # Simplified Chinese documentation
```

English and Simplified Chinese pages are maintained side by side. When product behavior, API/MCP behavior, configuration, deployment, Supabase, notification, or payment flows change, update both language folders. If API paths, request/response schemas, rate limits, or tool semantics change, update `api/openapi.yaml` and `api/ai-tools.json` in the same pass.

## Local preview

```bash
npm i -g mint
cd docs-site
mint dev
```

Open `http://localhost:3000`.

## Validate

```bash
cd docs-site
mint broken-links
mint validate
```

## Production subpath & Edge proxy

The public documentation URL is `https://steadyrenew.com/docs`. In Mintlify Domain setup, keep `steadyrenew.com/docs` as the custom domain and base path while keeping root DNS pointed at Netlify (adding only Mintlify's TXT verification records).

`netlify/edge-functions/docs-proxy.ts` forwards `/docs`, `/docs/*`, and `/.well-known/vercel/*` to `https://subscriptionmanager.mintlify.site` (overrideable via `MINTLIFY_UPSTREAM_ORIGIN`) ahead of the SPA fallback:

- Rewrites legacy `docs.sub.jerrylu.xyz` and `sub.jerrylu.xyz/docs` requests with `301` redirects to `https://steadyrenew.com/docs`.
- Caches hashed Mintlify bundles (`/docs/_next/static/*`) with `public, max-age=31536000, immutable` and static docs media (`/docs/images/*`, `/docs/logo/*`, `/docs/favicon.*`) with `stale-while-revalidate`, while keeping HTML pages and dynamic routes `no-store`.
- Strips app cookies and `Authorization` headers before forwarding upstream.

After deploying, verify both language tabs, CSS/JS asset caching, search, `/docs/llms.txt`, and a missing-page `404`.

## Refresh product media

`README*.md` and `docs-site/` share `docs-site/images/product/`. After a branding or UI change:

```bash
npx playwright install chromium
# Capture the public app with synthetic local-only data in an isolated browser (requires FFmpeg).
CAPTURE_ORIGIN=https://steadyrenew.com node scripts/capture-docs.mjs
# Render current PDF components and print CSS (requires Poppler).
npx tsx --tsconfig tsconfig.app.json scripts/render-pdf-previews.ts
```

`capture-docs.mjs` updates `dashboard-overview.png` and `dashboard-tour.mp4` (embedded on `en/index.mdx` and `zh-CN/index.mdx`). Inspect all pages of `/tmp/pdf-report-previews/{snapshot,annual}.pdf` when changing print layout. The iPhone notification photo in the reminders guide (`images/guides/bark-guide-04-test-received.jpg`) is labeled as an earlier-version capture until replaced by a fresh device photo.
