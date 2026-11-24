import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  generateRandomSaltBase64,
} from './crypto';

interface PrfEvalValues {
  first: BufferSource;
  second?: BufferSource;
}

interface PrfExtensionInput {
  eval?: PrfEvalValues;
  evalByCredential?: Record<string, PrfEvalValues>;
}

interface PrfExtensionOutput {
  enabled?: boolean;
  results?: {
    first?: ArrayBuffer;
    second?: ArrayBuffer;
  };
}

export interface PasskeyPrfKdfParams {
  alg: 'WebAuthn-PRF-HKDF-SHA256';
  prfSalt: string;
  hkdfSalt: string;
  rpId: string;
}

export interface PasskeySlotCandidate {
  id: string;
  credentialId: string;
  kdfParams: PasskeyPrfKdfParams;
}

export interface RegisteredPasskeyPrfResult {
  credentialId: string;
  prfBytes: Uint8Array;
  kdfParams: PasskeyPrfKdfParams;
}

export interface EvaluatedPasskeyPrfResult {
  slotId: string;
  credentialId: string;
  prfBytes: Uint8Array;
  kdfParams: PasskeyPrfKdfParams;
}

export class PasskeyPrfUnsupportedError extends Error {
  constructor(message = 'This authenticator or browser does not support WebAuthn PRF encryption.') {
    super(message);
    this.name = 'PasskeyPrfUnsupportedError';
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

export function isPasskeyPrfAvailable(): boolean {
  return (
    typeof window !== 'undefined'
    && typeof window.PublicKeyCredential !== 'undefined'
    && typeof navigator !== 'undefined'
    && typeof navigator.credentials?.create === 'function'
    && typeof navigator.credentials?.get === 'function'
  );
}

function readPrfExtensionOutput(credential: PublicKeyCredential): PrfExtensionOutput | undefined {
  const clientResults = credential.getClientExtensionResults() as Record<string, unknown>;
  const prf = clientResults?.prf;
  if (!prf || typeof prf !== 'object') {
    return undefined;
  }
  return prf as PrfExtensionOutput;
}

/**
 * Registers a WebAuthn Passkey with the `prf` extension and returns its 32-byte deterministic PRF output.
 * Handles authenticators that emit `results.first` directly on `create()` as well as authenticators
 * (such as Safari/iCloud Keychain) that return `enabled: true` on `create()` and require a follow-up `get()`.
 */
export async function registerPasskeyForVault(
  userId: string,
  userEmail: string,
  displayLabel?: string
): Promise<RegisteredPasskeyPrfResult> {
  if (!isPasskeyPrfAvailable()) {
    throw new PasskeyPrfUnsupportedError();
  }

  const rpId = window.location.hostname;
  const prfSaltBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const prfSaltBase64 = bytesToBase64(prfSaltBytes);
  const hkdfSaltBase64 = generateRandomSaltBase64(32);
  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const userHandle = new TextEncoder().encode(`steadyrenew-e2ee:${userId}`);

  const extensions: AuthenticationExtensionsClientInputs & { prf: PrfExtensionInput } = {
    prf: {
      eval: {
        first: toArrayBuffer(prfSaltBytes),
      },
    },
  };

  const created = (await navigator.credentials.create({
    publicKey: {
      challenge: toArrayBuffer(challenge),
      rp: {
        name: 'SteadyRenew Vault',
        id: rpId,
      },
      user: {
        id: toArrayBuffer(userHandle),
        name: userEmail || 'SteadyRenew User',
        displayName: displayLabel || userEmail || 'SteadyRenew Vault Key',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60_000,
      extensions,
    },
  })) as PublicKeyCredential | null;

  if (!created) {
    throw new Error('Passkey creation was cancelled.');
  }

  const credentialId = bytesToBase64Url(new Uint8Array(created.rawId));
  const prfOut = readPrfExtensionOutput(created);

  const kdfParams: PasskeyPrfKdfParams = {
    alg: 'WebAuthn-PRF-HKDF-SHA256',
    prfSalt: prfSaltBase64,
    hkdfSalt: hkdfSaltBase64,
    rpId,
  };

  if (prfOut?.results?.first && prfOut.results.first.byteLength >= 32) {
    return {
      credentialId,
      prfBytes: new Uint8Array(prfOut.results.first),
      kdfParams,
    };
  }

  if (prfOut?.enabled === false) {
    throw new PasskeyPrfUnsupportedError();
  }

  // Authenticator supports PRF (`enabled: true`) and evaluates PRF during `credentials.get()`.
  const getChallenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const getExtensions: AuthenticationExtensionsClientInputs & { prf: PrfExtensionInput } = {
    prf: {
      eval: {
        first: toArrayBuffer(prfSaltBytes),
      },
    },
  };

  const asserted = (await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(getChallenge),
      rpId,
      allowCredentials: [
        {
          type: 'public-key',
          id: created.rawId,
        },
      ],
      userVerification: 'required',
      timeout: 60_000,
      extensions: getExtensions,
    },
  })) as PublicKeyCredential | null;

