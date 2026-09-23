import test from 'node:test';
import assert from 'node:assert/strict';
import type { HandlerEvent } from '@netlify/functions';
import Stripe from 'stripe';
import { webHandler } from '../../netlify/functions/_shared/webHandler.ts';
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

test('delayed payment is acknowledged unpaid, then fulfilled on async success', async () => {
 const incoming = completedEvent();
 const session = incoming.data.object as Stripe.Checkout.Session;
 session.payment_status = 'unpaid';
 let grants = 0;
 const handler = createStripeWebhookHandler(() => ({
  stripeConfig,
  supabaseConfig: { url: 'https://supabase.test', publishableKey: 'p', secretKey: 's' },
  stripe: {
   webhooks: { constructEvent: () => incoming },
   checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: 'price_server' } }] }) } },
  },
  database: { rpc: async () => { grants++; return { data: true, error: null }; } },
  createRequestId: () => 'delayed-payment',
 }));
 assert.equal((await handler(event(), {} as never))?.statusCode, 200);
 assert.equal(grants, 0);
 incoming.type = 'checkout.session.async_payment_succeeded';
 session.payment_status = 'paid';
 assert.equal((await handler(event(), {} as never))?.statusCode, 200);
 assert.equal(grants, 1);
});

test('base64 encoded webhook body is decoded before signature verification', async () => {
 const request = event();
 request.body = Buffer.from('{"original":"payload"}').toString('base64');
 request.isBase64Encoded = true;
 const handler = createStripeWebhookHandler(() => ({
  stripeConfig, supabaseConfig: null, database: null,
  stripe: {
   webhooks: { constructEvent: body => {
    assert.equal(body, '{"original":"payload"}');
    return { ...completedEvent(), type: 'checkout.session.async_payment_failed' } as Stripe.Event;
   } },
   checkout: { sessions: { listLineItems: async () => ({ data: [] }) } },
  },
  createRequestId: () => 'base64',
 }));
 assert.equal((await handler(request, {} as never))?.statusCode, 200);
});


test('modern Request adapter preserves Stripe signed bytes and rejects tampering', async () => {
 const stripe = new Stripe('sk_test_local_fixture');
 const payload = JSON.stringify(completedEvent(), null, 2);
 const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: stripeConfig.webhookSecret });
 let grants = 0;
 const handler = webHandler(createStripeWebhookHandler(() => ({
  stripeConfig,
  supabaseConfig: { url: 'https://supabase.test', publishableKey: 'p', secretKey: 's' },
  stripe: {
   webhooks: stripe.webhooks,
   checkout: { sessions: { listLineItems: async () => ({ data: [{ price: { id: 'price_server' } }] }) } },
  },
  database: { rpc: async () => { grants++; return { data: true, error: null }; } },
  createRequestId: () => 'signed-request',
 })));
 const request = (body: string) => new Request('https://site.test/.netlify/functions/stripe-webhook', {
  method: 'POST', body, headers: { 'stripe-signature': signature },
 });
 assert.equal((await handler(request(payload))).status, 200);
 assert.equal(grants, 1);
 assert.equal((await handler(request(payload + ' '))).status, 400);
 assert.equal(grants, 1);
});
