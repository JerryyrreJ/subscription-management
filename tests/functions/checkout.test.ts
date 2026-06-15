import test from 'node:test';
import assert from 'node:assert/strict';
import type { HandlerEvent } from '@netlify/functions';
import type { User } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { createCheckoutHandler } from '../../netlify/functions/create-checkout-session.ts';

const event = (headers: Record<string, string> = {}, body = '{}'): HandlerEvent => ({
 httpMethod: 'POST',
 headers,
 body,
} as unknown as HandlerEvent);

const stripeConfig = {
 secretKey: 'sk_test_server',
 webhookSecret: 'whsec_test',
 priceId: 'price_server',
 siteUrl: 'https://example.test',
};

const authenticatedUser = {
 id: '11111111-1111-4111-8111-111111111111',
 email: 'owner@example.test',
} as unknown as User;

test('premium checkout requires a valid bearer token', async () => {
 let stripeCalled = false;
 const handler = createCheckoutHandler(() => ({
  stripeConfig,
  supabaseConfig: { url: 'https://supabase.test', publishableKey: 'publishable' },
  stripe: {
   checkout: { sessions: { create: async () => {
    stripeCalled = true;
    return { id: 'cs_test', url: 'https://checkout.test' };
   } } },
  },
  createAuthClient: () => ({
   auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
  createRequestId: () => 'request-1',
 }));

 const response = await handler(event(), {} as never);

 assert.equal(response?.statusCode, 401);
 assert.equal(stripeCalled, false);
});

test('premium checkout ignores forged body identity and price', async () => {
 let checkoutParams: unknown;
 const handler = createCheckoutHandler(() => ({
  stripeConfig,
  supabaseConfig: { url: 'https://supabase.test', publishableKey: 'publishable' },
  stripe: {
   checkout: { sessions: { create: async params => {
    checkoutParams = params;
    return { id: 'cs_test', url: 'https://checkout.test' };
   } } },
  },
  createAuthClient: () => ({
   auth: { getUser: async () => ({ data: { user: authenticatedUser }, error: null }) },
  }),
  createRequestId: () => 'request-2',
 }));

 const response = await handler(event(
  { authorization: 'Bearer valid-token' },
  JSON.stringify({ userId: 'attacker', priceId: 'price_attacker' })
 ), {} as never);

 assert.equal(response?.statusCode, 200);
 assert.deepEqual(checkoutParams, {
  line_items: [{ price: 'price_server', quantity: 1 }],
  mode: 'payment',
  success_url: 'https://example.test?payment=success&session_id={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://example.test?payment=cancelled',
  customer_email: 'owner@example.test',
  billing_address_collection: 'auto',
  metadata: {
   userId: authenticatedUser.id,
   productType: 'premium_lifetime',
   priceId: 'price_server',
  },
 });
});

test('self-hosted support checkout permits a guest without Supabase', async () => {
 let checkoutParams: Stripe.Checkout.SessionCreateParams | undefined;
 const handler = createCheckoutHandler(() => ({
  stripeConfig,
  supabaseConfig: null,
  stripe: {
   checkout: { sessions: { create: async params => {
    checkoutParams = params;
    return { id: 'cs_support', url: 'https://checkout.test' };
   } } },
  },
  createAuthClient: () => {
   throw new Error('Auth client should not be created');
  },
  createRequestId: () => 'request-3',
 }));

 const response = await handler(event(), {} as never);

 assert.equal(response?.statusCode, 200);
 assert.deepEqual(checkoutParams?.metadata, {
  userId: 'guest',
  productType: 'support_donation',
  priceId: 'price_server',
 });
});
