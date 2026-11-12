# Google OAuth: public legal pages

The hosted app has bilingual pages at `/privacy`, `/terms`, `/zh/privacy`, and
`/zh/terms`. They are rendered to static HTML during `npm run build`, with links
from the homepage, app footer, and sign-in dialog.

## Contact configuration & self-hosted forks

The hosted app configures `legalContact` (`SteadyRenew` / `jerryno153@gmail.com`) in
`src/components/legal/content.ts`, allowing `/privacy`, `/terms`, `/zh/privacy`,
and `/zh/terms` to render without a draft banner and with `index, follow` robots
metadata. Self-hosted forks should replace `legalContact` with their own operator
identity and support/privacy email (leaving `email` empty intentionally displays a
draft notice and emits `noindex`). Confirm provider configuration and retention
practices against `src/components/legal/content.ts` before publishing; do not
promise a specific retention period, data residency, refund window, or legal
jurisdiction without verifying it. Review these commitments when integrations or
Google scopes change.

## Google Auth Platform branding

After deployment, confirm the following URLs work in a signed-out browser:

- Application home page: `https://steadyrenew.com/`
- Privacy policy: `https://steadyrenew.com/privacy`
- Terms of service: `https://steadyrenew.com/terms`
- Authorized domain: `steadyrenew.com` (verify ownership as Google requests).

Use `SteadyRenew` as the app name and a monitored support email. In Data Access,
verify the actual requested permissions are only basic sign-in (`openid`, email,
profile); the application code does not request Gmail, Drive, or Calendar scopes.
Check the Supabase Google provider configuration too. The OAuth redirect URI is
the exact Supabase callback shown in that project's provider setup, not the legal
page URL or `/app`. The application redirect remains `https://steadyrenew.com/app`
in Supabase's allow list.

A privacy policy is required for branding verification; terms are optional in
Google's checklist but useful for the hosted paid service. Sensitive/restricted
scope verification is a separate process if additional scopes are introduced.
No Google console settings are changed by this code update.

Source: [Google OAuth brand verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
