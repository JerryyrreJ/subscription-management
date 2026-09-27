import type Stripe from 'stripe';
import { HttpError } from './http';

export interface PaymentDatabase {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown; error: { message: string; code?: string } | null;
  }>;
}
export interface PaymentStateStripe {
  paymentIntents: { retrieve(id: string): Promise<Pick<Stripe.PaymentIntent, 'status' | 'amount_received'>> };
  refunds: { list(params: Stripe.RefundListParams): Promise<{ data: Pick<Stripe.Refund, 'id' | 'status' | 'amount'>[]; has_more: boolean }> };
  disputes: { list(params: Stripe.DisputeListParams): Promise<{ data: Pick<Stripe.Dispute, 'id' | 'status'>[]; has_more: boolean }> };
}
export type PaymentState = 'active' | 'refunded' | 'disputed' | 'lost';
export const referenceId = (value: string | { id: string } | null): string | null =>
  typeof value === 'string' ? value : value?.id ?? null;

export async function paymentRpc<T>(database: PaymentDatabase, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await database.rpc(name, args);
  if (error) throw new Error(`Payment transaction failed: ${name} (${error.code ?? 'database_error'})`);
  return data as T;
}

// Read current Stripe state, not the webhook snapshot: events can arrive out of order.
// Allocate a database sequence before reading, independent of server clock skew.
export async function reconcilePayment(
  stripe: PaymentStateStripe, database: PaymentDatabase, paymentIntentId: string,
): Promise<PaymentState> {
  const version = await paymentRpc<number>(database, 'begin_premium_payment_sync', {});
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  let refunded = 0;
  let cursor: string | undefined;
  do {
    const page = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100, starting_after: cursor });
    refunded += page.data.filter(r => r.status === 'succeeded').reduce((sum, r) => sum + r.amount, 0);
    cursor = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (cursor);
  let disputed = false;
  let lost = false;
  do {
    const page = await stripe.disputes.list({ payment_intent: paymentIntentId, limit: 100, starting_after: cursor });
    disputed ||= page.data.some(d => d.status === 'needs_response' || d.status === 'under_review');
    lost ||= page.data.some(d => d.status === 'lost');
    cursor = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (cursor);
  const state: PaymentState = intent.amount_received > 0 && refunded >= intent.amount_received
    ? 'refunded' : lost ? 'lost' : disputed ? 'disputed' : 'active';
  return paymentRpc<PaymentState>(database, 'sync_premium_payment_state', {
    p_payment_intent_id: paymentIntentId, p_state: state, p_version: version,
  });
}

export interface FulfillmentStripe extends PaymentStateStripe {
  checkout: { sessions: {
    listLineItems(id: string, params: { limit: number }): Promise<{ data: Array<{ price?: { id: string } | null }> }>;
  } };
}

export async function fulfillPremiumCheckout(
  session: Stripe.Checkout.Session, stripe: FulfillmentStripe, database: PaymentDatabase,
  expectedPriceId: string, source: string,
): Promise<PaymentState> {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') {
    throw new HttpError(409, 'payment_pending', 'Payment is not complete');
  }
  const metadata = session.metadata;
  if (metadata?.productType !== 'premium_lifetime' || !metadata.userId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metadata.userId) ||
      metadata.priceId !== expectedPriceId) {
    throw new HttpError(400, 'invalid_checkout_metadata', 'Checkout session metadata is invalid');
  }
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
  if (items.data[0]?.price?.id !== expectedPriceId) {
    throw new HttpError(400, 'unexpected_price', 'Checkout session price does not match configured product');
  }
  const intentId = referenceId(session.payment_intent);
  if (!intentId) throw new Error('Paid Checkout session has no payment intent');
  const state = await reconcilePayment(stripe, database, intentId);
  await paymentRpc(database, 'complete_premium_purchase', {
    purchase_user_id: metadata.userId,
    purchase_stripe_session_id: session.id,
    purchase_payment_intent_id: intentId,
    purchase_customer_id: referenceId(session.customer),
    purchase_price_id: expectedPriceId,
    purchase_amount_total: session.amount_total ?? 0,
    purchase_currency: session.currency ?? 'usd',
    purchase_customer_email: session.customer_details?.email || session.customer_email,
    purchase_metadata: { source, payment_status: session.payment_status, checkout_created_at: session.created },
  });
  return state;
}

export type CheckoutState = PaymentState | 'pending' | 'open' | 'failed' | 'expired';
export async function readCheckoutState(
  session: Stripe.Checkout.Session, stripe: FulfillmentStripe, database: PaymentDatabase, priceId: string,
): Promise<CheckoutState> {
  if (session.payment_status === 'paid') return fulfillPremiumCheckout(session, stripe, database, priceId, 'status_check');
  if (session.status === 'expired') return 'expired';
  if (session.status === 'open') return 'open';
  const intentId = referenceId(session.payment_intent);
  if (intentId) {
    const intent = await stripe.paymentIntents.retrieve(intentId);
    if (intent.status === 'canceled' || intent.status === 'requires_payment_method') return 'failed';
  }
  return 'pending';
}
