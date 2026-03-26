import test from 'node:test';
import assert from 'node:assert/strict';
import {
 MAX_SUBSCRIPTION_AMOUNT,
 validateSubscriptionAmount,
} from '../../src/utils/subscriptionValidation.ts';

test('validateSubscriptionAmount allows zero-value subscriptions', () => {
 assert.equal(validateSubscriptionAmount('0'), null);
 assert.equal(validateSubscriptionAmount('0.00'), null);
});

test('validateSubscriptionAmount rejects values above the configured max', () => {
 assert.equal(
  validateSubscriptionAmount((MAX_SUBSCRIPTION_AMOUNT + 1).toString()),
  `Amount cannot exceed ${MAX_SUBSCRIPTION_AMOUNT}`
 );
});

test('validateSubscriptionAmount rejects scientific notation and excessive decimals', () => {
 assert.match(
  validateSubscriptionAmount('1e6') || '',
  /valid number with up to 2 decimal places/i
 );
 assert.match(
  validateSubscriptionAmount('12.345') || '',
  /valid number with up to 2 decimal places/i
 );
});
