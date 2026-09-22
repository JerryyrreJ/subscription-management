/** Versioned AES-256-GCM envelope. Recovery secrets never leave the client. */
export interface Envelope { version: 1; nonce: string; ciphertext: string }
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export const generateRecoveryKey = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('').match(/.{8}/g)!.join('-');
export const normalizeRecoveryKey = (secret: string): string => secret.replace(/[\s-]/g, '').toLowerCase();
export async function importRecoveryKey(secret: string): Promise<CryptoKey> {
  const normalized = normalizeRecoveryKey(secret);
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error('Invalid recovery key');
  const bytes = Uint8Array.from(normalized.match(/../g)!, b => parseInt(b, 16));
  try { return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  finally { bytes.fill(0); }
}
const aad = (userId: string) => encoder.encode(JSON.stringify(['subscription-vault', 1, userId]));
export async function encryptVault(key: CryptoKey, userId: string, value: unknown): Promise<Envelope> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(userId), tagLength: 128 }, key, plaintext);
    return { version: 1, nonce: encode(nonce), ciphertext: encode(new Uint8Array(ciphertext)) };
  } finally { plaintext.fill(0); }
}
export async function decryptVault(key: CryptoKey, userId: string, envelope: Envelope): Promise<unknown> {
  if (envelope.version !== 1 || typeof envelope.nonce !== 'string' || typeof envelope.ciphertext !== 'string') throw new Error('Unsupported encrypted vault');
  const nonce = decode(envelope.nonce);
  if (nonce.length !== 12) throw new Error('Invalid nonce');
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad(userId), tagLength: 128 }, key, decode(envelope.ciphertext)
  ));
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)); }
  finally { plaintext.fill(0); }
}
