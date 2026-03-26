import test from 'node:test';
import assert from 'node:assert/strict';
import { convertCurrencySafe } from '../../src/utils/currency.ts';
import { Currency, ExchangeRates } from '../../src/types.ts';

test('convertCurrencySafe uses live rates when all required rates are present', () => {
 const rates: ExchangeRates = {
  USD: 1,
  EUR: 0.8,
  CNY: 7.2,
 };

 const result = convertCurrencySafe(10, 'USD', 'EUR', rates, 'USD');

 assert.equal(result.amount, 8);
 assert.equal(result.usedFallback, false);
 assert.equal(result.isAccurate, true);
 assert.equal(result.error, undefined);
});

test('convertCurrencySafe marks the result as approximate when it falls back to offline rates', () => {
 const result = convertCurrencySafe(10, 'USD', 'EUR', {}, 'USD');

 assert.equal(result.amount, 8.5);
 assert.equal(result.usedFallback, true);
 assert.equal(result.isAccurate, false);
 assert.match(result.error || '', /fallback rate/i);
});

test('convertCurrencySafe returns an explicit error when no live or fallback rate exists', () => {
 const result = convertCurrencySafe(
  10,
  'USD',
  'BRL' as Currency,
  {},
  'USD'
 );

 assert.equal(result.amount, 10);
 assert.equal(result.usedFallback, true);
 assert.equal(result.isAccurate, false);
 assert.match(result.error || '', /not available/i);
});
