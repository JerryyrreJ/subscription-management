/**
 * Browser support helpers and Auth error mapping for Supabase Passkeys.
 */

export function isWebAuthnAvailable(): boolean {
  if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') {
    return false
  }

  return typeof navigator !== 'undefined'
    && typeof navigator.credentials !== 'undefined'
    && typeof navigator.credentials.create === 'function'
    && typeof navigator.credentials.get === 'function'
}

export type PasskeyErrorCode =
  | 'passkey_disabled'
  | 'too_many_passkeys'
  | 'webauthn_credential_exists'
  | 'webauthn_credential_not_found'
  | 'webauthn_challenge_not_found'
  | 'webauthn_challenge_expired'
  | 'webauthn_verification_failed'
  | 'email_not_confirmed'
  | 'phone_not_confirmed'
  | 'user_banned'
  | 'cancelled'
  | 'unsupported'
  | 'unknown'

const KNOWN_CODES = new Set<string>([
  'passkey_disabled',
  'too_many_passkeys',
  'webauthn_credential_exists',
  'webauthn_credential_not_found',
  'webauthn_challenge_not_found',
  'webauthn_challenge_expired',
  'webauthn_verification_failed',
  'email_not_confirmed',
  'phone_not_confirmed',
  'user_banned',
])

export function resolvePasskeyErrorCode(error: unknown): PasskeyErrorCode {
  if (!error) return 'unknown'

  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code || '')
      : ''

  if (KNOWN_CODES.has(code)) {
    return code as PasskeyErrorCode
  }

  if (
    name === 'NotAllowedError'
    || lower.includes('not allowed')
    || lower.includes('timed out')
    || lower.includes('abort')
    || lower.includes('cancel')
  ) {
    return 'cancelled'
  }

  if (
    name === 'NotSupportedError'
    || lower.includes('not supported')
    || lower.includes('publickeycredential')
  ) {
    return 'unsupported'
  }

  for (const known of KNOWN_CODES) {
    if (lower.includes(known) || code.includes(known)) {
      return known as PasskeyErrorCode
    }
  }

  return 'unknown'
}
