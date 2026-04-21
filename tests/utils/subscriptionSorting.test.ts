import test from 'node:test';
import assert from 'node:assert/strict';
import { Currency, ExchangeRates, SortConfig, Subscription } from '../../src/types.ts';
import { sortSubscriptions, getSubscriptionDailyPrice } from '../../src/utils/subscriptionSorting.ts';
import { normalizeSubscription } from '../../src/utils/subscriptionSync.ts';

const createSubscription = (overrides: Partial<Subscription> = {}): Subscription => normalizeSubscription({
 id: overrides.id || 'sub-1',
 name: overrides.name || 'Netflix',
 category: overrides.category || 'Entertainment',
 amount: overrides.amount || 15,
 currency: overrides.currency || 'USD',
 period: overrides.period || 'monthly',
 lastPaymentDate: overrides.lastPaymentDate || '2026-03-01',
 nextPaymentDate: overrides.nextPaymentDate || '2026-04-01',
 customDate: overrides.customDate,
 createdAt: overrides.createdAt || '2026-03-01T00:00:00.000Z',
 updatedAt: overrides.updatedAt || '2026-03-01T00:00:00.000Z',
 notificationEnabled: overrides.notificationEnabled ?? true,
});

const amountSort: SortConfig = {
 sortBy: 'amount',
 sortOrder: 'asc',
};

test('sortSubscriptions orders by daily price in the selected base currency', () => {
 const subscriptions = [
  createSubscription({
   id: 'sub-usd',
   name: 'USD Plan',
   amount: 10,
   currency: 'USD',
  }),
  createSubscription({
   id: 'sub-eur',
   name: 'EUR Plan',
   amount: 9,
   currency: 'EUR',
  }),
 ];

 const usdRates: ExchangeRates = {
  USD: 1,
  EUR: 2,
 };

 const eurRates: ExchangeRates = {
  EUR: 1,
  USD: 3,
 };

 assert.deepEqual(
  sortSubscriptions(subscriptions, amountSort, 'USD', usdRates).map(subscription => subscription.id),
  ['sub-eur', 'sub-usd']
 );

 assert.deepEqual(
  sortSubscriptions(subscriptions, amountSort, 'EUR', eurRates).map(subscription => subscription.id),
  ['sub-usd', 'sub-eur']
 );
});

test('getSubscriptionDailyPrice uses custom billing period days and falls back to 30 for invalid values', () => {
 const baseCurrency: Currency = 'USD';
 const exchangeRates: ExchangeRates = { USD: 1 };

 const customSubscription = createSubscription({
  id: 'sub-custom',
  amount: 12,
  period: 'custom',
  customDate: '6',
 });

 const invalidCustomSubscription = createSubscription({
  id: 'sub-invalid-custom',
  amount: 12,
  period: 'custom',
  customDate: '0',
 });

 assert.equal(getSubscriptionDailyPrice(customSubscription, baseCurrency, exchangeRates), 2);
 assert.equal(getSubscriptionDailyPrice(invalidCustomSubscription, baseCurrency, exchangeRates), 0.4);
});

test('sortSubscriptions uses effective next payment date for overdue subscriptions', () => {
 const subscriptions = [
  createSubscription({
   id: 'sub-overdue',
   name: 'Overdue Plan',
   lastPaymentDate: '2026-01-13',
   nextPaymentDate: '2026-02-13',
  }),
  createSubscription({
   id: 'sub-upcoming',
   name: 'Upcoming Plan',
   lastPaymentDate: '2026-04-10',
   nextPaymentDate: '2026-04-25',
  }),
 ];

 const nextPaymentSort: SortConfig = {
  sortBy: 'nextPaymentDate',
  sortOrder: 'asc',
 };

 const RealDate = Date;
 class MockDate extends RealDate {
  constructor(value?: string | number | Date) {
   super(value ?? '2026-04-21T12:00:00.000Z');
  }

  static now() {
   return new RealDate('2026-04-21T12:00:00.000Z').getTime();
  }
 }
 MockDate.parse = RealDate.parse;
 MockDate.UTC = RealDate.UTC;

 globalThis.Date = MockDate as unknown as DateConstructor;

 try {
  assert.deepEqual(
   sortSubscriptions(subscriptions, nextPaymentSort, 'USD', { USD: 1 }).map(subscription => subscription.id),
   ['sub-upcoming', 'sub-overdue']
  );
 } finally {
  globalThis.Date = RealDate;
 }
});
