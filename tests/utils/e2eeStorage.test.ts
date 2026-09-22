import test from 'node:test';
import assert from 'node:assert/strict';
import { privateStorage, protectLocalAccount, clearVaultMemory, modeKey } from '../../src/lib/e2ee/storage.ts';

test('encrypted account caches are cleared and subsequent plaintext stays in memory only', () => {
  const values = new Map<string, string>();
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  try {
    const key = 'subscription-tracker-data:user:alice';
    values.set(key, '["old plaintext"]');
    values.set('subscription-tracker-local-owner', JSON.stringify({ userId: 'alice' }));
    values.set('subscription-tracker-data', '["legacy guest copy"]');
    values.set('subscription-tracker-data:user:bob', '["other account"]');
    protectLocalAccount('alice');
    assert.equal(values.has(key), false);
    assert.equal(values.has('subscription-tracker-data'), false);
    assert.equal(values.get('subscription-tracker-data:user:bob'), '["other account"]');
    assert.equal(values.get(modeKey('alice')), 'enabled');
    privateStorage.setItem(key, '["new plaintext"]');
    assert.equal(values.has(key), false);
    assert.equal(privateStorage.getItem(key), '["new plaintext"]');
    clearVaultMemory();
    assert.equal(privateStorage.getItem(key), null);
    privateStorage.setItem('subscription-tracker-data:user:bob', '["ordinary cache"]');
    assert.equal(values.get('subscription-tracker-data:user:bob'), '["ordinary cache"]');
  } finally {
    clearVaultMemory();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
  }
});
