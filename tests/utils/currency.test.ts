import test from 'node:test';
import assert from 'node:assert/strict';
import {
 convertCurrencySafe,
 formatCurrency,
 getCachedExchangeRatesWithStatus,
 getStoredExchangeRatesSnapshot,
 refreshExchangeRatesWithStatus
} from '../../src/utils/currency.ts';
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

test('formatCurrency applies locale-aware separators and symbols', () => {
 assert.equal(formatCurrency(1234.5, 'USD', 'en'), '$1,234.50');
 assert.match(formatCurrency(1234.5, 'USD', 'zh-CN'), /US\$\s?1,234.50/);
});

const createLocalStorageMock = () => {
 const storage = new Map<string, string>();

 return {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
   storage.set(key, value);
  },
  removeItem: (key: string) => {
   storage.delete(key);
  },
  clear: () => {
   storage.clear();
  }
 };
};

test('getCachedExchangeRatesWithStatus uses fresh live cache without refetching', async () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 const originalFetch = globalThis.fetch;
 const originalDateNow = Date.now;
 let fetchCalls = 0;

 globalThis.localStorage = localStorageMock as Storage;
 globalThis.fetch = (async () => {
  fetchCalls += 1;
  throw new Error('fetch should not be called for fresh live cache');
 }) as typeof fetch;
 Date.now = () => 1_000_000;

 try {
  localStorage.setItem('exchange-rates-USD', JSON.stringify({ USD: 1, EUR: 0.82 }));
  localStorage.setItem('exchange-rates-timestamp-USD', String(Date.now() - 5_000));
  localStorage.setItem('exchange-rates-source-USD', 'live');

  const result = await getCachedExchangeRatesWithStatus('USD');

  assert.deepEqual(result.rates, { USD: 1, EUR: 0.82 });
  assert.equal(result.source, 'live');
  assert.equal(result.updatedAt, Date.now() - 5_000);
  assert.equal(result.stale, false);
  assert.equal(fetchCalls, 0);
 } finally {
  Date.now = originalDateNow;
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});

test('getCachedExchangeRatesWithStatus retries network when the cached snapshot is fallback', async () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 const originalFetch = globalThis.fetch;
 const originalDateNow = Date.now;
 let fetchCalls = 0;

 globalThis.localStorage = localStorageMock as Storage;
 globalThis.fetch = (async () => {
  fetchCalls += 1;
  return {
   ok: true,
   json: async () => ({
    rates: {
     USD: 1,
     EUR: 0.81
    }
   })
  } as Response;
 }) as typeof fetch;
 Date.now = () => 2_000_000;

 try {
  localStorage.setItem('exchange-rates-USD', JSON.stringify({ USD: 1, EUR: 0.85 }));
  localStorage.setItem('exchange-rates-timestamp-USD', String(Date.now() - 5_000));
  localStorage.setItem('exchange-rates-source-USD', 'fallback');

  const result = await getCachedExchangeRatesWithStatus('USD');

  assert.equal(fetchCalls, 1);
  assert.equal(result.source, 'live');
  assert.deepEqual(result.rates, { USD: 1, EUR: 0.81 });
  assert.equal(result.updatedAt, Date.now());
  assert.equal(result.stale, false);
  assert.equal(localStorage.getItem('exchange-rates-source-USD'), 'live');
 } finally {
  Date.now = originalDateNow;
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});

test('refreshExchangeRatesWithStatus bypasses a fresh live cache', async () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 const originalFetch = globalThis.fetch;
 const originalDateNow = Date.now;
 let fetchCalls = 0;

 globalThis.localStorage = localStorageMock as Storage;
 globalThis.fetch = (async () => {
  fetchCalls += 1;
  return {
   ok: true,
   json: async () => ({
    rates: {
     USD: 1,
     EUR: 0.79
    }
   })
  } as Response;
 }) as typeof fetch;
 Date.now = () => 3_000_000;

 try {
  localStorage.setItem('exchange-rates-USD', JSON.stringify({ USD: 1, EUR: 0.82 }));
  localStorage.setItem('exchange-rates-timestamp-USD', String(Date.now() - 5_000));
  localStorage.setItem('exchange-rates-source-USD', 'live');

  const result = await refreshExchangeRatesWithStatus('USD');

  assert.equal(fetchCalls, 1);
  assert.equal(result.source, 'live');
  assert.deepEqual(result.rates, { USD: 1, EUR: 0.79 });
  assert.equal(result.updatedAt, Date.now());
  assert.equal(result.stale, false);
  assert.equal(localStorage.getItem('exchange-rates-USD'), JSON.stringify({ USD: 1, EUR: 0.79 }));
 } finally {
  Date.now = originalDateNow;
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});

test('refreshExchangeRatesWithStatus keeps the last live snapshot when refresh fails', async () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 const originalFetch = globalThis.fetch;
 const originalDateNow = Date.now;

 globalThis.localStorage = localStorageMock as Storage;
 globalThis.fetch = (async () => ({
  ok: false,
  status: 503
 })) as typeof fetch;
 Date.now = () => 4_000_000;

 try {
  localStorage.setItem('exchange-rates-USD', JSON.stringify({ USD: 1, EUR: 0.83 }));
  localStorage.setItem('exchange-rates-timestamp-USD', '3994000');
  localStorage.setItem('exchange-rates-source-USD', 'live');

  const result = await refreshExchangeRatesWithStatus('USD');

  assert.equal(result.source, 'live');
  assert.deepEqual(result.rates, { USD: 1, EUR: 0.83 });
  assert.equal(result.updatedAt, 3_994_000);
  assert.equal(result.stale, true);
  assert.match(result.error || '', /503/i);
 } finally {
  Date.now = originalDateNow;
  globalThis.fetch = originalFetch;
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});

test('getStoredExchangeRatesSnapshot returns cached metadata for the current base currency', () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;

 globalThis.localStorage = localStorageMock as Storage;

 try {
  localStorage.setItem('exchange-rates-CNY', JSON.stringify({ CNY: 1, USD: 0.14 }));
  localStorage.setItem('exchange-rates-timestamp-CNY', '12345');
  localStorage.setItem('exchange-rates-source-CNY', 'fallback');

  const snapshot = getStoredExchangeRatesSnapshot('CNY');

  assert.deepEqual(snapshot, {
   rates: { CNY: 1, USD: 0.14 },
   source: 'fallback',
   updatedAt: 12345
  });
 } finally {
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});
