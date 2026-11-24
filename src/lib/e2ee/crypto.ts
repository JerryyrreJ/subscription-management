import { decodeAndVerifyMnemonic } from './mnemonic';

/**
 * Versioned AES-256-GCM envelope shared by Browser, Netlify Functions, and MCP.
 */
export interface Envelope {
  version: 1;
  nonce: string;
  ciphertext: string;
}

export type KeySlotType = 'recovery_mnemonic' | 'passkey_prf';
export type BarkE2eeMode = 'off' | 'generic' | 'bark_e2ee';

export interface EncryptedSubscriptionContent {
  name: string;
  category: string;
  amount: number;
  currency: string;
  period: 'monthly' | 'yearly' | 'custom';
  lastPaymentDate: string;
  nextPaymentDate: string;
  billingAnchorDay?: number | null;
  customDate?: string;
  notificationEnabled: boolean;
  isTrial?: boolean;
  trialEndsOn?: string;
  status?: 'active' | 'paused' | 'cancelled';
}

export interface EncryptedCategoryContent {
  id: string;
  name: string;
  order: number;
  isBuiltIn: boolean;
  isHidden: boolean;
}

export interface BarkPlaintextPayload {
  title: string;
  body: string;
  sound?: string;
  icon?: string;
  group?: string;
  url?: string;
}

export const VAULT_KEY_TOKEN_PREFIX = 'vk1_';
const DEK_BYTE_LENGTH = 32;
const NONCE_BYTE_LENGTH = 12;
const BARK_IV_LENGTH = 16;
const BARK_KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return globalThis.btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return base64ToBytes(normalized + '='.repeat(padLength));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function generateRandomSaltBase64(byteLength: number = 32): string {
  return bytesToBase64(globalThis.crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function isValidEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1
    && typeof candidate.nonce === 'string'
    && /^[A-Za-z0-9+/]{16}$/.test(candidate.nonce)
    && typeof candidate.ciphertext === 'string'
    && /^[A-Za-z0-9+/]+={0,2}$/.test(candidate.ciphertext)
    && candidate.ciphertext.length >= 24
  );
}

export function generateDekBytes(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(DEK_BYTE_LENGTH));
}

export async function importDek(dekBytes: Uint8Array): Promise<CryptoKey> {
  if (dekBytes.byteLength !== DEK_BYTE_LENGTH) {
    throw new Error('Invalid DEK length: expected 32 bytes');
  }
  return globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(dekBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function encodeVaultKeyToken(dekBytes: Uint8Array): string {
  if (dekBytes.byteLength !== DEK_BYTE_LENGTH) {
    throw new Error('Invalid DEK length: expected 32 bytes');
  }
  return `${VAULT_KEY_TOKEN_PREFIX}${bytesToBase64Url(dekBytes)}`;
}

export function decodeVaultKeyToken(token: string): Uint8Array {
  const trimmed = token.trim();
  const payload = trimmed.startsWith(VAULT_KEY_TOKEN_PREFIX)
    ? trimmed.slice(VAULT_KEY_TOKEN_PREFIX.length)
    : trimmed;

  if (!/^[A-Za-z0-9_-]{43}={0,2}$/.test(payload)) {
    throw new Error('Invalid vault key token format');
  }

  const bytes = base64UrlToBytes(payload.replace(/=+$/g, ''));
  if (bytes.byteLength !== DEK_BYTE_LENGTH) {
    bytes.fill(0);
    throw new Error('Invalid vault key token byte length');
  }
  return bytes;
}

async function deriveHkdfAesGcmKey(
  ikmBytes: Uint8Array,
  saltBytes: Uint8Array,
  infoLabel: string
): Promise<CryptoKey> {
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(ikmBytes),
    'HKDF',
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(saltBytes),
      info: toArrayBuffer(textEncoder.encode(infoLabel)),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function deriveMnemonicKek(
  mnemonicPhrase: string,
  saltBase64: string
): Promise<CryptoKey> {
  const entropy = await decodeAndVerifyMnemonic(mnemonicPhrase);
  const saltBytes = base64ToBytes(saltBase64);
  try {
    return await deriveHkdfAesGcmKey(
      entropy,
      saltBytes,
      'steadyrenew-e2ee-mnemonic-kek-v1'
    );
  } finally {
    entropy.fill(0);
    saltBytes.fill(0);
  }
}

export async function derivePrfKek(
  prfBytes: Uint8Array,
  hkdfSaltBase64: string
): Promise<CryptoKey> {
  if (prfBytes.byteLength < 32) {
    throw new Error('WebAuthn PRF output must be at least 32 bytes');
  }
  const saltBytes = base64ToBytes(hkdfSaltBase64);
  try {
    return await deriveHkdfAesGcmKey(
      prfBytes,
      saltBytes,
      'steadyrenew-e2ee-passkey-prf-kek-v1'
    );
  } finally {
    saltBytes.fill(0);
  }
}

function encodeAad(parts: readonly (string | number)[]): ArrayBuffer {
  return toArrayBuffer(textEncoder.encode(JSON.stringify(parts)));
}

async function sealBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
  aadParts: readonly (string | number)[]
): Promise<Envelope> {
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTE_LENGTH));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: encodeAad(aadParts),
      tagLength: 128,
    },
    key,
    toArrayBuffer(plaintext)
  );

  return {
    version: 1,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function openBytes(
  key: CryptoKey,
  envelope: Envelope,
  aadParts: readonly (string | number)[]
): Promise<Uint8Array> {
  if (!isValidEnvelope(envelope)) {
    throw new Error('Malformed encrypted envelope');
  }
  const nonce = base64ToBytes(envelope.nonce);
  if (nonce.byteLength !== NONCE_BYTE_LENGTH) {
    throw new Error('Invalid envelope nonce length');
  }
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: encodeAad(aadParts),
      tagLength: 128,
    },
    key,
    toArrayBuffer(ciphertext)
  );
  return new Uint8Array(decrypted);
}

