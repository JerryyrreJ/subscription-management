export const PENDING_OAUTH_AUTH_ID_KEY = 'steadyrenew_pending_oauth_authorization_id';

const AUTHORIZATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,256}$/;

const DISALLOWED_REDIRECT_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
  'about:',
]);

export interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isOAuthConsentPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/oauth/consent' || normalized === '/app/oauth/consent';
}

export function extractAuthorizationId(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const raw = params.get('authorization_id')?.trim() ?? '';
  if (!AUTHORIZATION_ID_PATTERN.test(raw)) {
    return null;
  }
  return raw;
}

export function buildOAuthConsentUrl(origin: string, authorizationId: string): string {
  const cleanOrigin = new URL(origin).origin;
  return `${cleanOrigin}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

export function savePendingOAuthAuthorizationId(
  storage: SimpleStorage | null | undefined,
  authorizationId: string
): void {
  if (!storage || !AUTHORIZATION_ID_PATTERN.test(authorizationId)) {
    return;
  }
  try {
    storage.setItem(PENDING_OAUTH_AUTH_ID_KEY, authorizationId);
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

export function peekPendingOAuthAuthorizationId(
  storage: SimpleStorage | null | undefined
): string | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(PENDING_OAUTH_AUTH_ID_KEY)?.trim() ?? '';
    return AUTHORIZATION_ID_PATTERN.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function clearPendingOAuthAuthorizationId(
  storage: SimpleStorage | null | undefined
): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(PENDING_OAUTH_AUTH_ID_KEY);
  } catch {
    // Ignore storage access errors.
  }
}

export function consumePendingOAuthAuthorizationId(
  storage: SimpleStorage | null | undefined
): string | null {
  const value = peekPendingOAuthAuthorizationId(storage);
  if (value) {
    clearPendingOAuthAuthorizationId(storage);
  }
  return value;
}

export function isSafeExternalRedirectUrl(candidate: string): boolean {
  const trimmed = candidate?.trim();
  if (!trimmed) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (DISALLOWED_REDIRECT_SCHEMES.has(protocol)) {
    return false;
  }

  if (protocol === 'https:') {
    return Boolean(parsed.hostname);
  }

  if (protocol === 'http:') {
    return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase());
  }

  // Native desktop MCP clients (e.g. Cursor, Claude Desktop, VS Code) may register
  // custom URI schemes such as cursor:// or vscode:// for local OAuth callbacks.
  return /^[a-z][a-z0-9+.-]*:$/.test(protocol);
}

export interface OAuthRedirectTargetDisplay {
  kind: 'https' | 'loopback' | 'custom_scheme' | 'invalid';
  displayTarget: string;
  scheme: string | null;
  host: string | null;
  raw: string;
}

export function describeOAuthRedirectTarget(redirectUri: string): OAuthRedirectTargetDisplay {
  const trimmed = redirectUri?.trim() ?? '';
  if (!trimmed || !isSafeExternalRedirectUrl(trimmed)) {
    return {
      kind: 'invalid',
      displayTarget: trimmed,
      scheme: null,
      host: null,
      raw: trimmed,
    };
  }

  const parsed = new URL(trimmed);
  const protocol = parsed.protocol.toLowerCase();
  const scheme = protocol.slice(0, -1);

  if (protocol === 'https:') {
    return {
      kind: 'https',
      displayTarget: parsed.origin,
      scheme,
      host: parsed.host,
      raw: trimmed,
    };
  }

  if (protocol === 'http:') {
    return {
      kind: 'loopback',
      displayTarget: parsed.origin,
      scheme,
      host: parsed.host,
      raw: trimmed,
    };
  }

  const host = parsed.host || null;
  const pathPreview = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
  const displayTarget = host
    ? `${protocol}//${host}`
    : `${protocol}${pathPreview}`;

  return {
    kind: 'custom_scheme',
    displayTarget,
    scheme,
    host,
    raw: trimmed,
  };
}
