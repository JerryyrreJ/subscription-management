import test from 'node:test';
import assert from 'node:assert/strict';
import type { HandlerEvent } from '@netlify/functions';
import type Stripe from 'stripe';
import { createStripeWebhookHandler } from '../../netlify/functions/stripe-webhook.ts';

const stripeConfig = {
 secretKey: 'sk_test_server',
 webhookSecret: 'whsec_test',
 priceId: 'price_server',
 siteUrl: 'https://example.test',
};

const event = (): HandlerEvent => ({
 httpMethod: 'POST',
 headers: { 'stripe-signature': 'signature' },
 body: '{}',
} as unknown as HandlerEvent);

const completedEvent = (): Stripe.Event => ({
 id: 'evt_test',
 type: 'checkout.session.completed',
 data: {
  object: {
   id: 'cs_test',
   mode: 'payment',
   payment_status: 'paid',
   amount_total: 600,
   currency: 'usd',
   created: 1,
   customer: 'cus_test',
   payment_intent: 'pi_test',
   customer_email: 'owner@example.test',
   customer_details: null,
   metadata: {
    userId: '11111111-1111-4111-8111-111111111111',
    productType: 'premium_lifetime',
    priceId: 'price_server',
   },
  },
 },
} as unknown as Stripe.Event);

test('webhook rejects an invalid Stripe signature', async () => {
 const handler = createStripeWebhookHandler(() => ({
  stripeConfig,
  supabaseConfig: null,
  stripe: {
   webhooks: { constructEvent: () => { throw new Error('bad signature'); } },
   checkout: { sessions: { listLineItems: async () => ({ data: [] }) } },
  },
  database: null,
  createRequestId: () => 'request-1',
 }));

 const response = await handler(event(), {} as never);
 assert.equal(response?.statusCode, 400);
 assert.match(response?.body || '', /invalid_webhook_signature/);
});

test('webhook rejects a checkout using an unexpected price', async () => {
 let rpcCalled = false;
 const handler = createStripeWebhookHandler(() => ({
  stripeConfig,
  supabaseConfig: {
   url: 'https://supabase.test',
   publishableKey: 'publishable',
   secretKey: 'secret',
  },
  stripe: {
   webhooks: { constructEvent: () => completedEvent() },
   checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: 'price_other' } }] }) } },
  },
  database: { rpc: async () => {
   rpcCalled = true;
   return { data: null, error: null };
  } },
  createRequestId: () => 'request-2',
 }));

 const response = await handler(event(), {} as never);
 assert.equal(response?.statusCode, 400);
 assert.equal(rpcCalled, false);
});

test('webhook sends trusted purchase data to the premium transaction RPC', async () => {
 let rpcArgs: Record<string, unknown> | undefined;
 const handler = createStripeWebhookHandler(() => ({
  stripeConfig,
  supabaseConfig: {
   url: 'https://supabase.test',
   publishableKey: 'publishable',
   secretKey: 'secret',
  },
  stripe: {
   webhooks: { constructEvent: () => completedEvent() },
   checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: 'price_server' } }] }) } },
  },
  database: { rpc: async (_name, args) => {
   rpcArgs = args;
   return { data: true, error: null };
  } },
  createRequestId: () => 'request-3',
 }));

 const response = await handler(event(), {} as never);

 assert.equal(response?.statusCode, 200);
 assert.equal(rpcArgs?.purchase_user_id, '11111111-1111-4111-8111-111111111111');
 assert.equal(rpcArgs?.purchase_price_id, 'price_server');
 assert.equal(rpcArgs?.purchase_stripe_session_id, 'cs_test');
});

test('webhook returns 500 so Stripe retries when the premium transaction fails', async () => {
 const handler = createStripeWebhookHandler(() => ({
  stripeConfig,
  supabaseConfig: {
   url: 'https://supabase.test',
   publishableKey: 'publishable',
   secretKey: 'secret',
  },
  stripe: {
   webhooks: { constructEvent: () => completedEvent() },
   checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: 'price_server' } }] }) } },
  },
  database: { rpc: async () => ({
   data: null,
   error: { message: 'temporarily unavailable', code: 'PGRST500' },
  }) },
  createRequestId: () => 'request-4',
 }));

 const response = await handler(event(), {} as never);
 assert.equal(response?.statusCode, 500);
});
