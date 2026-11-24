import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeAndVerifyMnemonic,
  generateRecoveryMnemonic,
  MnemonicValidationError,
  normalizeMnemonicWords,
  RECOVERY_WORD_COUNT,
} from '../../src/lib/e2ee/mnemonic.ts';
import {
  createDekCheck,
  decodeVaultKeyToken,
  decryptBarkPushPayload,
  decryptCategoryPayload,
  decryptSubscriptionPayload,
  deriveMnemonicKek,
  derivePrfKek,
  encodeVaultKeyToken,
  encryptBarkPushPayload,
  encryptCategoryPayload,
  encryptSubscriptionPayload,
  generateBarkEncryptionKey,
  generateDekBytes,
  generateRandomSaltBase64,
  importDek,
  unwrapDek,
  verifyDekCheck,
  wrapDek,
} from '../../src/lib/e2ee/crypto.ts';
import {
  clearTrustedDeviceVaultMaterial,
  loadEncryptedOfflineSnapshot,
  persistTrustedDeviceVaultMaterial,
  restoreTrustedDeviceVaultMaterial,
  saveEncryptedOfflineSnapshot,
} from '../../src/lib/e2ee/deviceKeyStore.ts';
import { buildPushSchedulesForSubscription } from '../../src/lib/e2ee/pushScheduleBuilder.ts';
import type { Subscription } from '../../src/types.ts';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

test('16-word recovery mnemonic generates valid checksummed phrases and catches typos/swaps', async () => {
  const phrase = await generateRecoveryMnemonic();
  const words = phrase.split(' ');
  assert.equal(words.length, RECOVERY_WORD_COUNT);

  // Supports numbered paste and uppercase whitespace variations
  const numberedPaste = words.map((w, idx) => `${idx + 1}. ${w.toUpperCase()}`).join('\n');
  assert.deepEqual(normalizeMnemonicWords(numberedPaste), words);

  const entropy1 = await decodeAndVerifyMnemonic(phrase);
  const entropy2 = await decodeAndVerifyMnemonic(numberedPaste);
  assert.equal(entropy1.byteLength, 21);
  assert.deepEqual(entropy1, entropy2);

  // Reject wrong word count
  await assert.rejects(
    () => decodeAndVerifyMnemonic(words.slice(0, 15).join(' ')),
    (err: unknown) => err instanceof MnemonicValidationError && err.code === 'wrong_word_count'
  );

  // Reject unknown word
  const withUnknown = [...words];
  withUnknown[3] = 'notawordxyz';
  await assert.rejects(
    () => decodeAndVerifyMnemonic(withUnknown.join(' ')),
    (err: unknown) => err instanceof MnemonicValidationError && err.code === 'unknown_word'
  );
});

test('envelope encryption wraps the same DEK under both 16-word recovery key and Passkey PRF', async () => {
  const dekBytes = generateDekBytes();
  const dek = await importDek(dekBytes);
  const dekCheck = await createDekCheck(dek, USER_A, 1);

  // Slot 1: 16-word recovery phrase
  const mnemonic = await generateRecoveryMnemonic();
  const mnemonicSalt = generateRandomSaltBase64(32);
  const mnemonicKek = await deriveMnemonicKek(mnemonic, mnemonicSalt);
  const wrappedByMnemonic = await wrapDek(mnemonicKek, dekBytes, USER_A, 'recovery_mnemonic');

  // Slot 2: Simulated WebAuthn Passkey PRF 32-byte deterministic output
  const simulatedPrfOutput = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const hkdfSalt = generateRandomSaltBase64(32);
  const prfKek = await derivePrfKek(simulatedPrfOutput, hkdfSalt);
  const wrappedByPasskey = await wrapDek(prfKek, dekBytes, USER_A, 'passkey_prf');

  // Encrypt a subscription row with DEK
  const subId = '33333333-3333-4333-8333-333333333333';
  const rowEnvelope = await encryptSubscriptionPayload(dek, USER_A, subId, {
    name: 'Netflix Standard',
    category: 'Entertainment',
    amount: 15.99,
    currency: 'USD',
    period: 'monthly',
    lastPaymentDate: '2026-11-15',
    nextPaymentDate: '2026-12-15',
    billingAnchorDay: 15,
    notificationEnabled: true,
    isTrial: false,
    status: 'active',
  });

  // Unlock via Passkey PRF on a new device -> decrypts the exact subscription
  const prfKekNewDevice = await derivePrfKek(simulatedPrfOutput, hkdfSalt);
  const dekFromPasskeyBytes = await unwrapDek(prfKekNewDevice, wrappedByPasskey, USER_A, 'passkey_prf');
  const dekFromPasskey = await importDek(dekFromPasskeyBytes);
  assert.equal(await verifyDekCheck(dekFromPasskey, dekCheck, USER_A, 1), true);
  const decryptedViaPasskey = await decryptSubscriptionPayload(dekFromPasskey, USER_A, subId, rowEnvelope);
  assert.equal(decryptedViaPasskey.name, 'Netflix Standard');
  assert.equal(decryptedViaPasskey.amount, 15.99);

  // Unlock via 16-word Recovery Phrase -> unwraps the exact same DEK
  const mnemonicKekRecovery = await deriveMnemonicKek(mnemonic, mnemonicSalt);
  const dekFromMnemonicBytes = await unwrapDek(mnemonicKekRecovery, wrappedByMnemonic, USER_A, 'recovery_mnemonic');
  assert.deepEqual(dekFromMnemonicBytes, dekBytes);

  // AAD prevents cross-user or cross-record ciphertext substitution
  await assert.rejects(() =>
    decryptSubscriptionPayload(dekFromPasskey, USER_B, subId, rowEnvelope)
  );
  await assert.rejects(() =>
    decryptSubscriptionPayload(dekFromPasskey, USER_A, '44444444-4444-4444-8444-444444444444', rowEnvelope)
  );

  // Category envelope round-trip
  const catEnv = await encryptCategoryPayload(dek, USER_A, 'custom-ai', {
    id: 'custom-ai',
    name: 'AI 工具',
    order: 2,
    isBuiltIn: false,
    isHidden: false,
  });
  const catDec = await decryptCategoryPayload(dek, USER_A, 'custom-ai', catEnv);
  assert.equal(catDec.name, 'AI 工具');

  // Vault token encode/decode
  const token = encodeVaultKeyToken(dekBytes);
  assert.ok(token.startsWith('vk1_'));
  assert.deepEqual(decodeVaultKeyToken(token), dekBytes);
});

