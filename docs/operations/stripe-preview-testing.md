# Stripe sandbox on Netlify Deploy Previews

Every PR's Netlify **Deploy Preview** uses the same isolated Stripe sandbox and
Supabase test project. The frontend, checkout creation and checkout confirmation
run on that PR's deployment. Checkout returns to that exact PR URL.

| Component | Production | PR previews |
| --- | --- | --- |
| Website | `https://sub.jerrylu.xyz` | `https://deploy-preview-<PR>--subscription-management.netlify.app` |
| Supabase | `uikhflwvhhgifvbuhebi` | `acoynfyopsgbcfhqhhiv` — Subscription Manager Preview (Free) |
| Stripe | Existing live configuration | `acct_1SJz1UFOZrBrnI1K` — Subscription Manager 沙盒 |
| Price | Existing production Price | `price_1UNVrZFOZrBrnI1KZdsVYp7j` — USD 9, one time |
| Webhook | Existing live endpoint | `https://stripe-sandbox--subscription-management.netlify.app/.netlify/functions/stripe-webhook` |

The shared webhook receiver is a named, non-production Netlify deployment of the
same functions. It uses the `stripe-sandbox` branch environment overrides, which
point to the same test database and sandbox as PR previews. It does not need a
new Stripe endpoint or signing secret for every PR. The receiver's version is
independent of individual PRs: redeploy it when testing changes to webhook logic.
Do not delete this alias while previews are using it.

## Try a payment

1. Open the PR's Netlify preview and visit `/pricing`.
2. Register a new test account with email and password, then sign in. Production
   accounts are separate. Email confirmation is disabled in the test database;
   Google/GitHub OAuth and passkeys require their own test configuration.
3. Choose **Get lifetime Premium**. The app displays a test-payment notice and
   Stripe displays **Sandbox** with a USD 9 total.
4. Choose Card. Use `4242 4242 4242 4242`, any future expiry, any three-digit CVC
   and a test billing name. No real card or money is needed.
5. Stripe returns to the same preview. The app confirms payment with the server
   and shows **Your lifetime pass is active**.

Use `4000 0000 0000 0002` to test a declined card. Cancel/back returns to the
preview and reopening reuses the existing unpaid order. Full sandbox refunds
revoke the purchase; partial refunds preserve Premium.

## Repeatable browser test

The test creates its own account, signs in through the UI, cancels/reopens the
same checkout, verifies a decline, pays with a test card, verifies Premium,
rejects another purchase, issues a sandbox refund and waits for the **real
webhook** to revoke access. It cleans up its generated account and expires or
refunds its own order on failure. It never invokes a real charge.

```sh
npm ci
npx playwright install chromium
E2E_BASE_URL=https://deploy-preview-<PR>--subscription-management.netlify.app npm run test:payments
```

Supply these variables in the shell or the gitignored `.env.preview.local`:

```dotenv
VITE_SUPABASE_URL=https://acoynfyopsgbcfhqhhiv.supabase.co
VITE_SUPABASE_ANON_KEY=<test project anon key>
SUPABASE_SERVICE_ROLE_KEY=<test project service role key>
PRODUCTION_SUPABASE_URL=https://uikhflwvhhgifvbuhebi.supabase.co
STRIPE_SECRET_KEY=<sandbox sk_test key>
```

The test refuses production website hostnames, live Stripe keys and the
production database. It is an explicit integration test, separate from the
offline `npm run check`. Network traces/videos are disabled to avoid retaining
credentials. Success/refund screenshots and failure screenshots are written to
the gitignored `test-results/` directory. Stripe UI changes can require selector
updates; a browser test failure is not a reason to bypass server verification.

## Environment maintenance

Netlify's `deploy-preview` values and `branch:stripe-sandbox` overrides must agree
on `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`,
`VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. Set `STRIPE_MODE=test` and
`PRODUCTION_SUPABASE_URL=https://uikhflwvhhgifvbuhebi.supabase.co` in both.
The sandbox alias also sets `SITE_URL` to its own URL. PR checkouts use Netlify's
`DEPLOY_PRIME_URL`, even if a production `SITE_URL` was inherited.

Keep live secrets scoped to production. General branch deployments and local
development are not automatically converted by this setup. Existing previews
must be rebuilt to receive changed credentials and frontend configuration.

The sandbox webhook subscribes to the events in [payment-lifecycle.md](payment-lifecycle.md),
including asynchronous completion, refunds and disputes. Stripe API version is
`2025-09-30.clover`. Webhook handlers reject events with the wrong test/live mode.

To update the shared webhook receiver, prepare `.env.preview.local` with **all**
preview variables listed above plus `VITE_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MODE=test`, and
`SITE_URL=https://stripe-sandbox--subscription-management.netlify.app`, then run:

```sh
node --env-file=.env.preview.local node_modules/vite/bin/vite.js build
netlify deploy --no-build --alias stripe-sandbox \
  --message "Update sandbox webhook receiver"
```

Build explicitly with the local test credentials: Netlify's CLI cannot read
secret values from the cloud for local builds. Do not add `--prod`.
Apply future migrations explicitly to the **test** Supabase project before
testing code that depends on them. Test users/orders persist across PRs and
must not be copied to production. The test project's initial schema contains
repository migrations through `20260927012800`; migration history is recorded.
