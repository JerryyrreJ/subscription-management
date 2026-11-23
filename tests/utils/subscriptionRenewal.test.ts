import test from 'node:test';
import assert from 'node:assert/strict';
import type { Subscription } from '../../src/types.ts';
import {
 buildConvertedPaidSubscription,
 isExpiredTrial,
 resolveSubscriptionRenewal,
 resolveTrialConversionDates,
} from '../../src/utils/subscriptionRenewal.ts';

const createSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
 id: overrides.id || 'sub-1',
 name: overrides.name || 'Subscription',
 category: overrides.category || 'Software',
 amount: overrides.amount || 10,
 currency: overrides.currency || 'USD',
 period: overrides.period || 'monthly',
 lastPaymentDate: overrides.lastPaymentDate || '2026-03-01',
 nextPaymentDate: overrides.nextPaymentDate || '2026-04-01',
 billingAnchorDay: overrides.billingAnchorDay,
 customDate: overrides.customDate,
 createdAt: overrides.createdAt || '2026-03-01T00:00:00.000Z',
 updatedAt: overrides.updatedAt || '2026-03-01T00:00:00.000Z',
 notificationEnabled: overrides.notificationEnabled ?? true,
 isTrial: overrides.isTrial,
 trialEndsOn: overrides.trialEndsOn,
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

test('resolveSubscriptionRenewal uses the provided time zone when deciding whether to auto renew', () => {
 withMockedNow('2026-04-01T01:30:00.000Z', () => {
  const renewal = resolveSubscriptionRenewal(createSubscription({
   lastPaymentDate: '2026-02-28',
   nextPaymentDate: '2026-03-31',
  }), 'America/Los_Angeles');

  assert.equal(renewal.effectiveLastPaymentDate, '2026-02-28');
  assert.equal(renewal.effectiveNextPaymentDate, '2026-03-31');
  assert.equal(renewal.daysUntilEffectiveNextPayment, 0);
  assert.equal(renewal.isAutoRenewed, false);
 });
});

test('resolveSubscriptionRenewal restores the original day after a short month', () => {
 withMockedNow('2026-03-01T12:00:00.000Z', () => {
  const renewal = resolveSubscriptionRenewal(createSubscription({
   lastPaymentDate: '2026-01-31',
   nextPaymentDate: '2026-02-28',
   billingAnchorDay: 31,
  }), 'UTC');

  assert.equal(renewal.effectiveLastPaymentDate, '2026-02-28');
  assert.equal(renewal.effectiveNextPaymentDate, '2026-03-31');
  assert.equal(renewal.isAutoRenewed, true);
 });
});

test('resolveSubscriptionRenewal does not auto-roll a free trial after the end date', () => {
 withMockedNow('2026-04-21T07:03:48.016Z', () => {
  const renewal = resolveSubscriptionRenewal(createSubscription({
   isTrial: true,
   trialEndsOn: '2026-02-13',
   nextPaymentDate: '2026-02-13',
   lastPaymentDate: '2026-01-13',
  }), 'UTC');

  assert.equal(renewal.effectiveNextPaymentDate, '2026-02-13');
  assert.equal(renewal.storedNextPaymentDate, '2026-02-13');
  assert.equal(renewal.isAutoRenewed, false);
  assert.ok(renewal.daysUntilEffectiveNextPayment < 0);
 });
});

test('resolveSubscriptionRenewal preserves Jan 31 cadence across February even without billingAnchorDay', () => {
 withMockedNow('2026-03-10T12:00:00.000Z', () => {
  const renewal = resolveSubscriptionRenewal(createSubscription({
   lastPaymentDate: '2025-12-31',
   nextPaymentDate: '2026-01-31',
   billingAnchorDay: undefined,
  }), 'UTC');

  assert.equal(renewal.effectiveLastPaymentDate, '2026-02-28');
  assert.equal(renewal.effectiveNextPaymentDate, '2026-03-31');
  assert.equal(renewal.daysUntilEffectiveNextPayment, 21);
  assert.equal(renewal.isAutoRenewed, true);
 });
});

