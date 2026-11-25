import {
  base64ToBytes,
  bytesToBase64,
  decryptLocalCachePayload,
  encryptLocalCachePayload,
  type Envelope,
  isValidEnvelope,
} from './crypto';
import type { PendingSyncOperation, Subscription } from '../../types';
import type { Category } from '../../utils/categories';

const DB_NAME = 'steadyrenew-e2ee-device-v2';
const DB_VERSION = 1;
const KEY_STORE = 'device_keys';
const SESSION_STORE = 'wrapped_sessions';
const DEVICE_KEY_ID = 'primary-browser-key';

const ENCRYPTED_FLAG_PREFIX = 'subscription-tracker-e2ee-enabled:user:';
const ENCRYPTED_CACHE_PREFIX = 'subscription-tracker-e2ee-cache:user:';

const PLAINTEXT_USER_STORAGE_PREFIXES = [
  'subscription-tracker-data:user:',
  'subscription-tracker-pending-sync:user:',
  'subscription-tracker-pending-sync-operations:user:',
  'subscription_categories_v2:user:',
  'subscription_categories_pending_sync:user:',
  'subscription_categories_pending_sync_v1:user:',
];

interface StoredWrappedSession {
  userId: string;
  keyEpoch: number;
  wrappedDek: Envelope;
  wrappedBarkKey?: Envelope | null;
  updatedAt: number;
}

export interface RestoredDeviceVaultMaterial {
  dekBytes: Uint8Array;
  keyEpoch: number;
  barkEncryptionKey: string | null;
}

export interface EncryptedOfflineSnapshot {
  subscriptions: Subscription[];
  pendingOperations: PendingSyncOperation[];
  categories: Category[];
  pendingCategories: Category[] | null;
  updatedAt: number;
}

const memoryDeviceKeyFallback = new Map<string, CryptoKey>();
const memorySessionFallback = new Map<string, StoredWrappedSession>();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

function isIndexedDbSupported(): boolean {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
}

function openKeyStoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE);
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB keystore'));
  });
}

function idbGet<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
  });
}

function idbPut(db: IDBDatabase, storeName: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
}

function idbDelete(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });
}

async function getOrCreateNonExtractableDeviceKey(): Promise<CryptoKey> {
  if (!isIndexedDbSupported()) {
    const existing = memoryDeviceKeyFallback.get(DEVICE_KEY_ID);
    if (existing) return existing;
    const generated = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    memoryDeviceKeyFallback.set(DEVICE_KEY_ID, generated);
    return generated;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openKeyStoreDb();
    const existing = await idbGet<CryptoKey>(db, KEY_STORE, DEVICE_KEY_ID);
    if (existing) {
      return existing;
    }

    const generated = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // Non-extractable hardware/browser-bound CryptoKey
      ['encrypt', 'decrypt']
    );
    await idbPut(db, KEY_STORE, DEVICE_KEY_ID, generated);
    return generated;
  } catch {
    const existing = memoryDeviceKeyFallback.get(DEVICE_KEY_ID);
    if (existing) return existing;
    const generated = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    memoryDeviceKeyFallback.set(DEVICE_KEY_ID, generated);
    return generated;
  } finally {
    db?.close();
  }
}

async function encryptWithDeviceKey(
  deviceKey: CryptoKey,
  userId: string,
  purpose: string,
  bytes: Uint8Array
): Promise<Envelope> {
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(JSON.stringify(['e2ee-device-wrap', 1, userId, purpose]));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad),
      tagLength: 128,
    },
    deviceKey,
    toArrayBuffer(bytes)
  );
  return {
    version: 1,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptWithDeviceKey(
  deviceKey: CryptoKey,
  userId: string,
  purpose: string,
  envelope: Envelope
): Promise<Uint8Array> {
  const nonce = base64ToBytes(envelope.nonce);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const aad = new TextEncoder().encode(JSON.stringify(['e2ee-device-wrap', 1, userId, purpose]));
  const plaintext = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad),
      tagLength: 128,
    },
    deviceKey,
    toArrayBuffer(ciphertext)
  );
  return new Uint8Array(plaintext);
}

/**
 * Marks an account as encrypted locally and immediately scrubs any legacy plaintext localStorage keys.
 */
