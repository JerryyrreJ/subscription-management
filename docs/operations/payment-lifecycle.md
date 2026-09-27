# Payment lifecycle rollout

Premium remains a one-time USD 9 purchase. This change adds durable checkout reservations, server-side payment verification, and entitlement reconciliation for refunds/disputes. It does not issue refunds or submit dispute evidence.

## Deploy order

1. Apply `supabase/migrations/20260927012800_payment_lifecycle.sql` to the deployment's database before deploying the new functions. The new tables and RPCs are server-only; no new environment variables are required. Preserve the existing Stripe and Supabase service credentials.
2. Deploy the frontend and functions together, including `checkout-status`.
3. On the existing Stripe webhook endpoint, enable these events in the correct test/live environment:
   - `checkout.session.completed`, `checkout.session.async_payment_succeeded`
   - `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`
   - `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`
   - `checkout.session.async_payment_failed` may remain subscribed. The confirmation endpoint reads the PaymentIntent's current failure status; this event does not grant access.
4. Transition pre-deployment Checkout sessions: the previous implementation did not save open sessions. Before enabling new checkouts, expire old **open** Premium sessions through Stripe. Review completed-but-processing sessions separately and let them settle before allowing a replacement; they cannot be expired. Do not treat the new reservation table as proof that no legacy order exists.
5. In Stripe test mode, verify successful payment, duplicate tabs, cancel/reopen, delayed failure, full/partial refund, and dispute win/loss. Neither applying the migration nor unit tests verify webhook subscriptions or live credentials.

Existing settled purchases continue to work. Future adjustment events locate them by PaymentIntent. Historical refunds/disputes are not automatically replayed by this migration: reconcile known affected payments by replaying their supported Stripe events (where available), or use the authenticated confirmation flow with the original Checkout session.

## Entitlement policy

- A successful full refund revokes that purchase. Pending/failed refunds and partial refunds do not revoke it.
- Formal dispute `needs_response`/`under_review` suspends that purchase; `lost` revokes it; `won` restores it unless fully refunded. Inquiry/warning states do not suspend access.
- Another valid purchase preserves the account's Premium entitlement.
- Reconciliation reads current Stripe refunds/disputes, including pagination. A database sequence prevents a slow earlier observation from overwriting a later one. The state ledger can precede the checkout completion event, preventing replay-based reactivation.
- Deleted users are not recreated; retained payment ledger rows can still be updated.

## Checkout recovery

Each user has at most one active reservation. Stripe create parameters are frozen on reservation, so retries after an email or deployment change reuse the exact same idempotent request. Open sessions are reused. Paid/processing/disputed sessions return to confirmation. Only confirmed expired, failed, fully refunded, or lost sessions release the reservation.

If Stripe accepted a create request but its response could not be saved, retries use the same key for up to 23 hours. After that, the endpoint deliberately returns `checkout_reconciliation_required` instead of risking another charge after Stripe prunes the key. For recovery, an operator must locate the original request/session in Stripe logs using the key `premium-checkout:<attempt UUID>`, verify the session's `metadata.userId`, and bind its ID with the service-only `attach_premium_checkout` RPC. Never delete a reservation or mark it finished solely because it is old.

The UI queries a server endpoint with a verified access token and session ownership check. Query errors and the 60-second polling timeout expose a retry button without enabling a duplicate charge. Confirmed failure/expiry allows a safe retry through the reservation endpoint. Closing the dialog aborts polling and ignores late responses. A per-account sessionStorage reference also lets cancel/reopen recover the current order.

## Validation

- `npm run check` covers TypeScript, ESLint, application/function tests and production build.
- `supabase/tests/payment_lifecycle.test.sql` runs under the existing `npm run db:verify` CI job. It exercises reservation uniqueness, immutable parameters, refund-before-fulfillment, replay, multiple purchases, dispute reversal, stale observations, deleted users and permissions.
- Local PostgreSQL-engine verification can execute the migration and those assertions against a minimal fixture schema; this does not replace the full Supabase CI stack or Stripe sandbox end-to-end tests.
