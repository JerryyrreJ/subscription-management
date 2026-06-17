# Subscription Manager Docs Site

This directory contains the Mintlify documentation site for Subscription Manager.

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
