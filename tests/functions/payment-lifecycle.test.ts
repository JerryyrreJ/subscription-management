import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import type { User } from '@supabase/supabase-js';
import { reconcilePayment, readCheckoutState } from '../../netlify/functions/_shared/paymentLifecycle.ts';
import { reservePremiumCheckout } from '../../netlify/functions/_shared/premiumCheckout.ts';
import { createCheckoutStatusHandler } from '../../netlify/functions/checkout-status.ts';
import { createStripeWebhookHandler } from '../../netlify/functions/stripe-webhook.ts';
import { paymentStripeFixture, checkoutSessionsFixture, openCheckout, paymentRpcFixture } from './payment-fixtures.ts';
const userId = '11111111-1111-4111-8111-111111111111';
const config = { secretKey: 'sk_test_fixture', webhookSecret: 'whsec_fixture', priceId: 'price_server', siteUrl: 'https://example.test' };
const paid = () => ({ ...openCheckout(), status: 'complete', payment_status: 'paid', payment_intent: 'pi_test', amount_total: 900, currency: 'usd', customer: null } as Stripe.Checkout.Session);
const params: Stripe.Checkout.SessionCreateParams = { mode: 'payment', metadata: { userId, productType: 'premium_lifetime', priceId: 'price_server' }, success_url: 'https://example.test?payment=success&session_id={CHECKOUT_SESSION_ID}' };

for (const [name, refunds, disputes, expected] of [
 ['full refund', [{ id: 're_1', status: 'succeeded', amount: 900 }], [], 'refunded'],
 ['partial refund', [{ id: 're_1', status: 'succeeded', amount: 300 }], [], 'active'],
 ['pending refund', [{ id: 're_1', status: 'pending', amount: 900 }], [], 'active'],
 ['failed refund', [{ id: 're_1', status: 'failed', amount: 900 }], [], 'active'],
 ['formal dispute', [], [{ id: 'du_1', status: 'under_review' }], 'disputed'],
 ['lost dispute', [], [{ id: 'du_1', status: 'lost' }], 'lost'],
 ['won dispute', [], [{ id: 'du_1', status: 'won' }], 'active'],
 ['inquiry', [], [{ id: 'du_1', status: 'warning_closed' }], 'active'],
 ['refund takes precedence over win', [{ id: 're_1', status: 'succeeded', amount: 900 }], [{ id: 'du_1', status: 'won' }], 'refunded'],
] as const) {
 test(name + ' uses current Stripe state', async () => {
  const stripe = { ...paymentStripeFixture,
   refunds: { list: async () => ({ data: refunds as unknown as Stripe.Refund[], has_more: false }) },
   disputes: { list: async () => ({ data: disputes as unknown as Stripe.Dispute[], has_more: false }) },
  };
  assert.equal(await reconcilePayment(stripe, { rpc: async (n, a) => paymentRpcFixture(n, a) }, 'pi_test'), expected);
 });
}

test('successful partial refunds on multiple pages sum to a full refund', async () => {
 const stripe = { ...paymentStripeFixture, refunds: { list: async (p: Stripe.RefundListParams) => ({ data: [{ id: p.starting_after ? 're_2' : 're_1', status: 'succeeded' as const, amount: 450 }], has_more: !p.starting_after }) } };
 assert.equal(await reconcilePayment(stripe, { rpc: async (n,a) => paymentRpcFixture(n,a) }, 'pi_test'), 'refunded');
});

test('refund webhook routes to reconciliation even before checkout fulfillment', async () => {
 const calls: string[] = [];
 const handler = createStripeWebhookHandler(() => ({ stripeConfig: config, supabaseConfig: { url: 'https://example.test', publishableKey: 'p', secretKey: 's' }, createRequestId: () => 'test',
  stripe: { ...paymentStripeFixture, refunds: { list: async () => ({ data: [{ id: 're_1', amount: 900, status: 'succeeded' }], has_more: false }) }, checkout: { sessions: checkoutSessionsFixture }, webhooks: { constructEvent: () => ({ id: 'evt_old', livemode: false, type: 'refund.updated', data: { object: { payment_intent: 'pi_test' } } } as Stripe.Event) } },
  database: { rpc: async (n,a) => { calls.push(n); return paymentRpcFixture(n,a); } },
 }));
 const response = await handler({ httpMethod: 'POST', headers: { 'stripe-signature': 'fixture' }, body: '{}' } as never, {} as never);
 assert.equal(response?.statusCode, 200); assert.deepEqual(calls, ['begin_premium_payment_sync', 'sync_premium_payment_state']);
});

