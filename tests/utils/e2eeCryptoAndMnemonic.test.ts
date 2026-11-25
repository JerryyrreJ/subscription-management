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
  computeDekControlProofHash,
  computeSubscriptionPushHash,
  createDekCheck,
  decodeVaultKeyToken,
  decryptAuditPayload,
  decryptBarkPushPayload,
  decryptCategoryPayload,
  decryptSubscriptionPayload,
  deriveDekControlProof,
  deriveMnemonicKek,
  derivePrfKek,
  encodeVaultKeyToken,
  encryptAuditPayload,
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
  clearEncryptedOfflineSnapshot,
  clearTrustedDeviceVaultMaterial,
  loadEncryptedOfflineSnapshot,
  persistTrustedDeviceVaultMaterial,
  restoreTrustedDeviceVaultMaterial,
  saveEncryptedOfflineSnapshot,
  scrubPlaintextUserLocalStorage,
} from '../../src/lib/e2ee/deviceKeyStore.ts';
import { buildPushSchedulesForSubscription } from '../../src/lib/e2ee/pushScheduleBuilder.ts';
import { executeEnableVaultMigration } from '../../src/lib/e2ee/vaultEnable.ts';
import {
  executeDisableVaultMigration,
  executeRotateVaultDek,
} from '../../src/lib/e2ee/vaultLifecycle.ts';
import type { Envelope } from '../../src/lib/e2ee/crypto.ts';
import type { ReminderSettings, Subscription } from '../../src/types.ts';

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

test('crypto primitives reject all-zero PRF outputs and all-zero DEKs', async () => {
  const zero32 = new Uint8Array(32);
  const salt = generateRandomSaltBase64(32);

  await assert.rejects(
    () => derivePrfKek(zero32, salt),
    /cannot be all zeros/i
  );

  await assert.rejects(
    () => importDek(zero32),
    /cannot be all zeros/i
  );

  const validPrf = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const kek = await derivePrfKek(validPrf, salt);
  await assert.rejects(
    () => wrapDek(kek, zero32, USER_A, 'passkey_prf'),
    /cannot be all zeros/i
  );
});

test('retrying executeEnableVaultMigration after a failure preserves real Passkey PRF bytes and never wraps DEK with zeros', async () => {
  const realPrfBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const expectedPrfCopy = realPrfBytes.slice();
  const hkdfSalt = generateRandomSaltBase64(32);
  const prfSalt = generateRandomSaltBase64(32);
  const mnemonic = await generateRecoveryMnemonic();

  const passkeyMaterial = {
    label: 'iCloud Keychain',
    credentialId: 'cred-retry-test',
    prfBytes: realPrfBytes,
    kdfParams: {
      alg: 'WebAuthn-PRF-HKDF-SHA256' as const,
      prfSalt,
      hkdfSalt,
      rpId: 'steadyrenew.com',
    },
  };

  const reminderSettings: ReminderSettings = {
    timeZone: 'UTC',
    locale: 'en',
    barkPush: {
      enabled: false,
      serverUrl: 'https://api.day.app',
      deviceKey: '',
      daysBefore: 3,
      notificationHistory: {},
    },
  };

  let enableAttempt = 0;
  let storedDekCheck: Envelope | null = null;
  let storedSlots: Array<{
    slot_type: 'recovery_mnemonic' | 'passkey_prf';
    wrapped_dek: Envelope;
  }> = [];

  const fakeClient = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === 'prepare_e2ee_migration') {
        return {
          data: { token: `token-${enableAttempt + 1}`, snapshot: { subscriptions: [], categories: [] } },
          error: null,
        };
      }
      if (name === 'enable_e2ee_vault') {
        enableAttempt += 1;
        if (enableAttempt === 1) {
          return {
            data: null,
            error: new Error('Account data changed on another device. Sync and retry.'),
          };
        }
        storedDekCheck = args?.p_dek_check as Envelope;
        assert.match(String(args?.p_dek_verifier_hash ?? ''), /^[a-f0-9]{64}$/);
        storedSlots = ((args?.p_key_slots ?? []) as Array<Record<string, unknown>>).map(slot => ({
          slot_type: slot.slot_type as 'recovery_mnemonic' | 'passkey_prf',
          wrapped_dek: slot.wrapped_dek as Envelope,
        }));
        return { data: null, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };

  // Attempt 1 fails due to concurrent change: caller PRF bytes must stay intact.
  await assert.rejects(
    () => executeEnableVaultMigration(
      fakeClient,
      {
        userId: USER_A,
        userEmail: 'owner@example.test',
        mnemonicPhrase: mnemonic,
        passkeyMaterial,
        barkMode: 'generic',
        localSubscriptions: [],
        localCategories: [],
      },
      reminderSettings
    ),
    /Account data changed/
  );
  assert.deepEqual(passkeyMaterial.prfBytes, expectedPrfCopy);

  // Attempt 2 succeeds: caller PRF bytes are zeroized afterwards, and stored slot
  // unwraps exclusively under the real PRF secret.
  const completed = await executeEnableVaultMigration(
    fakeClient,
    {
      userId: USER_A,
      userEmail: 'owner@example.test',
      mnemonicPhrase: mnemonic,
      passkeyMaterial,
      barkMode: 'generic',
      localSubscriptions: [],
      localCategories: [],
    },
    reminderSettings
  );

  try {
    assert.equal(passkeyMaterial.prfBytes.every(byte => byte === 0), true);
    const passkeySlot = storedSlots.find(slot => slot.slot_type === 'passkey_prf');
    assert.ok(passkeySlot);
    assert.ok(storedDekCheck);

    const realKek = await derivePrfKek(expectedPrfCopy, hkdfSalt);
    const unwrappedDekBytes = await unwrapDek(realKek, passkeySlot.wrapped_dek, USER_A, 'passkey_prf');
    assert.deepEqual(unwrappedDekBytes, completed.dekBytes);
    const unwrappedDek = await importDek(unwrappedDekBytes);
    assert.equal(await verifyDekCheck(unwrappedDek, storedDekCheck, USER_A, 1), true);

    // Explicitly verify a raw HKDF key derived from all-zero bytes cannot unwrap the slot.
    const zeroBaseKey = await globalThis.crypto.subtle.importKey(
      'raw',
      new Uint8Array(32),
      'HKDF',
      false,
      ['deriveKey']
    );
    const zeroKek = await globalThis.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: Uint8Array.from(atob(hkdfSalt), c => c.charCodeAt(0)),
        info: new TextEncoder().encode('steadyrenew-e2ee-passkey-prf-kek-v1'),
      },
      zeroBaseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    await assert.rejects(() => unwrapDek(zeroKek, passkeySlot.wrapped_dek, USER_A, 'passkey_prf'));
  } finally {
    completed.dekBytes.fill(0);
  }
});

