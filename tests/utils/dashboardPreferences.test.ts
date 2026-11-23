import test from 'node:test';
import assert from 'node:assert/strict';
import {
 loadBaseCurrency,
 loadSortConfig,
 loadViewMode,
 saveBaseCurrency,
 saveSortConfig,
 saveViewMode,
} from '../../src/utils/dashboardPreferences.ts';

function withMockLocalStorage(run: (store: Map<string, string>) => void) {
 const store = new Map<string, string>();
 const original = globalThis.localStorage;
 Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
   getItem: (key: string) => store.get(key) ?? null,
   setItem: (key: string, value: string) => {
    store.set(key, String(value));
   },
   removeItem: (key: string) => {
    store.delete(key);
   },
   clear: () => {
    store.clear();
   },
  },
 });

 try {
  run(store);
 } finally {
  Object.defineProperty(globalThis, 'localStorage', {
   configurable: true,
   value: original,
  });
 }
}

test('loadBaseCurrency defaults by locale when nothing is saved', () => {
 withMockLocalStorage(() => {
  assert.equal(loadBaseCurrency('zh-CN'), 'CNY');
  assert.equal(loadBaseCurrency('zh'), 'CNY');
  assert.equal(loadBaseCurrency('en'), 'USD');
  assert.equal(loadBaseCurrency('en-US'), 'USD');
 });
});

test('saveBaseCurrency persists currency and ignores unsupported stored values', () => {
 withMockLocalStorage((store) => {
  saveBaseCurrency('EUR');
  assert.equal(loadBaseCurrency('zh-CN'), 'EUR');

  store.set('dashboard_base_currency', 'INVALID_CODE');
  assert.equal(loadBaseCurrency('en-US'), 'USD');
  assert.equal(loadBaseCurrency('zh-CN'), 'CNY');
 });
});

test('saveViewMode and loadViewMode persist monthly/yearly and ignore invalid entries', () => {
 withMockLocalStorage((store) => {
  assert.equal(loadViewMode(), 'monthly');

  saveViewMode('yearly');
  assert.equal(loadViewMode(), 'yearly');

  store.set('dashboard_view_mode', 'weekly');
  assert.equal(loadViewMode(), 'monthly');
 });
});

test('saveSortConfig and loadSortConfig persist valid config and recover from malformed JSON', () => {
 withMockLocalStorage((store) => {
  assert.deepEqual(loadSortConfig(), { sortBy: 'nextPaymentDate', sortOrder: 'asc' });

  saveSortConfig({ sortBy: 'amount', sortOrder: 'desc' });
  assert.deepEqual(loadSortConfig(), { sortBy: 'amount', sortOrder: 'desc' });

  store.set('dashboard_sort_config', '{broken json');
  assert.deepEqual(loadSortConfig(), { sortBy: 'nextPaymentDate', sortOrder: 'asc' });

  store.set('dashboard_sort_config', JSON.stringify({ sortBy: 'unknown', sortOrder: 'desc' }));
  assert.deepEqual(loadSortConfig(), { sortBy: 'nextPaymentDate', sortOrder: 'asc' });
 });
});
