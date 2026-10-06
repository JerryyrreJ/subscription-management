import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';

const required = (name: string) => {
 const value = process.env[name];
 if (!value) throw new Error(`Set ${name} before running the Stripe sandbox test`);
 return value;
};

test('preview checkout: cancel, reuse, decline, pay, activate, refund', async ({ page, request }, testInfo) => {
 const baseUrl = new URL(required('E2E_BASE_URL')).origin;
 const hostname = new URL(baseUrl).hostname;
 expect(hostname).toMatch(/^(deploy-preview-\d+|stripe-sandbox)--[a-z0-9-]+\.netlify\.app$/);
 const secret = required('STRIPE_SECRET_KEY');
 expect(secret).toMatch(/^(sk|rk)_test_/);
 const databaseUrl = new URL(required('VITE_SUPABASE_URL')).origin;
 expect(databaseUrl).not.toBe(new URL(required('PRODUCTION_SUPABASE_URL')).origin);
 const stripe = new Stripe(secret, { apiVersion: '2025-09-30.clover' });
 const admin = createClient(databaseUrl, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
 });
 const auth = createClient(databaseUrl, required('VITE_SUPABASE_ANON_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
 });
 const email = `stripe-e2e-${randomUUID()}@example.test`;
 const password = `${randomUUID()}Aa1!`;
 const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
 if (error) throw error;
 const userId = created.user.id;
 let checkoutId: string | undefined;
 let refunded = false;
 const premium = async () => {
  const { data, error: profileError } = await admin.from('user_profiles').select('is_premium').eq('user_id', userId).single();
  if (profileError) throw profileError;
  return data.is_premium;
 };
 try {
  const login = await auth.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const headers = { Authorization: `Bearer ${login.data.session.access_token}` };
  await page.goto(`${baseUrl}/pricing`);
  await page.getByRole('button', { name: 'Sign in to get Premium', exact: true }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/create-checkout-session'));
  await page.getByRole('button', { name: 'Get lifetime Premium', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  checkoutId = (await response.json()).sessionId;
  expect(checkoutId).toMatch(/^cs_test_/);
  const session = await stripe.checkout.sessions.retrieve(checkoutId!);
  expect(session.livemode).toBe(false);
  expect(session.amount_total).toBe(900);
  expect(new URL(session.success_url!).origin).toBe(baseUrl);
  expect(new URL(session.cancel_url!).origin).toBe(baseUrl);
  await page.waitForURL('https://checkout.stripe.com/**');
  await expect(page.getByText('Sandbox', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /^Back to / }).click();
  await expect(page).toHaveURL(`${baseUrl}/?payment=cancelled`);
  await expect.poll(premium).toBe(false);
  // Cancelling/reopening must return the same reserved session, never a new charge.
  const retry = await request.post(`${baseUrl}/.netlify/functions/create-checkout-session`, { headers, data: {} });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).sessionId).toBe(checkoutId);
  await page.getByRole('button', { name: 'Get lifetime Premium', exact: true }).click();
  await page.waitForURL('https://checkout.stripe.com/**');
  // Stripe's accordion uses a transparent button over the visible Card label.
  await page.getByText('Card', { exact: true }).click({ force: true });
  await page.locator('#cardNumber').fill('4000000000000002');
  await page.locator('#cardExpiry').fill('1235');
  await page.locator('#cardCvc').fill('123');
  await page.locator('#billingName').fill('Sandbox Test');
  await page.locator('#billingCountry').selectOption('HK');
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(/Your card was declined/)).toBeVisible();
  expect(await premium()).toBe(false);
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => url.origin === baseUrl && url.searchParams.get('payment') === 'success', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Your lifetime pass is active', exact: true })).toBeVisible({ timeout: 60_000 });
  expect(await premium()).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('premium-active.png'), fullPage: true });
  const duplicate = await request.post(`${baseUrl}/.netlify/functions/create-checkout-session`, { headers, data: {} });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).error.code).toBe('already_premium');

  const paid = await stripe.checkout.sessions.retrieve(checkoutId!);
  expect(paid.payment_status).toBe('paid');
  const paymentIntent = typeof paid.payment_intent === 'string' ? paid.payment_intent : paid.payment_intent!.id;
  await stripe.refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: `preview-e2e-refund:${checkoutId}` });
  refunded = true;
  // Do not call checkout-status here: only a real Stripe webhook can revoke access.
  await expect.poll(premium, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBe(false);
  await page.reload();
  await expect(page.getByText('This payment was fully refunded.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('premium-refunded.png'), fullPage: true });
 } finally {
  // Keep failed runs from leaving open checkouts or test Premium grants behind.
  // All mutations are restricted to this run's sandbox order and generated user.
  try {
   if (checkoutId) {
    const session = await stripe.checkout.sessions.retrieve(checkoutId);
    if (session.status === 'open') await stripe.checkout.sessions.expire(checkoutId);
    if (session.payment_status === 'paid' && !refunded && typeof session.payment_intent === 'string') {
     await stripe.refunds.create({ payment_intent: session.payment_intent }, { idempotencyKey: `preview-e2e-refund:${checkoutId}` });
    }
   }
  } finally {
   const deleted = await admin.auth.admin.deleteUser(userId);
   expect(deleted.error, 'Generated test account is deleted').toBeNull();
  }
 }
});
