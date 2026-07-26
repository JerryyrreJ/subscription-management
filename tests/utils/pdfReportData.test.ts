import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import type { ExchangeRates, Subscription } from '../../src/types.ts';
import { generateReportData } from '../../src/utils/reportAnalytics.ts';
import { buildPdfReportData } from '../../src/utils/pdfReportData.ts';

/** 直接回显 key，断言就能盯住"用了哪个文案分支"而不受译文措辞影响。 */
const t = ((key: string, options?: Record<string, unknown>) => {
 if (!options) {
  return key;
 }

 const args = Object.entries(options)
  .map(([name, value]) => `${name}=${String(value)}`)
  .join(',');

 return `${key}(${args})`;
}) as unknown as TFunction;

const EXCHANGE_RATES: ExchangeRates = { CNY: 1, USD: 1 / 7.2 };

const createSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
 id: overrides.id || 'sub-1',
 name: overrides.name || 'Subscription',
 category: overrides.category || 'Entertainment',
 amount: overrides.amount ?? 100,
 currency: overrides.currency || 'CNY',
 period: overrides.period || 'monthly',
 lastPaymentDate: overrides.lastPaymentDate || '2026-06-10',
 nextPaymentDate: overrides.nextPaymentDate || '2026-07-10',
 customDate: overrides.customDate,
 createdAt: overrides.createdAt || '2025-01-01T00:00:00.000Z',
 updatedAt: overrides.updatedAt || '2026-06-10T00:00:00.000Z',
 notificationEnabled: overrides.notificationEnabled ?? true,
});

