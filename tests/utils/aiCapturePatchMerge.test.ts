import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUpdatedSubscriptionFromPatch,
  updateMissingFields,
  warnedFields,
} from '../../src/components/ai-capture/patchMerge.ts';
import type { Subscription } from '../../src/types.ts';

const baseSubscription: Subscription = {
  id: 'sub-1',
  name: 'Netflix',
  category: 'Streaming',
  amount: 15.99,
  currency: 'USD',
  period: 'monthly',
  lastPaymentDate: '2026-01-31',
  nextPaymentDate: '2026-02-28',
  billingAnchorDay: 31,
  notificationEnabled: true,
};

test('buildUpdatedSubscriptionFromPatch preserves monthly anchor on non-date changes and updates it when nextPaymentDate changes', () => {
  const amountOnly = buildUpdatedSubscriptionFromPatch(baseSubscription, { amount: 19.99 });
  assert.equal(amountOnly.amount, 19.99);
  assert.equal(amountOnly.billingAnchorDay, 31);

  const movedDate = buildUpdatedSubscriptionFromPatch(baseSubscription, { nextPaymentDate: '2026-03-15' });
  assert.equal(movedDate.nextPaymentDate, '2026-03-15');
  assert.equal(movedDate.billingAnchorDay, 15);
});

test('buildUpdatedSubscriptionFromPatch clears customDate when switching away from custom period and syncs trialEndsOn for trials', () => {
  const customSub: Subscription = {
    ...baseSubscription,
    period: 'custom',
    customDate: '45',
    billingAnchorDay: undefined,
  };
  const yearly = buildUpdatedSubscriptionFromPatch(customSub, { period: 'yearly' });
  assert.equal(yearly.period, 'yearly');
  assert.equal(yearly.customDate, undefined);
  assert.equal(yearly.billingAnchorDay, undefined);

  const trialSub: Subscription = {
    ...baseSubscription,
    isTrial: true,
    trialEndsOn: '2026-07-10',
    nextPaymentDate: '2026-07-10',
  };
  const extendedTrial = buildUpdatedSubscriptionFromPatch(trialSub, { nextPaymentDate: '2026-07-20' });
  assert.equal(extendedTrial.trialEndsOn, '2026-07-20');
  assert.equal(extendedTrial.nextPaymentDate, '2026-07-20');
});

test('updateMissingFields flags missing customDate for custom period updates without an existing interval', () => {
  const missing = updateMissingFields(
    { subscriptionId: 'sub-1', patch: { period: 'custom' } },
    baseSubscription
  );
  assert.deepEqual(missing.missingFields, ['customDate']);

  const satisfied = updateMissingFields(
    { subscriptionId: 'sub-1', patch: { period: 'custom', customDate: '30' } },
    baseSubscription
  );
  assert.equal(satisfied.missingFields, undefined);

  assert.deepEqual(
    [...warnedFields(['amount_inferred', 'nextPaymentDate_missing', 'unknown_flag'])],
    ['amount', 'nextPaymentDate']
  );
});
