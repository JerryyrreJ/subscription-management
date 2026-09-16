import test from 'node:test';
import assert from 'node:assert/strict';
import {
 MAX_SUBSCRIPTION_AMOUNT,
 isAllowedSubscriptionAmountInput,
 normalizeSubscriptionAmountInput,
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

test('validateSubscriptionAmount is currency-aware for JPY vs CNY/USD', () => {
 assert.equal(validateSubscriptionAmount('100', 'JPY'), null);
 assert.equal(validateSubscriptionAmount('100.5', 'JPY'), 'Amount must be a whole number');
 assert.equal(validateSubscriptionAmount('100.', 'JPY'), 'Amount must be a whole number');
 assert.equal(validateSubscriptionAmount('12.34', 'CNY'), null);
 assert.equal(validateSubscriptionAmount('12.34', 'USD'), null);
 assert.equal(
  validateSubscriptionAmount('12.345', 'USD'),
  'Amount must be a valid number with up to 2 decimal places'
 );
});

test('isAllowedSubscriptionAmountInput blocks letters and extra decimals while allowing drafts', () => {
 assert.equal(isAllowedSubscriptionAmountInput(''), true);
 assert.equal(isAllowedSubscriptionAmountInput('0'), true);
 assert.equal(isAllowedSubscriptionAmountInput('12.'), true);
 assert.equal(isAllowedSubscriptionAmountInput('12.3'), true);
 assert.equal(isAllowedSubscriptionAmountInput('12.34'), true);
 assert.equal(isAllowedSubscriptionAmountInput('po'), false);
 assert.equal(isAllowedSubscriptionAmountInput('12a'), false);
 assert.equal(isAllowedSubscriptionAmountInput('12.345'), false);
 assert.equal(isAllowedSubscriptionAmountInput('-1'), false);
 assert.equal(isAllowedSubscriptionAmountInput('1e6'), false);
 assert.equal(isAllowedSubscriptionAmountInput('.5'), false);
});

test('isAllowedSubscriptionAmountInput rejects JPY decimals including paste-like drafts', () => {
 assert.equal(isAllowedSubscriptionAmountInput('', 'JPY'), true);
 assert.equal(isAllowedSubscriptionAmountInput('100', 'JPY'), true);
 assert.equal(isAllowedSubscriptionAmountInput('100.5', 'JPY'), false);
 assert.equal(isAllowedSubscriptionAmountInput('100.', 'JPY'), false);
 assert.equal(isAllowedSubscriptionAmountInput('12.34', 'JPY'), false);
 assert.equal(isAllowedSubscriptionAmountInput('12.34', 'USD'), true);
 assert.equal(isAllowedSubscriptionAmountInput('12.34', 'CNY'), true);
});

test('normalizeSubscriptionAmountInput rounds when switching to fewer fraction digits', () => {
 assert.equal(normalizeSubscriptionAmountInput('12.34', 'JPY'), '12');
 assert.equal(normalizeSubscriptionAmountInput('12.6', 'JPY'), '13');
 assert.equal(normalizeSubscriptionAmountInput('12.', 'JPY'), '12');
 assert.equal(normalizeSubscriptionAmountInput('12.34', 'USD'), '12.34');
 assert.equal(normalizeSubscriptionAmountInput('12.10', 'CNY'), '12.1');
 assert.equal(normalizeSubscriptionAmountInput('', 'JPY'), '');
});