test('resolveSubscriptionRenewal preserves leap-day yearly cadence across non-leap and leap years', () => {
 withMockedNow('2028-02-10T12:00:00.000Z', () => {
  const renewal = resolveSubscriptionRenewal(createSubscription({
   period: 'yearly',
   lastPaymentDate: '2023-02-28',
   nextPaymentDate: '2024-02-29',
  }), 'UTC');

  assert.equal(renewal.effectiveLastPaymentDate, '2027-02-28');
  assert.equal(renewal.effectiveNextPaymentDate, '2028-02-29');
  assert.equal(renewal.daysUntilEffectiveNextPayment, 19);
  assert.equal(renewal.isAutoRenewed, true);
 });
});

test('isExpiredTrial returns true only for free trials past their end date', () => {
 withMockedNow('2026-04-21T07:03:48.016Z', () => {
  assert.equal(isExpiredTrial(createSubscription({
   isTrial: true,
   trialEndsOn: '2026-04-20',
   nextPaymentDate: '2026-04-20',
  }), 'UTC'), true);

  assert.equal(isExpiredTrial(createSubscription({
   isTrial: true,
   trialEndsOn: '2026-04-21',
   nextPaymentDate: '2026-04-21',
  }), 'UTC'), false);

  assert.equal(isExpiredTrial(createSubscription({
   isTrial: false,
   nextPaymentDate: '2026-01-01',
  }), 'UTC'), false);
 });
});

test('resolveTrialConversionDates rolls expired monthly trial forward and preserves Jan 31 anchor day', () => {
 withMockedNow('2026-03-10T12:00:00.000Z', () => {
  const dates = resolveTrialConversionDates(createSubscription({
   isTrial: true,
   period: 'monthly',
   trialEndsOn: '2026-01-31',
   nextPaymentDate: '2026-01-31',
   lastPaymentDate: '2025-12-31',
  }), 'UTC');

  assert.equal(dates.lastPaymentDate, '2026-02-28');
  assert.equal(dates.nextPaymentDate, '2026-03-31');
  assert.equal(dates.billingAnchorDay, 31);
 });
});

test('resolveTrialConversionDates keeps upcoming trial end date when converting an active trial early', () => {
 withMockedNow('2026-04-10T12:00:00.000Z', () => {
  const dates = resolveTrialConversionDates(createSubscription({
   isTrial: true,
   period: 'monthly',
   trialEndsOn: '2026-04-25',
   nextPaymentDate: '2026-04-25',
   lastPaymentDate: '2026-03-25',
  }), 'UTC');

  assert.equal(dates.lastPaymentDate, '2026-03-25');
  assert.equal(dates.nextPaymentDate, '2026-04-25');
  assert.equal(dates.billingAnchorDay, 25);
 });
});

test('buildConvertedPaidSubscription clears trial flags and advances expired yearly and custom trials', () => {
 const now = new Date('2026-06-16T12:00:00.000Z');

 const yearlyConverted = buildConvertedPaidSubscription(createSubscription({
  isTrial: true,
  period: 'yearly',
  trialEndsOn: '2025-05-01',
  nextPaymentDate: '2025-05-01',
  lastPaymentDate: '2024-05-01',
 }), 'UTC', now);

 assert.equal(yearlyConverted.isTrial, false);
 assert.equal(yearlyConverted.trialEndsOn, undefined);
 assert.equal(yearlyConverted.lastPaymentDate, '2026-05-01');
 assert.equal(yearlyConverted.nextPaymentDate, '2027-05-01');
 assert.equal(yearlyConverted.billingAnchorDay, undefined);
 assert.equal(yearlyConverted.updatedAt, '2026-06-16T12:00:00.000Z');

 const customConverted = buildConvertedPaidSubscription(createSubscription({
  isTrial: true,
  period: 'custom',
  customDate: '14',
  trialEndsOn: '2026-06-01',
  nextPaymentDate: '2026-06-01',
  lastPaymentDate: '2026-05-18',
 }), 'UTC', now);

 assert.equal(customConverted.isTrial, false);
 assert.equal(customConverted.trialEndsOn, undefined);
 assert.equal(customConverted.lastPaymentDate, '2026-06-15');
 assert.equal(customConverted.nextPaymentDate, '2026-06-29');
});

