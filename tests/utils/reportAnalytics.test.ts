import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import type { ExchangeRates, Subscription } from '../../src/types.ts';
import {
 calculateCategoryAnalysis,
 calculateMonthlyCost,
 calculateSpendingTrend,
 calculateYearlyCost,
 generateOptimizationSuggestions,
 generateRenewalHeatmap,
 generateReportData,
 getTopSubscriptions,
} from '../../src/utils/reportAnalytics.ts';

const withMockedNow = (isoDateTime: string, run: () => void) => {
 const RealDate = Date;

 class MockDate extends RealDate {
  constructor(value?: string | number | Date) {
   super(value ?? isoDateTime);
  }

  static now() {
   return new RealDate(isoDateTime).getTime();
  }
 }

 MockDate.parse = RealDate.parse;
 MockDate.UTC = RealDate.UTC;

 globalThis.Date = MockDate as unknown as DateConstructor;

 try {
  run();
 } finally {
  globalThis.Date = RealDate;
 }
};

const createSub = (overrides: Partial<Subscription> = {}): Subscription => ({
 id: overrides.id ?? 'sub-1',
 name: overrides.name ?? 'Netflix',
 category: overrides.category ?? 'Entertainment',
 amount: overrides.amount ?? 15,
 currency: overrides.currency ?? 'USD',
 period: overrides.period ?? 'monthly',
 lastPaymentDate: overrides.lastPaymentDate ?? '2026-01-15',
 nextPaymentDate: overrides.nextPaymentDate ?? '2026-02-15',
 billingAnchorDay: overrides.billingAnchorDay,
 customDate: overrides.customDate,
 createdAt: overrides.createdAt ?? '2026-01-15T00:00:00.000Z',
 updatedAt: overrides.updatedAt ?? '2026-01-15T00:00:00.000Z',
 notificationEnabled: overrides.notificationEnabled ?? true,
 status: overrides.status ?? 'active',
 isTrial: overrides.isTrial ?? false,
 trialEndsOn: overrides.trialEndsOn,
});

const stubT = ((key: string, options?: Record<string, unknown>) => {
 if (options && 'count' in options) {
  return `${key}:${options.count}`;
 }
 if (options && 'category' in options) {
  return `${key}:${options.category}`;
 }
 return key;
}) as unknown as TFunction;

const rates: ExchangeRates = {
 USD: 1,
 CNY: 7.2,
 EUR: 0.8,
 JPY: 150,
};

test('calculateMonthlyCost and calculateYearlyCost normalize monthly, yearly, and custom periods', () => {
 assert.equal(calculateMonthlyCost(createSub({ amount: 20, period: 'monthly' })), 20);
 assert.equal(calculateYearlyCost(createSub({ amount: 20, period: 'monthly' })), 240);

 assert.equal(calculateMonthlyCost(createSub({ amount: 120, period: 'yearly' })), 10);
 assert.equal(calculateYearlyCost(createSub({ amount: 120, period: 'yearly' })), 120);

 assert.equal(calculateMonthlyCost(createSub({ amount: 15, period: 'custom', customDate: '15' })), 30);
 assert.equal(calculateYearlyCost(createSub({ amount: 15, period: 'custom', customDate: '15' })), 360);

 assert.equal(calculateMonthlyCost(createSub({ amount: 90, period: 'custom', customDate: '90' })), 30);
});

test('calculateMonthlyCost safely falls back to subscription amount for invalid or non-positive customDate', () => {
 for (const invalidCustom of [undefined, '', '0', '-10', 'invalid']) {
  const cost = calculateMonthlyCost(createSub({
   amount: 25,
   period: 'custom',
   customDate: invalidCustom,
  }));
  assert.equal(Number.isFinite(cost), true);
  assert.equal(cost, 25);
 }
});

test('calculateSpendingTrend includes subscriptions created on the last day of a month after midnight UTC', () => {
 withMockedNow('2026-03-15T12:00:00.000Z', () => {
  const janMonthEndSub = createSub({
   id: 'jan-end',
   amount: 20,
   currency: 'USD',
   period: 'monthly',
   createdAt: '2026-01-31T18:45:00.000Z',
  });
  const febSub = createSub({
   id: 'feb-mid',
   amount: 72,
   currency: 'CNY', // 10 USD at 7.2
   period: 'monthly',
   createdAt: '2026-02-10T08:00:00.000Z',
  });

  const trend = calculateSpendingTrend([janMonthEndSub, febSub], 'USD', rates, 'en');
  assert.equal(trend.length, 12);

  const dec2025 = trend.find(item => item.month === '2025-12');
  const jan2026 = trend.find(item => item.month === '2026-01');
  const feb2026 = trend.find(item => item.month === '2026-02');
  const mar2026 = trend.find(item => item.month === '2026-03');

  assert.equal(dec2025?.subscriptionCount, 0);
  assert.equal(dec2025?.totalSpend, 0);

  assert.equal(jan2026?.subscriptionCount, 1);
  assert.equal(jan2026?.totalSpend, 20);

  assert.equal(feb2026?.subscriptionCount, 2);
  assert.equal(feb2026?.totalSpend, 30);

  assert.equal(mar2026?.subscriptionCount, 2);
  assert.equal(mar2026?.totalSpend, 30);
 });
});

