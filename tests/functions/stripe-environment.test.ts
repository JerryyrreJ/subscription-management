import test from 'node:test';
import assert from 'node:assert/strict';
import { getStripeServerConfig } from '../../netlify/functions/_shared/env.ts';

const base = {
 STRIPE_SECRET_KEY: 'sk_test_example',
 STRIPE_WEBHOOK_SECRET: 'whsec_example',
 STRIPE_PRICE_ID: 'price_example',
 VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_example',
 SITE_URL: 'https://production.example',
};

test('PR checkout returns to its own preview even with an inherited production URL', () => {
 const config = getStripeServerConfig({ ...base, CONTEXT: 'deploy-preview',
  URL: 'https://production.example', DEPLOY_PRIME_URL: 'https://deploy-preview-23--example.netlify.app/' });
 assert.equal(config.siteUrl, 'https://deploy-preview-23--example.netlify.app');
});

test('preview fails closed when its own URL is unavailable', () => {
 assert.throws(() => getStripeServerConfig({ ...base, CONTEXT: 'deploy-preview' }), /DEPLOY_PRIME_URL/);
});

test('live credentials are rejected in every non-production context', () => {
 for (const CONTEXT of ['deploy-preview', 'branch-deploy', 'dev', 'dev-server']) {
  assert.throws(() => getStripeServerConfig({ ...base, CONTEXT, STRIPE_SECRET_KEY: 'sk_live_example' }), /must use Stripe test/);
 }
});

test('explicit payment mode and browser key must agree with server key', () => {
 assert.throws(() => getStripeServerConfig({ ...base, STRIPE_MODE: 'live' }), /does not match/);
 assert.throws(() => getStripeServerConfig({ ...base, STRIPE_MODE: 'sandbox' }), /test or live/);
 assert.throws(() => getStripeServerConfig({ ...base, VITE_STRIPE_PUBLISHABLE_KEY: 'pk_live_example' }), /modes do not match/);
});

test('production live configuration continues to use the production return URL', () => {
 assert.equal(getStripeServerConfig({ ...base, CONTEXT: 'production', STRIPE_MODE: 'live',
  STRIPE_SECRET_KEY: 'rk_live_example', VITE_STRIPE_PUBLISHABLE_KEY: 'pk_live_example',
  DEPLOY_PRIME_URL: 'https://main--example.netlify.app' }).siteUrl, base.SITE_URL);
});

test('test payments cannot update the configured production database', () => {
 assert.throws(() => getStripeServerConfig({ ...base,
  VITE_SUPABASE_URL: 'https://production.supabase.co/', PRODUCTION_SUPABASE_URL: 'https://production.supabase.co' }), /isolated Supabase/);
 assert.doesNotThrow(() => getStripeServerConfig({ ...base,
  VITE_SUPABASE_URL: 'https://test.supabase.co', PRODUCTION_SUPABASE_URL: 'https://production.supabase.co' }));
});