const withMockedNow = (isoDateTime: string, run: () => void) => {
 const RealDate = Date;

 // reportAnalytics 里有 new Date(year, month, 0) 的多参调用，mock 必须原样转发，
 // 否则月末日期会坍缩成 epoch 附近，导致所有订阅被判定为"未创建"。
 class MockDate extends RealDate {
  constructor(...args: [] | [string | number | Date] | [number, number, number]) {
   if (args.length === 0) {
    super(isoDateTime);
   } else if (args.length === 1) {
    super(args[0]);
   } else {
    super(args[0], args[1], args[2]);
   }
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

const build = (subscriptions: Subscription[]) =>
 buildPdfReportData({
  subscriptions,
  reportData: generateReportData(subscriptions, 'CNY', EXCHANGE_RATES, t, 'en-US'),
  baseCurrency: 'CNY',
  exchangeRates: EXCHANGE_RATES,
  exchangeRatesUpdatedAt: null,
  t,
  locale: 'en-US',
  timeZone: 'UTC',
 });

test('subscription rows keep the original charge and sort by monthly equivalent', () => {
 withMockedNow('2026-07-01T12:00:00.000Z', () => {
  const data = build([
   createSubscription({ id: 'a', name: 'Monthly 100', amount: 100, period: 'monthly' }),
   createSubscription({
    id: 'b',
    name: 'Yearly 1200',
    amount: 1200,
    period: 'yearly',
    nextPaymentDate: '2026-12-01',
   }),
  ]);

  assert.deepEqual(
   data.subscriptionRows.map(row => row.name),
   ['Monthly 100', 'Yearly 1200']
  );

  // 原始金额保持年付的 1200，月均折算成 100（en-US locale 下 CNY 渲染为 CN¥）
  const yearlyRow = data.subscriptionRows[1];
  assert.equal(yearlyRow.price, 'CN¥1,200.00');
  assert.equal(yearlyRow.monthly, 'CN¥100.00');
  assert.equal(yearlyRow.yearly, 'CN¥1,200.00');
 });
});

test('foreign currency rows convert to the base currency for the monthly column', () => {
 withMockedNow('2026-07-01T12:00:00.000Z', () => {
  const data = build([
   createSubscription({ id: 'usd', name: 'ChatGPT Plus', amount: 20, currency: 'USD' }),
  ]);

  const [row] = data.subscriptionRows;
  assert.equal(row.price, '$20.00');
  assert.equal(row.monthly, 'CN¥144.00');
  assert.equal(data.totalMonthly, 'CN¥144.00');
 });
});

test('next 30 days covers the rolling window and excludes renewals beyond it', () => {
 withMockedNow('2026-07-01T12:00:00.000Z', () => {
  const data = build([
   createSubscription({ id: 'in', name: 'In window', nextPaymentDate: '2026-07-20' }),
   createSubscription({ id: 'edge', name: 'On the edge', nextPaymentDate: '2026-07-31' }),
   createSubscription({ id: 'out', name: 'Out of window', nextPaymentDate: '2026-08-05' }),
  ]);

  assert.deepEqual(
   data.next30Days.map(entry => entry.name),
   ['In window', 'On the edge']
  );
  // 最近的一笔带强调标记
  assert.deepEqual(
   data.next30Days.map(entry => entry.isNext),
   [true, false]
  );
  assert.equal(data.next30Summary, 'analytics:pdfNext30Summary(count=2,amount=CN¥200.00)');
 });
});

test('an empty renewal window still produces a usable KPI note', () => {
 withMockedNow('2026-07-01T12:00:00.000Z', () => {
  const data = build([
   createSubscription({ id: 'far', name: 'Far away', nextPaymentDate: '2026-10-01' }),
  ]);

  assert.deepEqual(data.next30Days, []);
  const nextRenewalKpi = data.snapshotKpis[3];
  assert.equal(nextRenewalKpi.value, 'analytics:notAvailable');
  assert.equal(nextRenewalKpi.note, 'analytics:pdfNoUpcomingRenewal');
 });
});

test('annual KPIs stay derivable from the current snapshot — no historical spend', () => {
 withMockedNow('2026-07-01T12:00:00.000Z', () => {
  const data = build([
   createSubscription({ id: 'a', name: 'A', amount: 300, category: 'Entertainment' }),
   createSubscription({ id: 'b', name: 'B', amount: 100, category: 'Productivity' }),
  ]);

  assert.deepEqual(
   data.annualKpis.map(kpi => kpi.label),
   [
    'analytics:pdfKpiAnnualized',
    'analytics:pdfKpiMonthly',
    'analytics:pdfKpiAvgPerItem',
    'analytics:pdfKpiLargestCategory',
   ]
  );

  assert.equal(data.annualKpis[0].value, 'CN¥4,800.00');
  assert.equal(data.annualKpis[1].value, 'CN¥400.00');
  assert.equal(data.annualKpis[2].value, 'CN¥200.00');
  assert.equal(
   data.annualKpis[3].note,
   'analytics:pdfKpiLargestCategoryNote(percentage=75.0%,amount=CN¥300.00)'
  );
 });
});

test('the fx footnote lists only the foreign currencies actually in use', () => {
 withMockedNow('2026-07-01T12:00:00.000Z', () => {
  const localOnly = build([createSubscription({ id: 'cny', currency: 'CNY' })]);
  assert.equal(localOnly.meta.fxNote, 'analytics:pdfFxNoneNote');

  const mixed = build([
   createSubscription({ id: 'cny', currency: 'CNY' }),
   createSubscription({ id: 'usd', currency: 'USD', amount: 20 }),
  ]);
  assert.equal(mixed.meta.fxNote, 'analytics:pdfFxNote(pairs=CNY/USD 0.1389)');
 });
});

test('category groups reuse the same rows as the flat detail table', () => {
 withMockedNow('2026-07-01T12:00:00.000Z', () => {
  const data = build([
   createSubscription({ id: 'a', name: 'A', amount: 300, category: 'Entertainment' }),
   createSubscription({ id: 'b', name: 'B', amount: 100, category: 'Productivity' }),
   createSubscription({ id: 'c', name: 'C', amount: 50, category: 'Entertainment' }),
  ]);

  const groupedNames = data.categoryGroups.flatMap(group => group.rows.map(row => row.name));
  assert.deepEqual(groupedNames.sort(), ['A', 'B', 'C']);

  const entertainment = data.categoryGroups[0];
  assert.equal(entertainment.monthly, 'CN¥350.00');
  assert.equal(entertainment.yearly, 'CN¥4,200.00');
 });
});

test('the trend is scaled against its own peak and flags the current month', () => {
 withMockedNow('2026-07-01T12:00:00.000Z', () => {
  const data = build([
   createSubscription({ id: 'old', name: 'Old', createdAt: '2025-01-01T00:00:00.000Z' }),
   createSubscription({ id: 'new', name: 'New', createdAt: '2026-07-01T00:00:00.000Z' }),
  ]);

  assert.equal(data.trend.length, 12);
  assert.equal(data.trend[data.trend.length - 1].isCurrent, true);
  assert.equal(data.trend[data.trend.length - 1].heightPercentage, 100);
  // 第二个订阅本月才建立，之前的月份只有一半支出
  assert.equal(data.trend[0].heightPercentage, 50);
 });
});