function checkoutHarness(session = openCheckout()) {
 let attempt: { id: string; stripe_session_id: string | null; params: Stripe.Checkout.SessionCreateParams; created_at: string } | undefined;
 let reservations = 0; let creates = 0; let binds = 0;
 const keys = new Set<string>();
 const database = { rpc: async (name: string, args: Record<string, unknown>) => {
  if (name === 'acquire_premium_checkout') {
   attempt ??= { id: `attempt-${++reservations}`, stripe_session_id: null, params: args.p_params as Stripe.Checkout.SessionCreateParams, created_at: new Date().toISOString() };
   return { data: { ...attempt }, error: null };
  }
  if (name === 'attach_premium_checkout' && attempt) { binds++; attempt.stripe_session_id = String(args.p_session_id); }
  if (name === 'finish_premium_checkout') { attempt = undefined; session = openCheckout('cs_new'); }
  return paymentRpcFixture(name,args);
 } };
 const stripe = { ...paymentStripeFixture, checkout: { sessions: { ...checkoutSessionsFixture,
  create: async (_p: Stripe.Checkout.SessionCreateParams, opts?: Stripe.RequestOptions) => { creates++; keys.add(opts?.idempotencyKey ?? ''); return { id: session.id, url: session.url }; },
  retrieve: async () => session,
 } } };
 return { stripe, database, info: () => ({ reservations, creates, binds, keys }), setSession: (s: Stripe.Checkout.Session) => { session = s; } };
}

test('simultaneous tabs reserve one order and use one Stripe idempotency key', async () => {
 const h = checkoutHarness();
 const results = await Promise.all(Array.from({ length: 8 }, () => reservePremiumCheckout(userId, params, h.stripe, h.database)));
 assert.equal(new Set(results.map(r => r.id)).size, 1); assert.equal(h.info().reservations, 1); assert.equal(h.info().keys.size, 1);
});

test('reopening after ten minutes reuses the same session instead of charging twice', async t => {
 t.mock.timers.enable({ apis: ['Date'], now: 599999 });
 const h = checkoutHarness();
 await reservePremiumCheckout(userId, params, h.stripe, h.database);
 t.mock.timers.tick(600002);
 await reservePremiumCheckout(userId, { ...params, customer_email: 'changed@example.test' }, h.stripe, h.database);
 assert.equal(h.info().creates, 1); assert.equal(h.info().reservations, 1);
});

test('paid order reconciles access and returns confirmation instead of a new checkout', async () => {
 const h = checkoutHarness(); await reservePremiumCheckout(userId, params, h.stripe, h.database);
 h.setSession(paid());
 const result = await reservePremiumCheckout(userId, params, h.stripe, h.database);
 assert.match(result.url!, /payment=success/); assert.equal(h.info().creates, 1);
});

test('only a confirmed expired order releases the reservation', async () => {
 const h = checkoutHarness(); await reservePremiumCheckout(userId, params, h.stripe, h.database);
 h.setSession({ ...openCheckout(), status: 'expired' });
 const result = await reservePremiumCheckout(userId, params, h.stripe, h.database);
 assert.equal(result.id, 'cs_new'); assert.equal(h.info().reservations, 2);
});

test('processing payment blocks a second order; failed async payment can retry', async () => {
 const h = checkoutHarness(); await reservePremiumCheckout(userId, params, h.stripe, h.database);
 h.setSession({ ...openCheckout(), status: 'complete', payment_intent: 'pi_test' });
 h.stripe.paymentIntents.retrieve = async () => ({ status: 'processing', amount_received: 0 }) as never;
 assert.match((await reservePremiumCheckout(userId, params, h.stripe, h.database)).url!, /payment=success/);
 assert.equal(h.info().creates, 1);
 h.stripe.paymentIntents.retrieve = async () => ({ status: 'requires_payment_method', amount_received: 0 }) as never;
 assert.equal((await reservePremiumCheckout(userId, params, h.stripe, h.database)).id, 'cs_new');
});

test('unbound old order fails closed after Stripe idempotency retention', async () => {
 let creates = 0;
 const h = checkoutHarness(); h.stripe.checkout.sessions.create = async () => { creates++; throw new Error('must not recreate'); };
 const db = { rpc: async () => ({ data: { id: 'old', params, stripe_session_id: null, created_at: '2020-01-01T00:00:00Z' }, error: null }) };
 await assert.rejects(reservePremiumCheckout(userId, params, h.stripe, db), /support review/); assert.equal(creates, 0);
});

for (const [owner, expected] of [[userId, 200], ['other-account', 404]] as const) {
 test('status endpoint verifies order ownership: ' + owner, async () => {
  let writes = 0;
  const h = checkoutHarness(paid());
  const handler = createCheckoutStatusHandler(() => ({ stripe: h.stripe, priceId: 'price_server', auth: { auth: { getUser: async () => ({ data: { user: { id: owner } as User }, error: null }) } }, database: { rpc: async (n,a) => { writes++; return paymentRpcFixture(n,a); } } }));
  const result = await handler({ httpMethod: 'GET', headers: { authorization: 'Bearer fixture' }, queryStringParameters: { session_id: 'cs_test' } } as never, {} as never);
  assert.equal(result?.statusCode, expected); assert.equal(result?.headers?.['Cache-Control'], 'no-store');
  assert.equal(writes, owner === userId ? 3 : 0);
 });
}

test('unpaid completed session never grants premium', async () => {
 let writes = 0;
 const h = checkoutHarness();
 const session = { ...openCheckout(), status: 'complete', payment_intent: 'pi_test' } as Stripe.Checkout.Session;
 h.stripe.paymentIntents.retrieve = async () => ({ status: 'processing', amount_received: 0 }) as never;
 assert.equal(await readCheckoutState(session, h.stripe, { rpc: async () => { writes++; return { data: true, error: null }; } }, 'price_server'), 'pending');
 assert.equal(writes, 0);
});