  if (!asserted) {
    throw new Error('Passkey verification was cancelled.');
  }

  const getPrfOut = readPrfExtensionOutput(asserted);
  if (!getPrfOut?.results?.first || getPrfOut.results.first.byteLength < 32) {
    throw new PasskeyPrfUnsupportedError();
  }

  return {
    credentialId,
    prfBytes: new Uint8Array(getPrfOut.results.first),
    kdfParams,
  };
}

/**
 * Prompts the user's Passkey authenticator across one or more registered `passkey_prf` key slots
 * and returns the matching slot alongside its evaluated 32-byte PRF secret.
 */
export async function evaluatePasskeyForVaultSlots(
  slots: readonly PasskeySlotCandidate[]
): Promise<EvaluatedPasskeyPrfResult> {
  if (!isPasskeyPrfAvailable()) {
    throw new PasskeyPrfUnsupportedError();
  }
  if (slots.length === 0) {
    throw new Error('No Passkey unlock slots are configured for this vault.');
  }

  const rpId = window.location.hostname;
  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));

  const allowCredentials: PublicKeyCredentialDescriptor[] = [];
  const evalByCredential: Record<string, PrfEvalValues> = {};
  const slotByCredId = new Map<string, PasskeySlotCandidate>();

  for (const slot of slots) {
    const rawIdBytes = base64UrlToBytes(slot.credentialId);
    const normalizedCredId = bytesToBase64Url(rawIdBytes);
    const prfSaltBytes = base64ToBytes(slot.kdfParams.prfSalt);

    allowCredentials.push({
      type: 'public-key',
      id: toArrayBuffer(rawIdBytes),
    });
    evalByCredential[normalizedCredId] = {
      first: toArrayBuffer(prfSaltBytes),
    };
    slotByCredId.set(normalizedCredId, slot);
  }

  const prfInput: PrfExtensionInput =
    slots.length === 1
      ? {
          eval: {
            first: toArrayBuffer(base64ToBytes(slots[0].kdfParams.prfSalt)),
          },
        }
      : {
          evalByCredential,
        };

  const extensions: AuthenticationExtensionsClientInputs & { prf: PrfExtensionInput } = {
    prf: prfInput,
  };

  const asserted = (await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(challenge),
      rpId,
      allowCredentials,
      userVerification: 'required',
      timeout: 60_000,
      extensions,
    },
  })) as PublicKeyCredential | null;

  if (!asserted) {
    throw new Error('Passkey unlock was cancelled.');
  }

  const matchedCredId = bytesToBase64Url(new Uint8Array(asserted.rawId));
  const matchedSlot = slotByCredId.get(matchedCredId) ?? (slots.length === 1 ? slots[0] : undefined);
  if (!matchedSlot) {
    throw new Error('Selected Passkey is not linked to this encrypted vault.');
  }

  const prfOut = readPrfExtensionOutput(asserted);
  if (!prfOut?.results?.first || prfOut.results.first.byteLength < 32) {
    throw new PasskeyPrfUnsupportedError();
  }

  return {
    slotId: matchedSlot.id,
    credentialId: matchedSlot.credentialId,
    prfBytes: new Uint8Array(prfOut.results.first),
    kdfParams: matchedSlot.kdfParams,
  };
}