async function sealJson(
  key: CryptoKey,
  value: unknown,
  aadParts: readonly (string | number)[]
): Promise<Envelope> {
  const encoded = textEncoder.encode(JSON.stringify(value));
  try {
    return await sealBytes(key, encoded, aadParts);
  } finally {
    encoded.fill(0);
  }
}

async function openJson<T>(
  key: CryptoKey,
  envelope: Envelope,
  aadParts: readonly (string | number)[]
): Promise<T> {
  const bytes = await openBytes(key, envelope, aadParts);
  try {
    return JSON.parse(textDecoder.decode(bytes)) as T;
  } finally {
    bytes.fill(0);
  }
}

export async function wrapDek(
  kek: CryptoKey,
  dekBytes: Uint8Array,
  userId: string,
  slotType: KeySlotType
): Promise<Envelope> {
  if (dekBytes.byteLength !== DEK_BYTE_LENGTH) {
    throw new Error('Invalid DEK length');
  }
  return sealBytes(kek, dekBytes, ['e2ee-key-slot', 1, userId, slotType]);
}

export async function unwrapDek(
  kek: CryptoKey,
  wrappedDek: Envelope,
  userId: string,
  slotType: KeySlotType
): Promise<Uint8Array> {
  const dekBytes = await openBytes(kek, wrappedDek, ['e2ee-key-slot', 1, userId, slotType]);
  if (dekBytes.byteLength !== DEK_BYTE_LENGTH) {
    dekBytes.fill(0);
    throw new Error('Unwrapped DEK has invalid length');
  }
  return dekBytes;
}

export async function createDekCheck(
  dek: CryptoKey,
  userId: string,
  keyEpoch: number = 1
): Promise<Envelope> {
  return sealJson(
    dek,
    { purpose: 'dek-check', userId, keyEpoch },
    ['e2ee-dek-check', 1, userId, keyEpoch]
  );
}

export async function verifyDekCheck(
  dek: CryptoKey,
  dekCheck: Envelope,
  userId: string,
  keyEpoch: number = 1
): Promise<boolean> {
  try {
    const parsed = await openJson<{ purpose?: string; userId?: string; keyEpoch?: number }>(
      dek,
      dekCheck,
      ['e2ee-dek-check', 1, userId, keyEpoch]
    );
    return (
      parsed.purpose === 'dek-check'
      && parsed.userId === userId
      && parsed.keyEpoch === keyEpoch
    );
  } catch {
    return false;
  }
}

export async function encryptSubscriptionPayload(
  dek: CryptoKey,
  userId: string,
  subscriptionId: string,
  payload: EncryptedSubscriptionContent
): Promise<Envelope> {
  return sealJson(dek, payload, ['e2ee-subscription', 1, userId, subscriptionId]);
}

export async function decryptSubscriptionPayload(
  dek: CryptoKey,
  userId: string,
  subscriptionId: string,
  envelope: Envelope
): Promise<EncryptedSubscriptionContent> {
  return openJson<EncryptedSubscriptionContent>(
    dek,
    envelope,
    ['e2ee-subscription', 1, userId, subscriptionId]
  );
}

export async function encryptCategoryPayload(
  dek: CryptoKey,
  userId: string,
  categoryId: string,
  payload: EncryptedCategoryContent
): Promise<Envelope> {
  return sealJson(dek, payload, ['e2ee-category', 1, userId, categoryId]);
}

export async function decryptCategoryPayload(
  dek: CryptoKey,
  userId: string,
  categoryId: string,
  envelope: Envelope
): Promise<EncryptedCategoryContent> {
  return openJson<EncryptedCategoryContent>(
    dek,
    envelope,
    ['e2ee-category', 1, userId, categoryId]
  );
}

