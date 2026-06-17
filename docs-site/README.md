# Subscription Manager Docs Site

This directory contains the Mintlify documentation site for Subscription Manager.

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
