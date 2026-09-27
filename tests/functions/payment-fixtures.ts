import type Stripe from 'stripe';
import type { PaymentDatabase } from '../../netlify/functions/_shared/paymentLifecycle';
export const paymentStripeFixture = {
 paymentIntents: { retrieve: async () => ({ status: 'succeeded' as const, amount_received: 900 }) },
 refunds: { list: async () => ({ data: [], has_more: false }) },
 disputes: { list: async () => ({ data: [], has_more: false }) },
 charges: { retrieve: async () => ({ payment_intent: 'pi_test' }) },
};
export const openCheckout = (id = 'cs_test'): Stripe.Checkout.Session => ({
 id, url: 'https://checkout.test', status: 'open', payment_status: 'unpaid', mode: 'payment',
 metadata: { userId: '11111111-1111-4111-8111-111111111111', productType: 'premium_lifetime', priceId: 'price_server' },
} as unknown as Stripe.Checkout.Session);
export const checkoutSessionsFixture = {
 retrieve: async (id: string) => openCheckout(id),
 listLineItems: async () => ({ data: [{ price: { id: 'price_server' } }] }),
};
export function checkoutDatabase(): PaymentDatabase {
 let attempt: Record<string, unknown> | undefined;
 return { rpc: async (name, args) => {
  if (name === 'acquire_premium_checkout') attempt ??= { id: 'reservation-1', params: args.p_params, created_at: new Date().toISOString(), stripe_session_id: null };
  if (name === 'attach_premium_checkout' && attempt) attempt.stripe_session_id = args.p_session_id;
  if (name === 'finish_premium_checkout') attempt = undefined;
  return { data: name === 'acquire_premium_checkout' ? attempt : true, error: null };
 } };
}
export function paymentRpcFixture(name: string, args: Record<string, unknown>) {
 return { data: name === 'begin_premium_payment_sync' ? 1 : name === 'sync_premium_payment_state' ? args.p_state : true, error: null };
}