test('HKDF domain separation isolates AEAD and HMAC subkeys and AAD binds keyEpoch across all envelopes', async () => {
  const dekBytes = generateDekBytes();
  const dek = await importDek(dekBytes);
  const subId = '66666666-6666-4666-8666-666666666666';

  // 1. AEAD subkey derived via HKDF must differ from raw dekBytes imported directly as AES-GCM.
  const subEnvEpoch2 = await encryptSubscriptionPayload(
    dek,
    USER_A,
    subId,
    {
      name: 'Domain Sep Sub',
      category: 'Other',
      amount: 10,
      currency: 'USD',
      period: 'monthly',
      lastPaymentDate: '2026-11-01',
      nextPaymentDate: '2026-12-01',
      notificationEnabled: true,
      status: 'active',
    },
    2
  );
  const rawAesKey = await globalThis.crypto.subtle.importKey(
    'raw',
    dekBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  await assert.rejects(() => decryptSubscriptionPayload(rawAesKey, USER_A, subId, subEnvEpoch2, 2));

  // 2. Push HMAC subkey derived via HKDF must differ from raw dekBytes HMAC-SHA256.
  const separatedHash = await computeSubscriptionPushHash(dekBytes, subId);
  const rawHmacKey = await globalThis.crypto.subtle.importKey(
    'raw',
    dekBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const rawSig = new Uint8Array(
    await globalThis.crypto.subtle.sign('HMAC', rawHmacKey, new TextEncoder().encode(`push-sub:v1:${subId}`))
  );
  const rawHex = Array.from(rawSig, b => b.toString(16).padStart(2, '0')).join('');
  assert.notEqual(separatedHash, rawHex);

  // 3. keyEpoch AAD binding rejects cross-epoch substitution for subscriptions, categories, audits, and wrapped DEKs.
  const decryptedEpoch2 = await decryptSubscriptionPayload(dek, USER_A, subId, subEnvEpoch2, 2);
  assert.equal(decryptedEpoch2.name, 'Domain Sep Sub');
  await assert.rejects(() => decryptSubscriptionPayload(dek, USER_A, subId, subEnvEpoch2, 1));

  const catEnv = await encryptCategoryPayload(
    dek,
    USER_A,
    'cat-1',
    { id: 'cat-1', name: 'Work', order: 0, isBuiltIn: false, isHidden: false },
    2
  );
  await assert.rejects(() => decryptCategoryPayload(dek, USER_A, 'cat-1', catEnv, 1));

  const auditEnv = await encryptAuditPayload(dek, USER_A, 'audit-1', { action: 'test' }, 2);
  assert.deepEqual(await decryptAuditPayload(dek, USER_A, 'audit-1', auditEnv, 2), { action: 'test' });
  await assert.rejects(() => decryptAuditPayload(dek, USER_A, 'audit-1', auditEnv, 1));

  const salt = generateRandomSaltBase64(32);
  const kek = await derivePrfKek(globalThis.crypto.getRandomValues(new Uint8Array(32)), salt);
  const wrappedEpoch2 = await wrapDek(kek, dekBytes, USER_A, 'passkey_prf', 2);
  assert.deepEqual(await unwrapDek(kek, wrappedEpoch2, USER_A, 'passkey_prf', 2), dekBytes);
  await assert.rejects(() => unwrapDek(kek, wrappedEpoch2, USER_A, 'passkey_prf', 1));
});

test('scrubPlaintextUserLocalStorage removes pending category sync without _v1 typo and clearEncryptedOfflineSnapshot clears offline cache', async () => {
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
    storageMap.set(`subscription_categories_pending_sync:user:${USER_A}`, JSON.stringify([{ id: 'secret' }]));
    storageMap.set(`subscription-tracker-data:user:${USER_A}`, JSON.stringify([{ name: 'Secret' }]));
    storageMap.set(`subscription-tracker-e2ee-cache:user:${USER_A}`, '{"version":1}');

    scrubPlaintextUserLocalStorage(USER_A);
    assert.equal(storageMap.has(`subscription_categories_pending_sync:user:${USER_A}`), false);
    assert.equal(storageMap.has(`subscription-tracker-data:user:${USER_A}`), false);

    clearEncryptedOfflineSnapshot(USER_A);
    assert.equal(storageMap.has(`subscription-tracker-e2ee-cache:user:${USER_A}`), false);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: prevStorage,
    });
  }
});

