# Deployment

[English](deployment.md) | [简体中文](../zh-CN/deployment.md)

The project is configured for Netlify, but the frontend can be hosted anywhere that supports a Vite static build.

## Static Frontend

Build the app:

```bash
npm run build
```

The production output is written to `dist/`.

## Netlify

`netlify.toml` defines:

- `npm run build` as the build command
- `dist` as the publish directory
- `netlify/functions` as the functions directory
- static `/blog` and `/zh/blog` rewrites (so unknown guide slugs 404 instead of the SPA shell)
- SPA redirects to `index.html`
- basic security headers

Public guides are Markdown in `content/blog/`, compiled to `dist/blog/` and `dist/zh/blog/` during `vite build`. Canonical URLs, `robots.txt`, and `sitemap.xml` use `https://steadyrenew.com`. See [Public guides](blog.md).

Bing Webmaster verification is the static file `/BingSiteAuth.xml` plus a `msvalidate.01` meta tag on the main HTML shell and the blog shell. IndexNow key file is `/16274743d7549a346d2cf33abbd2d73d.txt`. `npm run indexnow` submits URLs from the built sitemaps (or the live sitemap URLs when a built file is absent). Netlify runs that script after a successful production deploy; a failure is logged and does not fail the deploy. The SPA fallback is unforced, and both files have explicit `Content-Type` headers, so redirects and edge functions do not replace them.

## Functions

Netlify Functions are used for:

- Creating Stripe Checkout sessions
- Handling Stripe webhooks
- Running scheduled Bark reminder checks

Use Netlify Dev for local function testing:

```bash
npm run dev:full
```

## Deployment Checklist

- Add only the environment variables for services you plan to enable.
- Run Supabase SQL migrations before enabling cloud sync or scheduled notifications.
- Configure Stripe webhook URLs after the Netlify site URL is available.
- Test local-first behavior with no optional variables configured.
- Test hosted behavior with Supabase, Stripe, and notification settings enabled as needed.
