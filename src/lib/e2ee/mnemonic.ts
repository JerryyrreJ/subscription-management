import { RECOVERY_WORDLIST } from './wordlist';

export const RECOVERY_WORD_COUNT = 16;
const ENTROPY_BYTES = 21; // 168 bits CSPRNG entropy + 8 bits SHA-256 checksum = 176 bits = 16 * 11 bits
const TOTAL_PACKED_BYTES = 22;

const WORD_TO_INDEX = new Map<string, number>(
  RECOVERY_WORDLIST.map((word, index) => [word, index])
);

export type MnemonicErrorCode =
  | 'wrong_word_count'
  | 'unknown_word'
  | 'invalid_checksum';

export class MnemonicValidationError extends Error {
  readonly code: MnemonicErrorCode;
  readonly invalidWord?: string;

  constructor(code: MnemonicErrorCode, message: string, invalidWord?: string) {
    super(message);
    this.name = 'MnemonicValidationError';
    this.code = code;
    this.invalidWord = invalidWord;
  }
}

export function normalizeMnemonicWords(input: string): string[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }
  return trimmed
    .split(/[\s,;-]+/)
    .map(token => token.replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

export function formatMnemonicPhrase(words: readonly string[]): string {
  return words.map(word => word.trim().toLowerCase()).filter(Boolean).join(' ');
}

async function computeChecksumByte(entropy: Uint8Array): Promise<number> {
  const buffer = new ArrayBuffer(entropy.byteLength);
  new Uint8Array(buffer).set(entropy);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(digest)[0];
}

function packBytesToWords(packed22Bytes: Uint8Array): string[] {
  const words: string[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  for (const byte of packed22Bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 11) {
      bitCount -= 11;
      const wordIndex = (bitBuffer >> bitCount) & 0x7ff;
      words.push(RECOVERY_WORDLIST[wordIndex]);
    }
  }

  return words;
}

function unpackWordsToBytes(indices: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(TOTAL_PACKED_BYTES);
  let bitBuffer = 0;
  let bitCount = 0;
  let byteOffset = 0;

  for (const index of indices) {
    bitBuffer = (bitBuffer << 11) | (index & 0x7ff);
    bitCount += 11;
    while (bitCount >= 8) {
      bitCount -= 8;
      bytes[byteOffset] = (bitBuffer >> bitCount) & 0xff;
      byteOffset += 1;
    }
  }

  return bytes;
}

/**
 * Generates a 16-word recovery phrase (168-bit CSPRNG entropy + 8-bit SHA-256 checksum).
 */
export async function generateRecoveryMnemonic(): Promise<string> {
  const entropy = globalThis.crypto.getRandomValues(new Uint8Array(ENTROPY_BYTES));
  const packed = new Uint8Array(TOTAL_PACKED_BYTES);
  try {
    packed.set(entropy, 0);
    packed[ENTROPY_BYTES] = await computeChecksumByte(entropy);
    return packBytesToWords(packed).join(' ');
  } finally {
    entropy.fill(0);
    packed.fill(0);
  }
}

/**
 * Decodes and validates a 16-word recovery phrase, returning its 21-byte entropy.
 * Caller should zeroize the returned Uint8Array once KEK derivation completes.
 */
export async function decodeAndVerifyMnemonic(phrase: string): Promise<Uint8Array> {
  const words = normalizeMnemonicWords(phrase);
  if (words.length !== RECOVERY_WORD_COUNT) {
    throw new MnemonicValidationError(
      'wrong_word_count',
      `Expected ${RECOVERY_WORD_COUNT} recovery words, received ${words.length}.`
    );
  }

  const indices: number[] = [];
  for (const word of words) {
    const exactIndex = WORD_TO_INDEX.get(word);
    if (exactIndex === undefined) {
      throw new MnemonicValidationError(
        'unknown_word',
        `Unrecognized recovery word: "${word}".`,
        word
      );
    }
    indices.push(exactIndex);
  }

  const packed = unpackWordsToBytes(indices);
  const entropy = packed.slice(0, ENTROPY_BYTES);
  const actualChecksum = packed[ENTROPY_BYTES];
  packed.fill(0);

  const expectedChecksum = await computeChecksumByte(entropy);
  if (actualChecksum !== expectedChecksum) {
    entropy.fill(0);
    throw new MnemonicValidationError(
      'invalid_checksum',
      'Recovery phrase checksum failed. Check word spelling and order.'
    );
  }

  return entropy;
}
