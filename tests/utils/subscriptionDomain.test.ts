import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createSubscriptionRecord,
 subscriptionCreateInputSchema,
 updateSubscriptionRecord,
} from '../../src/utils/subscriptionDomain.ts';

const validInput = {
 name: '  ChatGPT Plus  ',
 category: 'Software',
 amount: 20,
 currency: 'USD' as const,
 period: 'monthly' as const,
 lastPaymentDate: '2026-01-31',
 notificationEnabled: true,
};

test('createSubscriptionRecord normalizes text and derives renewal timestamps', () => {
 const subscription = createSubscriptionRecord(validInput, {
  id: 'sub-1',
  now: '2026-01-31T10:00:00.000Z',
 });

 assert.equal(subscription.name, 'ChatGPT Plus');
 assert.equal(subscription.nextPaymentDate, '2026-02-28');
 assert.equal(subscription.createdAt, '2026-01-31T10:00:00.000Z');
 assert.equal(subscription.updatedAt, '2026-01-31T10:00:00.000Z');
});

test('subscription schema rejects invalid calendar dates and excessive precision', () => {
 assert.equal(subscriptionCreateInputSchema.safeParse({
  ...validInput,
  lastPaymentDate: '2026-02-30',
 }).success, false);

 assert.equal(subscriptionCreateInputSchema.safeParse({
  ...validInput,
  amount: 12.345,
 }).success, false);
});

test('subscription schema requires custom days only for custom periods', () => {
 assert.equal(subscriptionCreateInputSchema.safeParse({
  ...validInput,
  period: 'custom',
 }).success, false);

 assert.equal(subscriptionCreateInputSchema.safeParse({
  ...validInput,
  customDate: '30',
 }).success, false);
});

test('updateSubscriptionRecord preserves identity and creation time while deriving next payment', () => {
 const existing = createSubscriptionRecord(validInput, {
  id: 'sub-1',
  now: '2026-01-01T00:00:00.000Z',
 });
 const updated = updateSubscriptionRecord(existing, {
  ...validInput,
  period: 'yearly',
  lastPaymentDate: '2024-02-29',
 }, '2026-02-01T00:00:00.000Z');

 assert.equal(updated.id, 'sub-1');
 assert.equal(updated.createdAt, '2026-01-01T00:00:00.000Z');
 assert.equal(updated.updatedAt, '2026-02-01T00:00:00.000Z');
 assert.equal(updated.nextPaymentDate, '2025-02-28');
});
