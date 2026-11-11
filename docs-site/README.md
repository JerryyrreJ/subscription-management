# SteadyRenew Docs Site

This directory contains the Mintlify documentation site for SteadyRenew.

## Structure

```text
docs-site/
  docs.json          # Mintlify configuration and bilingual navigation
  api/openapi.yaml   # Generated API Reference source
  en/                # English documentation
  zh-CN/             # Simplified Chinese documentation
```

English and Simplified Chinese pages are maintained side by side. When product behavior, API behavior, configuration, deployment, Supabase, notification, or payment flows change, update both language folders. If API paths, request bodies, response bodies, headers, auth, rate limits, or error formats change, update `api/openapi.yaml` in the same documentation pass.

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
mint validate
```

## Deploy

Create a Mintlify project at `https://mintlify.com/start`, connect this repository, and set the documentation path to `docs-site`.

Do not move the files back into the root unless you also update the Mintlify project path.

## Production subpath

The public documentation URL is `https://steadyrenew.com/docs`. In Mintlify Domain setup, keep `steadyrenew.com/docs` as the custom domain and base path. The repository directory remains `docs-site`.

Keep the root DNS record pointed at Netlify. Add Mintlify's TXT verification records as displayed in its dashboard; do not replace the root CNAME with Mintlify's target.

`netlify/edge-functions/docs-proxy.ts` forwards `/docs`, `/docs/*`, and `/.well-known/vercel/*` to `https://subscriptionmanager.mintlify.site`, ahead of the SPA fallback. It preserves request bodies, status codes, and query strings, rewrites upstream documentation redirects to the public path, and disables intermediary caching. These are public docs: app cookies and authorization headers are not forwarded. Private Mintlify authentication would require a separate design.

After deploying the Netlify site, verify both language pages, CSS/JS loading, search, `/docs/llms.txt`, and a missing-page 404. Source: [Mintlify reverse proxy guide](https://www.mintlify.com/docs/deploy/reverse-proxy).

## Refresh product media

README and the documentation share `images/product/`. After a branding or UI change:

```bash
npx playwright install chromium
# Capture the public app with synthetic local-only data in an isolated browser.
CAPTURE_ORIGIN=https://steadyrenew.com node scripts/capture-docs.mjs
# Render current PDF components and print CSS (requires Poppler).
npx tsx --tsconfig tsconfig.app.json scripts/render-pdf-previews.ts
```

The capture script requires FFmpeg and produces `dashboard-overview.png` and
`dashboard-tour.mp4`. It demonstrates monthly/yearly totals; it does not claim to
exercise AI extraction. For local UI changes, run Vite and set `CAPTURE_ORIGIN` to
its URL. The PDF fixture uses a fixed date and illustrative exchange rates for
repeatable output; previews show the first page of each report. Inspect all pages
of `/tmp/pdf-report-previews/{snapshot,annual}.pdf` when changing print layout.

Publish documentation assets before checking the README video link at
`https://steadyrenew.com/docs/images/product/dashboard-tour.mp4`. The old GitHub
attachment is no longer used. The legacy `ai-add-subscription.mp4` is retained as
historical source media, not embedded as a current demo. The iPhone notification
photo in the reminders guide is explicitly labeled as an earlier-version capture
and needs a fresh device capture to replace it.