test('executeRotateVaultDek truly rotates DEK and keyEpoch, re-encrypting all data and invalidating old DEK', async () => {
  const oldDekBytes = generateDekBytes();
  const oldDek = await importDek(oldDekBytes);
  const oldProof = await deriveDekControlProof(oldDekBytes, USER_A, 1);
  const oldVerifierHash = await computeDekControlProofHash(oldProof);
  const newMnemonic = await generateRecoveryMnemonic();
  const subId = '88888888-8888-4888-8888-888888888888';

  const oldSubEnv = await encryptSubscriptionPayload(
    oldDek,
    USER_A,
    subId,
    {
      name: 'Rotated Service',
      category: 'Work',
      amount: 29,
      currency: 'USD',
      period: 'monthly',
      lastPaymentDate: '2026-11-01',
      nextPaymentDate: '2026-12-01',
      billingAnchorDay: 1,
      notificationEnabled: true,
      status: 'active',
    },
    1
  );
  const oldCatEnv = await encryptCategoryPayload(
    oldDek,
    USER_A,
    'cat-work',
    { id: 'cat-work', name: 'Work', order: 0, isBuiltIn: false, isHidden: false },
    1
  );

  let rotatedArgs: Record<string, unknown> | null = null;
  const fakeClient = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      if (fn === 'prepare_e2ee_encrypted_operation') {
        return {
          data: {
            token: 'enc-snap-token-1',
            key_epoch: 1,
            snapshot: {
              subscriptions: [{ id: subId, envelope: oldSubEnv, revision: 3 }],
              categories: [{ category_id: 'cat-work', envelope: oldCatEnv, revision: 1 }],
            },
          },
          error: null,
        };
      }
      if (fn === 'rotate_e2ee_dek') {
        assert.equal(args?.p_snapshot_token, 'enc-snap-token-1');
        const submittedHash = await computeDekControlProofHash(String(args?.p_current_control_proof ?? ''));
        assert.equal(submittedHash, oldVerifierHash);
        rotatedArgs = args ?? null;
        return { data: 2, error: null };
      }
      throw new Error(`Unexpected RPC: ${fn}`);
    },
  };

  const reminderSettings: ReminderSettings = {
    timeZone: 'UTC',
    locale: 'en',
    barkPush: {
      enabled: true,
      serverUrl: 'https://api.day.app',
      deviceKey: 'dev123',
      daysBefore: 3,
      notificationHistory: {},
    },
  };

  const rotated = await executeRotateVaultDek(
    fakeClient,
    {
      userId: USER_A,
      currentDek: oldDek,
      currentDekBytes: oldDekBytes,
      currentKeyEpoch: 1,
      newMnemonicPhrase: newMnemonic,
      barkMode: 'generic',
    },
    reminderSettings
  );

  try {
    assert.equal(rotated.newKeyEpoch, 2);
    assert.notDeepEqual(rotated.newDekBytes, oldDekBytes);
    assert.ok(rotatedArgs);

    const newSubs = rotatedArgs.p_subscriptions as Array<{ id: string; envelope: Envelope; subscription_hash: string }>;
    assert.equal(newSubs.length, 1);

    // Old DEK cannot decrypt the newly rotated subscription envelope (at epoch 1 or epoch 2)
    await assert.rejects(() => decryptSubscriptionPayload(oldDek, USER_A, subId, newSubs[0].envelope, 1));
    await assert.rejects(() => decryptSubscriptionPayload(oldDek, USER_A, subId, newSubs[0].envelope, 2));

    // New recovery phrase unwraps the new DEK at epoch 2 and decrypts cleanly
    const kdf = rotatedArgs.p_recovery_kdf_params as { salt: string };
    const newKek = await deriveMnemonicKek(newMnemonic, kdf.salt);
    const unwrappedNewDekBytes = await unwrapDek(
      newKek,
      rotatedArgs.p_recovery_wrapped_dek as Envelope,
      USER_A,
      'recovery_mnemonic',
      2
    );
    assert.deepEqual(unwrappedNewDekBytes, rotated.newDekBytes);
    const unwrappedNewDek = await importDek(unwrappedNewDekBytes);
    assert.equal(await verifyDekCheck(unwrappedNewDek, rotatedArgs.p_new_dek_check as Envelope, USER_A, 2), true);
    const decryptedSub = await decryptSubscriptionPayload(unwrappedNewDek, USER_A, subId, newSubs[0].envelope, 2);
    assert.equal(decryptedSub.name, 'Rotated Service');

    // Subscription push hash also rotated with the new DEK
    assert.equal(newSubs[0].subscription_hash, await computeSubscriptionPushHash(rotated.newDekBytes, subId));
    assert.notEqual(newSubs[0].subscription_hash, await computeSubscriptionPushHash(oldDekBytes, subId));
  } finally {
    rotated.newDekBytes.fill(0);
    oldDekBytes.fill(0);
  }
});

