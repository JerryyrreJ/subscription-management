import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDrafts } from '../../src/utils/subscriptionDraft.ts';
import { DEFAULT_CURRENCY } from '../../src/utils/currency.ts';
import { MAX_SUBSCRIPTION_AMOUNT } from '../../src/utils/subscriptionValidation.ts';

const TODAY = '2026-06-19';

test('reads items from {subscriptions:[...]} and from a bare array', () => {
  const item = { name: 'Netflix', category: 'Streaming', amount: 15.99, currency: 'USD', period: 'monthly', lastPaymentDate: '2026-06-01' };
  const wrapped = normalizeDrafts({ subscriptions: [item] }, TODAY);
  const bare = normalizeDrafts([item], TODAY);
  assert.equal(wrapped.drafts.length, 1);
  assert.equal(bare.drafts.length, 1);
  assert.equal(wrapped.drafts[0].name, 'Netflix');
  assert.equal(wrapped.drafts[0].warnings.length, 0);
});

test('drops items without a name', () => {
  const result = normalizeDrafts({ subscriptions: [{ amount: 10, currency: 'USD', period: 'monthly' }, { name: 'Spotify', amount: 9.99, currency: 'USD', period: 'monthly', lastPaymentDate: '2026-06-01' }] }, TODAY);
  assert.equal(result.drafts.length, 1);
  assert.equal(result.dropped, 1);
  assert.equal(result.drafts[0].name, 'Spotify');
});

test('defaults and flags unknown currency and period', () => {
  const { drafts } = normalizeDrafts([{ name: 'X', amount: 5, currency: 'XYZ', period: 'weekly', lastPaymentDate: '2026-06-01' }], TODAY);
  assert.equal(drafts[0].currency, DEFAULT_CURRENCY);
  assert.equal(drafts[0].period, 'monthly');
  assert.ok(drafts[0].warnings.includes('currency_defaulted'));
  assert.ok(drafts[0].warnings.includes('period_defaulted'));
});

test('guesses missing date with today and flags future dates', () => {
  const missing = normalizeDrafts([{ name: 'X', amount: 5, currency: 'USD', period: 'monthly' }], TODAY);
  assert.equal(missing.drafts[0].lastPaymentDate, TODAY);
  assert.ok(missing.drafts[0].warnings.includes('lastPaymentDate_guessed'));

  const future = normalizeDrafts([{ name: 'X', amount: 5, currency: 'USD', period: 'monthly', lastPaymentDate: '2027-01-01' }], TODAY);
  assert.equal(future.drafts[0].lastPaymentDate, TODAY);
  assert.ok(future.drafts[0].warnings.includes('lastPaymentDate_future'));
});

test('handles amount edge cases', () => {
  const missing = normalizeDrafts([{ name: 'X', currency: 'USD', period: 'monthly', lastPaymentDate: '2026-06-01' }], TODAY);
  assert.equal(missing.drafts[0].amount, 0);
  assert.ok(missing.drafts[0].warnings.includes('amount_missing'));

  const huge = normalizeDrafts([{ name: 'X', amount: MAX_SUBSCRIPTION_AMOUNT + 100, currency: 'USD', period: 'monthly', lastPaymentDate: '2026-06-01' }], TODAY);
  assert.equal(huge.drafts[0].amount, MAX_SUBSCRIPTION_AMOUNT);
  assert.ok(huge.drafts[0].warnings.includes('amount_capped'));
});

test('keeps a valid custom interval and flags a missing one', () => {
  const valid = normalizeDrafts([{ name: 'X', amount: 5, currency: 'USD', period: 'custom', customDate: '45', lastPaymentDate: '2026-06-01' }], TODAY);
  assert.equal(valid.drafts[0].customDate, '45');
  assert.ok(!valid.drafts[0].warnings.includes('customDate_missing'));

  const invalid = normalizeDrafts([{ name: 'X', amount: 5, currency: 'USD', period: 'custom', lastPaymentDate: '2026-06-01' }], TODAY);
  assert.equal(invalid.drafts[0].customDate, undefined);
  assert.ok(invalid.drafts[0].warnings.includes('customDate_missing'));
});

test('only accepts real booleans for notificationEnabled', () => {
  const { drafts } = normalizeDrafts([{
    name: 'X',
    amount: 5,
    currency: 'USD',
    period: 'monthly',
    lastPaymentDate: '2026-06-01',
    notificationEnabled: 'false',
  }], TODAY);

  assert.equal(drafts[0].notificationEnabled, true);
  assert.ok(drafts[0].warnings.includes('notificationEnabled_invalid'));
});

test('caps the number of drafts', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ name: `S${i}`, amount: 1, currency: 'USD', period: 'monthly', lastPaymentDate: '2026-06-01' }));
  const { drafts } = normalizeDrafts({ subscriptions: many }, TODAY);
  assert.equal(drafts.length, 50);
});
