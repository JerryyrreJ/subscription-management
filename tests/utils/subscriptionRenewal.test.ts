import test from 'node:test';
import assert from 'node:assert/strict';
import type { Subscription } from '../../src/types.ts';
import { resolveSubscriptionRenewal } from '../../src/utils/subscriptionRenewal.ts';

const createSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
 id: overrides.id || 'sub-1',
 name: overrides.name || 'Subscription',
 category: overrides.category || 'Software',
 amount: overrides.amount || 10,
 currency: overrides.currency || 'USD',
 period: overrides.period || 'monthly',
 lastPaymentDate: overrides.lastPaymentDate || '2026-03-01',
 nextPaymentDate: overrides.nextPaymentDate || '2026-04-01',
 customDate: overrides.customDate,
 createdAt: overrides.createdAt || '2026-03-01T00:00:00.000Z',
 updatedAt: overrides.updatedAt || '2026-03-01T00:00:00.000Z',
 notificationEnabled: overrides.notificationEnabled ?? true,
});

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

test('resolveSubscriptionRenewal preserves stored dates when subscription is not overdue', () => {
 withMockedNow('2026-03-24T12:00:00.000Z', () => {
  const renewal = resolveSubscriptionRenewal(createSubscription(), 'UTC');

  assert.deepEqual(renewal, {
   storedLastPaymentDate: '2026-03-01',
   storedNextPaymentDate: '2026-04-01',
   effectiveLastPaymentDate: '2026-03-01',
   effectiveNextPaymentDate: '2026-04-01',
   daysUntilEffectiveNextPayment: 8,
   isAutoRenewed: false,
  });
 });
});

test('resolveSubscriptionRenewal rolls overdue subscriptions forward using the original billing cadence', () => {
 withMockedNow('2026-04-21T07:03:48.016Z', () => {
  const renewal = resolveSubscriptionRenewal(createSubscription({
   lastPaymentDate: '2026-04-13',
   nextPaymentDate: '2026-05-13',
  }), 'UTC');

  assert.equal(renewal.storedLastPaymentDate, '2026-04-13');
  assert.equal(renewal.storedNextPaymentDate, '2026-05-13');
  assert.equal(renewal.effectiveLastPaymentDate, '2026-04-13');
  assert.equal(renewal.effectiveNextPaymentDate, '2026-05-13');
  assert.equal(renewal.daysUntilEffectiveNextPayment, 22);
  assert.equal(renewal.isAutoRenewed, false);
 });
});

test('resolveSubscriptionRenewal advances overdue monthly subscriptions to the next future billing date', () => {
 withMockedNow('2026-04-21T07:03:48.016Z', () => {
  const renewal = resolveSubscriptionRenewal(createSubscription({
   lastPaymentDate: '2026-01-13',
   nextPaymentDate: '2026-02-13',
  }), 'UTC');

  assert.equal(renewal.effectiveLastPaymentDate, '2026-04-13');
  assert.equal(renewal.effectiveNextPaymentDate, '2026-05-13');
  assert.equal(renewal.daysUntilEffectiveNextPayment, 22);
  assert.equal(renewal.isAutoRenewed, true);
 });
});