test('executeDisableVaultMigration requires matching snapshot token and DEK control proof', async () => {
  const dekBytes = generateDekBytes();
  const dek = await importDek(dekBytes);
  const expectedProof = await deriveDekControlProof(dekBytes, USER_A, 1);
  const expectedVerifierHash = await computeDekControlProofHash(expectedProof);
  const subId = '99999999-9999-4999-8999-999999999999';

  const subEnv = await encryptSubscriptionPayload(
    dek,
    USER_A,
    subId,
    {
      name: 'Disable Test Sub',
      category: 'Other',
      amount: 12,
      currency: 'USD',
      period: 'monthly',
      lastPaymentDate: '2026-11-01',
      nextPaymentDate: '2026-12-01',
      notificationEnabled: true,
      status: 'active',
    },
    1
  );

  let disableArgs: Record<string, unknown> | null = null;
  const fakeClient = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      if (fn === 'prepare_e2ee_encrypted_operation') {
        return {
          data: {
            token: 'disable-snap-token',
            key_epoch: 1,
            snapshot: {
              subscriptions: [{ id: subId, envelope: subEnv, revision: 1 }],
              categories: [],
            },
          },
          error: null,
        };
      }
      if (fn === 'disable_e2ee_vault') {
        assert.equal(args?.p_snapshot_token, 'disable-snap-token');
        const submittedHash = await computeDekControlProofHash(String(args?.p_control_proof ?? ''));
        assert.equal(submittedHash, expectedVerifierHash);
        disableArgs = args ?? null;
        return { data: null, error: null };
      }
      throw new Error(`Unexpected RPC: ${fn}`);
    },
  };

  try {
    const result = await executeDisableVaultMigration(fakeClient, {
      userId: USER_A,
      currentDek: dek,
      currentDekBytes: dekBytes,
      currentKeyEpoch: 1,
    });
    assert.equal(result.subscriptions.length, 1);
    assert.equal(result.subscriptions[0].name, 'Disable Test Sub');
    assert.ok(disableArgs);
    assert.equal((disableArgs.p_subscriptions as Array<{ name: string }>)[0].name, 'Disable Test Sub');
  } finally {
    dekBytes.fill(0);
  }
});