test('calculateCategoryAnalysis groups trimmed categories, converts currencies, and sorts by spend', () => {
 const subscriptions = [
  createSub({ id: '1', name: 'Netflix', category: ' Streaming ', amount: 20, currency: 'USD' }),
  createSub({ id: '2', name: 'Disney+', category: 'Streaming', amount: 72, currency: 'CNY' }), // 10 USD
  createSub({ id: '3', name: 'Mystery', category: '   ', amount: 10, currency: 'USD' }),
 ];

 const analysis = calculateCategoryAnalysis(subscriptions, 'USD', rates, stubT);
 assert.equal(analysis.length, 2);
 assert.equal(analysis[0].subscriptionCount, 2);
 assert.equal(analysis[0].totalSpend, 30);
 assert.equal(analysis[0].avgCost, 15);
 assert.equal(analysis[0].percentage, 75);

 assert.equal(analysis[1].subscriptionCount, 1);
 assert.equal(analysis[1].totalSpend, 10);
 assert.equal(analysis[1].percentage, 25);
});

test('generateRenewalHeatmap uses effective auto-renewed date and preserves monthly anchor day', () => {
 withMockedNow('2026-03-10T12:00:00.000Z', () => {
  const overdueShortMonthSub = createSub({
   name: 'Clamped Monthly',
   amount: 15,
   currency: 'USD',
   period: 'monthly',
   lastPaymentDate: '2026-01-31',
   nextPaymentDate: '2026-02-28',
   billingAnchorDay: 31,
  });

  const heatmap = generateRenewalHeatmap([overdueShortMonthSub], 'USD', rates);
  assert.equal(heatmap.length, 31);
  assert.equal(heatmap[27].count, 0); // Day 28 should not have it once auto-renewed into March
  assert.equal(heatmap[30].count, 1); // Day 31
  assert.equal(heatmap[30].amount, 15);
  assert.equal(heatmap[30].subscriptions[0].name, 'Clamped Monthly');
 });
});

test('generateOptimizationSuggestions and generateReportData handle empty and populated subscription lists', () => {
 withMockedNow('2026-03-10T12:00:00.000Z', () => {
  const emptyReport = generateReportData([], 'USD', rates, stubT, 'en');
  assert.equal(emptyReport.overview.totalMonthlySpend, 0);
  assert.equal(emptyReport.overview.totalYearlySpend, 0);
  assert.equal(emptyReport.overview.activeSubscriptions, 0);
  assert.equal(emptyReport.overview.avgSubscriptionCost, 0);
  assert.deepEqual(emptyReport.optimizationSuggestions, []);

  const populated = [
   createSub({ id: '1', name: 'Cheap 1', category: 'Video', amount: 10, period: 'monthly' }),
   createSub({ id: '2', name: 'Cheap 2', category: 'Video', amount: 10, period: 'monthly' }),
   createSub({ id: '3', name: 'Cheap 3', category: 'Video', amount: 10, period: 'monthly' }),
   createSub({ id: '4', name: 'Outlier Pro', category: 'Cloud', amount: 100, period: 'monthly' }),
  ];

  const suggestions = generateOptimizationSuggestions(populated, 'USD', rates, stubT);
  const types = suggestions.map(item => item.type);
  assert.deepEqual(types, ['expensive', 'multiple_in_category', 'annual_saving']);

  const expensive = suggestions.find(item => item.type === 'expensive');
  assert.deepEqual(expensive?.subscriptions, ['Outlier Pro']);

  const categorySuggestion = suggestions.find(item => item.type === 'multiple_in_category');
  assert.equal(categorySuggestion?.subscriptions.length, 3);
  assert.ok(Math.abs((categorySuggestion?.potentialSaving ?? 0) - 9) < 1e-9);

  const topTwo = getTopSubscriptions(populated, 'USD', rates, stubT, 2);
  assert.equal(topTwo.length, 2);
  assert.equal(topTwo[0].name, 'Outlier Pro');
  assert.equal(topTwo[0].yearlyCost, 1200);
 });
});
