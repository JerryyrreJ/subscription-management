import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findDuplicates,
  monthlyEquivalent,
  optimizationCandidates,
  summarizeSpend,
  type InsightSubscription,
} from '../../src/utils/subscriptionInsights.ts';

const sub = (overrides: Partial<InsightSubscription>): InsightSubscription => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: overrides.name ?? 'Service',
  category: overrides.category ?? 'General',
  amount: overrides.amount ?? 10,
  currency: overrides.currency ?? 'USD',
  period: overrides.period ?? 'monthly',
  customDate: overrides.customDate,
  nextPaymentDate: overrides.nextPaymentDate ?? '2026-06-20',
  status: overrides.status ?? 'active',
});

const fixture = (): InsightSubscription[] => [
  sub({ id: 'a', name: 'Netflix', category: 'Streaming', amount: 15, currency: 'USD', period: 'monthly', nextPaymentDate: '2026-06-20' }),
  sub({ id: 'b', name: 'netflix', category: 'Streaming', amount: 9.99, currency: 'USD', period: 'monthly', nextPaymentDate: '2026-07-30' }),
  sub({ id: 'c', name: 'Spotify', category: 'Music', amount: 120, currency: 'USD', period: 'yearly', nextPaymentDate: '2026-06-25' }),
  sub({ id: 'd', name: 'Figma', category: 'Design', amount: 45, currency: 'USD', period: 'monthly', nextPaymentDate: '2026-08-01', status: 'cancelled' }),
  sub({ id: 'e', name: 'Rakuten', category: 'Shopping', amount: 1000, currency: 'JPY', period: 'monthly', nextPaymentDate: '2026-06-18' }),
  sub({ id: 'f', name: 'Notion', category: 'Productivity', amount: 8, currency: 'USD', period: 'monthly', nextPaymentDate: '2026-06-19', status: 'paused' }),
  sub({ id: 'g', name: 'AWS', category: 'Cloud', amount: 200, currency: 'USD', period: 'monthly', nextPaymentDate: '2026-09-01' }),
];

const asOf = new Date('2026-06-16T00:00:00.000Z');

test('monthlyEquivalent normalizes each billing period', () => {
  assert.equal(monthlyEquivalent(sub({ amount: 15, period: 'monthly' })), 15);
  assert.equal(monthlyEquivalent(sub({ amount: 120, period: 'yearly' })), 10);
  assert.equal(monthlyEquivalent(sub({ amount: 30, period: 'custom', customDate: '30' })), 30);
  assert.equal(monthlyEquivalent(sub({ amount: 30, period: 'custom', customDate: '15' })), 60);
});

test('summarizeSpend reports counts, per-currency totals, and renewals in the horizon', () => {
  const summary = summarizeSpend(fixture(), asOf, 30);

  assert.deepEqual(summary.counts, { total: 7, active: 5, paused: 1, cancelled: 1 });

  const usd = summary.byCurrency.find(entry => entry.currency === 'USD');
  // active USD = 15 + 9.99 + (120/12=10) + 200 = 234.99
  assert.equal(usd?.activeSubscriptions, 4);
  assert.equal(usd?.monthlyTotal, 234.99);
  assert.equal(usd?.yearlyTotal, 2819.88);

  // Only active subscriptions renewing within 30 days of 2026-06-16, sorted ascending.
  assert.equal(summary.upcomingRenewals.length, 3);
  assert.equal(summary.upcomingRenewals[0].name, 'Rakuten');
  assert.equal(summary.upcomingRenewals[0].daysUntilRenewal, 2);
  assert.deepEqual(
    summary.upcomingRenewals.map(renewal => renewal.name),
    ['Rakuten', 'Netflix', 'Spotify']
  );
});

test('findDuplicates groups active subscriptions sharing a normalized name', () => {
  const duplicates = findDuplicates(fixture());

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].normalizedName, 'netflix');
  assert.equal(duplicates[0].subscriptions.length, 2);
});

test('optimizationCandidates surfaces monthly and above-average subscriptions without inventing discounts', () => {
  const candidates = optimizationCandidates(fixture());

  // Active monthly subscriptions: Netflix, netflix, Rakuten, AWS (Spotify is yearly).
  assert.equal(candidates.monthlyToAnnual.length, 4);
  const aws = candidates.monthlyToAnnual.find(item => item.name === 'AWS');
  assert.equal(aws?.yearlyAtCurrentRate, 2400);

  // USD active average is 234.99/4 = 58.75; only AWS (200) exceeds twice that.
  assert.equal(candidates.aboveAverageInCurrency.length, 1);
  assert.equal(candidates.aboveAverageInCurrency[0].name, 'AWS');
});
