import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRecoveryKey, importRecoveryKey, encryptVault, decryptVault } from '../../src/lib/e2ee/crypto.ts';

test('recovery key roundtrip, random nonces, no plaintext in envelope', async () => {
  const secret = generateRecoveryKey();
  assert.match(secret, /^(?:[a-f0-9]{8}-){7}[a-f0-9]{8}$/);
  const key = await importRecoveryKey(secret);
  assert.equal(key.extractable, false);
  const payload = { version: 1, subscriptions: [{ name: 'Private subscription 中文', amount: 13.99 }], categories: [] };
  const first = await encryptVault(key, 'alice', payload);
  const second = await encryptVault(key, 'alice', payload);
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(JSON.stringify(first).includes('Private subscription'), false);
  assert.deepEqual(await decryptVault(await importRecoveryKey(secret.toUpperCase()), 'alice', first), payload);
});

test('wrong keys, account substitution, tampering and unsupported formats are rejected', async () => {
  const key = await importRecoveryKey(generateRecoveryKey());
  const envelope = await encryptVault(key, 'alice', { subscriptions: [] });
  await assert.rejects(decryptVault(await importRecoveryKey(generateRecoveryKey()), 'alice', envelope));
  await assert.rejects(decryptVault(key, 'bob', envelope));
  await assert.rejects(decryptVault(key, 'alice', { ...envelope, ciphertext: (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1) }));
  await assert.rejects(decryptVault(key, 'alice', { ...envelope, nonce: 'AA==' }));
  await assert.rejects(importRecoveryKey('short-password'));
});