export async function encryptAuditPayload(
  dek: CryptoKey,
  userId: string,
  auditId: string,
  metadata: Record<string, unknown>
): Promise<Envelope> {
  return sealJson(dek, metadata, ['e2ee-audit', 1, userId, auditId]);
}

export async function decryptAuditPayload(
  dek: CryptoKey,
  userId: string,
  auditId: string,
  envelope: Envelope
): Promise<Record<string, unknown>> {
  return openJson<Record<string, unknown>>(
    dek,
    envelope,
    ['e2ee-audit', 1, userId, auditId]
  );
}

export async function encryptLocalCachePayload(
  dek: CryptoKey,
  userId: string,
  purpose: string,
  value: unknown
): Promise<Envelope> {
  return sealJson(dek, value, ['e2ee-local-cache', 1, userId, purpose]);
}

export async function decryptLocalCachePayload<T>(
  dek: CryptoKey,
  userId: string,
  purpose: string,
  envelope: Envelope
): Promise<T> {
  return openJson<T>(dek, envelope, ['e2ee-local-cache', 1, userId, purpose]);
}

export async function computeSubscriptionPushHash(
  dekBytes: Uint8Array,
  subscriptionId: string
): Promise<string> {
  const hmacKey = await globalThis.crypto.subtle.importKey(
    'raw',
    toArrayBuffer(dekBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const message = textEncoder.encode(`push-sub:v1:${subscriptionId}`);
  const mac = await globalThis.crypto.subtle.sign('HMAC', hmacKey, toArrayBuffer(message));
  return bytesToHex(new Uint8Array(mac));
}

function randomAsciiFromAlphabet(length: number): string {
  const out: string[] = [];
  const randomBytes = new Uint8Array(length * 2);
  while (out.length < length) {
    globalThis.crypto.getRandomValues(randomBytes);
    for (const byte of randomBytes) {
      // 248 is the largest multiple of 62 <= 255 to avoid modulo bias
      if (byte < 248 && out.length < length) {
        out.push(BARK_KEY_ALPHABET[byte % BARK_KEY_ALPHABET.length]);
      }
    }
  }
  randomBytes.fill(0);
  return out.join('');
}

/**
 * Generates a 32-character alphanumeric AES-256-CBC key for the Bark iOS app.
 */
export function generateBarkEncryptionKey(): string {
  return randomAsciiFromAlphabet(32);
}

export function isValidBarkEncryptionKey(key: string): boolean {
  const trimmed = key.trim();
  return /^[\x21-\x7E]{16}$/.test(trimmed) || /^[\x21-\x7E]{32}$/.test(trimmed);
}

/**
 * Encrypts a Bark push JSON payload using Bark's native AES-128/256-CBC (PKCS#7) format.
 */
export async function encryptBarkPushPayload(
  barkKey: string,
  payload: BarkPlaintextPayload
): Promise<{ ciphertext: string; iv: string }> {
  const normalizedKey = barkKey.trim();
  if (!isValidBarkEncryptionKey(normalizedKey)) {
    throw new Error('Bark encryption key must be 16 or 32 ASCII characters');
  }

  const keyBytes = textEncoder.encode(normalizedKey);
  const iv = randomAsciiFromAlphabet(BARK_IV_LENGTH);
  const ivBytes = textEncoder.encode(iv);
  const plaintext = textEncoder.encode(JSON.stringify(payload));

  try {
    const aesKey = await globalThis.crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBytes),
      { name: 'AES-CBC' },
      false,
      ['encrypt']
    );
    const encrypted = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: toArrayBuffer(ivBytes) },
      aesKey,
      toArrayBuffer(plaintext)
    );
    return {
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      iv,
    };
  } finally {
    keyBytes.fill(0);
    ivBytes.fill(0);
    plaintext.fill(0);
  }
}

export async function decryptBarkPushPayload(
  barkKey: string,
  ciphertextBase64: string,
  iv: string
): Promise<BarkPlaintextPayload> {
  const normalizedKey = barkKey.trim();
  if (!isValidBarkEncryptionKey(normalizedKey)) {
    throw new Error('Bark encryption key must be 16 or 32 ASCII characters');
  }
  if (!/^[A-Za-z0-9]{16}$/.test(iv)) {
    throw new Error('Bark IV must be 16 alphanumeric ASCII characters');
  }

  const keyBytes = textEncoder.encode(normalizedKey);
  const ivBytes = textEncoder.encode(iv);
  const ciphertext = base64ToBytes(ciphertextBase64);

  try {
    const aesKey = await globalThis.crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBytes),
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );
    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: toArrayBuffer(ivBytes) },
      aesKey,
      toArrayBuffer(ciphertext)
    );
    const bytes = new Uint8Array(decrypted);
    try {
      return JSON.parse(textDecoder.decode(bytes)) as BarkPlaintextPayload;
    } finally {
      bytes.fill(0);
    }
  } finally {
    keyBytes.fill(0);
    ivBytes.fill(0);
    ciphertext.fill(0);
  }
}