export function markLocalAccountEncrypted(userId: string): void {
  try {
    globalThis.localStorage?.setItem(`${ENCRYPTED_FLAG_PREFIX}${userId}`, '1');
    scrubPlaintextUserLocalStorage(userId);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function clearEncryptedOfflineSnapshot(userId: string): void {
  try {
    globalThis.localStorage?.removeItem(`${ENCRYPTED_CACHE_PREFIX}${userId}`);
  } catch {
    // Ignore storage errors
  }
}

export function clearLocalAccountEncryptedFlag(userId: string): void {
  try {
    globalThis.localStorage?.removeItem(`${ENCRYPTED_FLAG_PREFIX}${userId}`);
    globalThis.localStorage?.removeItem(`${ENCRYPTED_CACHE_PREFIX}${userId}`);
  } catch {
    // Ignore storage errors
  }
}

export function isLocalAccountMarkedEncrypted(userId: string): boolean {
  try {
    return globalThis.localStorage?.getItem(`${ENCRYPTED_FLAG_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

export function scrubPlaintextUserLocalStorage(userId: string): void {
  try {
    for (const prefix of PLAINTEXT_USER_STORAGE_PREFIXES) {
      globalThis.localStorage?.removeItem(`${prefix}${userId}`);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Persists the unlocked DEK (and optional Bark E2EE key) wrapped under a non-extractable
 * IndexedDB CryptoKey so page refreshes and offline sessions stay seamlessly unlocked.
 */
export async function persistTrustedDeviceVaultMaterial(
  userId: string,
  dekBytes: Uint8Array,
  keyEpoch: number = 1,
  barkEncryptionKey?: string | null
): Promise<void> {
  const deviceKey = await getOrCreateNonExtractableDeviceKey();
  const wrappedDek = await encryptWithDeviceKey(deviceKey, userId, `dek:${keyEpoch}`, dekBytes);

  let wrappedBarkKey: Envelope | null = null;
  if (barkEncryptionKey && barkEncryptionKey.trim()) {
    const barkBytes = new TextEncoder().encode(barkEncryptionKey.trim());
    try {
      wrappedBarkKey = await encryptWithDeviceKey(deviceKey, userId, 'bark-key', barkBytes);
    } finally {
      barkBytes.fill(0);
    }
  }

  const record: StoredWrappedSession = {
    userId,
    keyEpoch,
    wrappedDek,
    wrappedBarkKey,
    updatedAt: Date.now(),
  };

  memorySessionFallback.set(userId, record);

  if (!isIndexedDbSupported()) {
    return;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openKeyStoreDb();
    await idbPut(db, SESSION_STORE, userId, record);
  } catch {
    // Fallback remains in memory for restricted environments
  } finally {
    db?.close();
  }
}

export async function restoreTrustedDeviceVaultMaterial(
  userId: string,
  expectedKeyEpoch?: number
): Promise<RestoredDeviceVaultMaterial | null> {
  let record: StoredWrappedSession | undefined = memorySessionFallback.get(userId);

  if (!record && isIndexedDbSupported()) {
    let db: IDBDatabase | null = null;
    try {
      db = await openKeyStoreDb();
      record = await idbGet<StoredWrappedSession>(db, SESSION_STORE, userId);
    } catch {
      record = undefined;
    } finally {
      db?.close();
    }
  }

  if (!record || !isValidEnvelope(record.wrappedDek)) {
    return null;
  }
  if (expectedKeyEpoch !== undefined && record.keyEpoch !== expectedKeyEpoch) {
    return null;
  }

  try {
    const deviceKey = await getOrCreateNonExtractableDeviceKey();
    const dekBytes = await decryptWithDeviceKey(
      deviceKey,
      userId,
      `dek:${record.keyEpoch}`,
      record.wrappedDek
    );

    let barkEncryptionKey: string | null = null;
    if (record.wrappedBarkKey && isValidEnvelope(record.wrappedBarkKey)) {
      try {
        const barkBytes = await decryptWithDeviceKey(
          deviceKey,
          userId,
          'bark-key',
          record.wrappedBarkKey
        );
        barkEncryptionKey = new TextDecoder().decode(barkBytes);
        barkBytes.fill(0);
      } catch {
        barkEncryptionKey = null;
      }
    }

    return {
      dekBytes,
      keyEpoch: record.keyEpoch,
      barkEncryptionKey,
    };
  } catch {
    return null;
  }
}

export async function clearTrustedDeviceVaultMaterial(userId: string): Promise<void> {
  memorySessionFallback.delete(userId);
  if (!isIndexedDbSupported()) {
    return;
  }
  let db: IDBDatabase | null = null;
  try {
    db = await openKeyStoreDb();
    await idbDelete(db, SESSION_STORE, userId);
  } catch {
    // Ignore cleanup failures
  } finally {
    db?.close();
  }
}

export async function saveEncryptedOfflineSnapshot(
  dek: CryptoKey,
  userId: string,
  snapshot: Omit<EncryptedOfflineSnapshot, 'updatedAt'>,
  keyEpoch: number = 1
): Promise<void> {
  try {
    const envelope = await encryptLocalCachePayload(
      dek,
      userId,
      'offline-snapshot-v1',
      {
        ...snapshot,
        updatedAt: Date.now(),
      },
      keyEpoch
    );
    globalThis.localStorage?.setItem(
      `${ENCRYPTED_CACHE_PREFIX}${userId}`,
      JSON.stringify(envelope)
    );
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadEncryptedOfflineSnapshot(
  dek: CryptoKey,
  userId: string,
  keyEpoch: number = 1
): Promise<EncryptedOfflineSnapshot | null> {
  try {
    const raw = globalThis.localStorage?.getItem(`${ENCRYPTED_CACHE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidEnvelope(parsed)) return null;
    return await decryptLocalCachePayload<EncryptedOfflineSnapshot>(
      dek,
      userId,
      'offline-snapshot-v1',
      parsed,
      keyEpoch
    );
  } catch {
    return null;
  }
}