test('Bark native AES-256-CBC encryption and push schedule builder hide plaintext from server', async () => {
  const dekBytes = generateDekBytes();
  const barkKey = generateBarkEncryptionKey();
  assert.equal(barkKey.length, 32);

  const sampleSub: Subscription = {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Claude Pro',
    category: 'Productivity',
    amount: 20,
    currency: 'USD',
    period: 'monthly',
    lastPaymentDate: '2026-11-10',
    nextPaymentDate: '2026-12-10',
    billingAnchorDay: 10,
    notificationEnabled: true,
    status: 'active',
  };

  const { subscriptionHash, rows } = await buildPushSchedulesForSubscription(sampleSub, dekBytes, {
    barkEnabled: true,
    daysBefore: 3,
    timeZone: 'UTC',
    locale: 'zh-CN',
    barkMode: 'bark_e2ee',
    barkEncryptionKey: barkKey,
    now: new Date('2026-11-24T08:00:00.000Z'),
    maxCyclesPerSubscription: 6,
  });

  assert.match(subscriptionHash, /^[a-f0-9]{64}$/);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].trigger_date, '2026-12-07');
  assert.equal(rows[0].payload_mode, 'bark_ciphertext');
  assert.ok(rows[0].bark_ciphertext && !rows[0].bark_ciphertext.includes('Claude'));
  assert.ok(rows[0].bark_iv && rows[0].bark_iv.length === 16);

  // Simulate iPhone Bark Notification Service Extension decrypting the payload locally
  const unlockedPush = await decryptBarkPushPayload(
    barkKey,
    rows[0].bark_ciphertext!,
    rows[0].bark_iv!
  );
  assert.equal(unlockedPush.title, 'SteadyRenew');
  assert.match(unlockedPush.body, /Claude Pro/);
  assert.match(unlockedPush.body, /20/);

  // Direct round-trip with 16-char AES-128 key also works
  const key16 = 'A1b2C3d4E5f6G7h8';
  const enc16 = await encryptBarkPushPayload(key16, { title: 'Test', body: 'Hello' });
  const dec16 = await decryptBarkPushPayload(key16, enc16.ciphertext, enc16.iv);
  assert.equal(dec16.title, 'Test');
  assert.equal(dec16.body, 'Hello');
});

test('trusted-device non-extractable keystore and encrypted offline snapshot round-trip cleanly', async () => {
  const dekBytes = generateDekBytes();
  const dek = await importDek(dekBytes);
  const barkKey = generateBarkEncryptionKey();

  const storageMap = new Map<string, string>();
  const prevStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => { storageMap.set(k, v); },
      removeItem: (k: string) => { storageMap.delete(k); },
    },
  });

  try {
    await persistTrustedDeviceVaultMaterial(USER_A, dekBytes, 1, barkKey);
    const restored = await restoreTrustedDeviceVaultMaterial(USER_A, 1);
    assert.ok(restored);
    assert.deepEqual(restored.dekBytes, dekBytes);
    assert.equal(restored.barkEncryptionKey, barkKey);

    await saveEncryptedOfflineSnapshot(dek, USER_A, {
      subscriptions: [
        {
          id: 'sub-1',
          name: 'Secret Sub',
          category: 'Other',
          amount: 9.99,
          currency: 'USD',
          period: 'monthly',
          lastPaymentDate: '2026-11-01',
          nextPaymentDate: '2026-12-01',
          notificationEnabled: true,
        },
      ],
      pendingOperations: [],
      categories: [],
      pendingCategories: null,
    });

    const rawStored = storageMap.get(`subscription-tracker-e2ee-cache:user:${USER_A}`) ?? '';
    assert.ok(rawStored.length > 0);
    assert.equal(rawStored.includes('Secret Sub'), false);

    const snap = await loadEncryptedOfflineSnapshot(dek, USER_A);
    assert.equal(snap?.subscriptions[0]?.name, 'Secret Sub');

    await clearTrustedDeviceVaultMaterial(USER_A);
    assert.equal(await restoreTrustedDeviceVaultMaterial(USER_A, 1), null);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: prevStorage,
    });
  }
});
