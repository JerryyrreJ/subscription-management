import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import { resources } from '../../src/i18n/resources.ts';
import { translateSubscriptionFormError } from '../../src/utils/subscriptionFormErrors.ts';
import { MAX_SUBSCRIPTION_AMOUNT } from '../../src/utils/subscriptionValidation.ts';

const t = ((key: string, options?: { max?: number }) => {
 if (key === 'addSubscription:amountExceedsMax') {
  return `Amount cannot exceed ${options?.max}`;
 }

 const [, ...path] = key.split(/[:.]/);
 let current: unknown = resources.en.addSubscription;
 for (const segment of path) {
  current = current && typeof current === 'object'
   ? (current as Record<string, unknown>)[segment]
   : undefined;
 }
 return typeof current === 'string' ? current : key;
}) as TFunction;

test('maps domain amount and field errors onto addSubscription copy', () => {
 assert.equal(translateSubscriptionFormError('Amount is required', t), 'Amount is required');
 assert.equal(
  translateSubscriptionFormError(`Amount cannot exceed ${MAX_SUBSCRIPTION_AMOUNT}`, t),
  `Amount cannot exceed ${MAX_SUBSCRIPTION_AMOUNT}`
 );
 assert.equal(translateSubscriptionFormError('Name is required', t), 'Name is required.');
 assert.equal(translateSubscriptionFormError('Custom period is required', t), 'Custom period is required.');
 assert.equal(translateSubscriptionFormError('Next payment date cannot be in the past', t), 'Next renewal date cannot be in the past.');
 assert.equal(translateSubscriptionFormError('Unknown boom', t), 'Unknown boom');
});
