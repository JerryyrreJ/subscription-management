import type Stripe from 'stripe';
import { HttpError } from './http';
import { paymentRpc, readCheckoutState, type FulfillmentStripe, type PaymentDatabase } from './paymentLifecycle';

export interface PremiumCheckoutStripe extends FulfillmentStripe {
  checkout: { sessions: FulfillmentStripe['checkout']['sessions'] & {
    retrieve(id: string): Promise<Stripe.Checkout.Session>;
    create(params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions): Promise<{ id: string; url: string | null }>;
  } };
}
interface CheckoutAttempt {
  id: string;
  stripe_session_id: string | null;
  params: Stripe.Checkout.SessionCreateParams;
  created_at: string;
  already_premium?: boolean;
}

export async function reservePremiumCheckout(
  userId: string, params: Stripe.Checkout.SessionCreateParams,
  stripe: PremiumCheckoutStripe, database: PaymentDatabase,
): Promise<{ id: string; url: string | null }> {
  // At most one replacement per request. The DB lock + partial unique index
  // serialize reservations across tabs, instances and arbitrary elapsed time.
  for (let replacement = 0; replacement < 2; replacement++) {
    const attempt = await paymentRpc<CheckoutAttempt>(database, 'acquire_premium_checkout', {
      p_user_id: userId, p_params: params,
    });
    if (attempt.already_premium) throw new HttpError(409, 'already_premium', 'This account already has Premium');
    if (!attempt.stripe_session_id) {
      // Stripe can prune idempotency keys after 24h. Never blindly recreate an
      // unbound reservation after that window (the prior response may be lost).
      if (Date.now() - new Date(attempt.created_at).getTime() >= 23 * 60 * 60 * 1000) {
        throw new HttpError(409, 'checkout_reconciliation_required', 'An earlier checkout needs support review; do not pay again');
      }
      const session = await stripe.checkout.sessions.create(attempt.params, { idempotencyKey: `premium-checkout:${attempt.id}` });
      await paymentRpc(database, 'attach_premium_checkout', { p_attempt_id: attempt.id, p_session_id: session.id });
      // Also retrieve replays: a cached create response may refer to a paid or expired session.
      attempt.stripe_session_id = session.id;
    }
    const session = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id);
    if (session.metadata?.userId !== userId || session.metadata?.productType !== 'premium_lifetime') {
      throw new Error('Checkout reservation owner mismatch');
    }
    const state = await readCheckoutState(session, stripe, database, String(attempt.params.metadata?.priceId));
    if (state === 'open') return { id: session.id, url: session.url };
    if (state === 'expired' || state === 'failed' || state === 'refunded' || state === 'lost') {
      await paymentRpc(database, 'finish_premium_checkout', { p_attempt_id: attempt.id, p_session_id: session.id });
      continue;
    }
    // A completed or processing payment must go to verification, not a new charge.
    return { id: session.id, url: String(attempt.params.success_url).replace('{CHECKOUT_SESSION_ID}', encodeURIComponent(session.id)) };
  }
  throw new HttpError(409, 'checkout_changed', 'Checkout status changed; please retry');
}
