import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiLimitsConfig } from './env';
import { extractBearerToken } from './auth';
import { HttpError, isNetworkFetchError } from './http';
import { logEvent } from './logging';

export const API_KEY_PREFIX = 'subm_';
const MAX_OAUTH_TOKEN_LENGTH = 8192;

interface ApiKeyRecord {
  id: string;
  user_id: string;
  key_prefix: string;
}

interface UserProfileRecord {
  is_premium: boolean | null;
}

interface OAuthClientScopeRecord {
  scopes: string[] | null;
}

interface ParsedOAuthJwtClaims {
  sub: string;
  clientId: string;
}

interface RateLimitResult {
  allowed: boolean;
  request_count: number;
  remaining: number;
  reset_at: string;
}

interface ApiKeyLookupResult {
  limited: boolean;
  id: string | null;
  user_id: string | null;
  key_prefix: string | null;
  scopes: string[] | null;
}

export interface ApiKeyMaterial {
  apiKey: string;
  keyPrefix: string;
}

export type ApiScope = 'read' | 'write';

export const DEFAULT_API_SCOPES: ApiScope[] = ['read', 'write'];
export const DEFAULT_OAUTH_FALLBACK_SCOPES: ApiScope[] = ['read'];

export interface ApiKeyIdentity {
  apiKeyId: string | null;
  oauthClientId?: string;
  userId: string;
  keyPrefix: string;
  isPremium: boolean;
  rateLimitMax: number;
  scopes: string[];
}

export interface ApiClientContext {
  apiKeyId: string | null;
  oauthClientId?: string;
  userId: string;
  keyPrefix: string;
  isPremium: boolean;
  scopes: string[];
  rateLimit: {
    limit: number;
    remaining: number;
    resetAt: string;
    headers: Record<string, string>;
  };
}

// Enforce key scopes server-side so a read-only key or OAuth grant can never write,
// regardless of what a cooperative agent client decides to do with tool risk hints.
export const assertScope = (scopes: string[], required: ApiScope): void => {
  if (!scopes.includes(required)) {
    throw new HttpError(
      403,
      'insufficient_scope',
      `This credential does not have the required '${required}' scope`,
      {},
      {
        suggestedFix: required === 'write'
          ? 'Use an API key with the write scope, or switch this connected AI app to Read & Write in Settings -> API & MCP. Read-only credentials can only list and read subscriptions.'
          : 'Use a credential that includes the read scope.',
      }
    );
  }
};

export const generateApiKeyMaterial = (): ApiKeyMaterial => {
  const publicId = randomBytes(9).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const keyPrefix = `${API_KEY_PREFIX}${publicId}`;

  return {
    apiKey: `${keyPrefix}.${secret}`,
    keyPrefix,
  };
};

export const generateApiKey = (): string => generateApiKeyMaterial().apiKey;

export const hashApiKey = (apiKey: string): string =>
  createHash('sha256').update(apiKey).digest('hex');

export const hashClientIdentity = (identity: string): string =>
  createHash('sha256').update(identity).digest('hex');

export const buildRateLimitHeaders = (
  limit: number,
  remaining: number,
  resetAt: string
): Record<string, string> => ({
  'X-RateLimit-Limit': String(limit),
  'X-RateLimit-Remaining': String(Math.max(0, remaining)),
  'X-RateLimit-Reset': String(Math.floor(new Date(resetAt).getTime() / 1000)),
});

const getWindowStart = (now: Date): string => {
  const windowStart = new Date(now);
  windowStart.setUTCMinutes(0, 0, 0);
  return windowStart.toISOString();
};

const getHeader = (
  headers: Record<string, string | undefined>,
  name: string
): string | undefined => {
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry?.[1]?.trim() || undefined;
};

const getClientIdentity = (headers: Record<string, string | undefined>): string => {
  const forwardedFor = getHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim();
  const clientIp = getHeader(headers, 'x-nf-client-connection-ip') ||
    getHeader(headers, 'cf-connecting-ip') ||
    getHeader(headers, 'x-real-ip') ||
    getHeader(headers, 'client-ip') ||
    forwardedFor;

  if (clientIp) {
    return `ip:${clientIp}`;
  }

  return [
    'fingerprint',
    getHeader(headers, 'user-agent') ?? 'missing-user-agent',
    getHeader(headers, 'accept-language') ?? 'missing-accept-language',
    getHeader(headers, 'accept-encoding') ?? 'missing-accept-encoding',
  ].join(':');
};

const unwrapRateLimitResult = (data: unknown): RateLimitResult | null => {
  if (Array.isArray(data)) {
    return (data[0] as RateLimitResult | undefined) ?? null;
  }

  return (data as RateLimitResult | null) ?? null;
};

const unwrapApiKeyLookupResult = (data: unknown): ApiKeyLookupResult | null => {
  if (Array.isArray(data)) {
    return (data[0] as ApiKeyLookupResult | undefined) ?? null;
  }

  return (data as ApiKeyLookupResult | null) ?? null;
};

const parseOAuthJwtClaims = (token: string): ParsedOAuthJwtClaims | null => {
  if (!token || token.length > MAX_OAUTH_TOKEN_LENGTH) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return null;
  }
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    const clientId = typeof payload.client_id === 'string' ? payload.client_id.trim() : '';
    if (!sub || !clientId) {
      return null;
    }
    return { sub, clientId };
  } catch {
    return null;
  }
};

const isMissingDatabaseArtifactError = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  const code = error.code ?? '';
  const msg = error.message ?? '';
  return (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    /does not exist|could not find the (table|function)/i.test(msg)
  );
};

const throwFailedAuthRateLimitError = (limits: ApiLimitsConfig, now: Date): never => {
  const windowStart = getWindowStart(now);
  const resetAt = new Date(new Date(windowStart).getTime() + 60 * 60 * 1000).toISOString();
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((new Date(resetAt).getTime() - now.getTime()) / 1000)
  );

  throw new HttpError(
    429,
    'rate_limit_exceeded',
    'Too many invalid authentication attempts',
    {
      ...buildRateLimitHeaders(limits.failedAuthRequestsPerHour, 0, resetAt),
      'Retry-After': String(retryAfterSeconds),
    }
  );
};

const checkOrRecordOAuthFailure = async (
  database: SupabaseClient,
  clientIdentityHash: string,
  limits: ApiLimitsConfig,
  now: Date,
  recordFailure: boolean
): Promise<void> => {
  const { data, error } = await database.rpc('check_or_record_api_auth_failure', {
    p_identity_hash: clientIdentityHash,
    p_window_start: getWindowStart(now),
    p_failure_limit: limits.failedAuthRequestsPerHour,
    p_record_failure: recordFailure,
  });

  if (error) {
    if (isMissingDatabaseArtifactError(error as { code?: string; message?: string })) {
      return;
    }
    throw error;
  }

  const limited = Array.isArray(data) ? Boolean(data[0]) : Boolean(data);
  if (limited) {
    throwFailedAuthRateLimitError(limits, now);
  }
};

const normalizeScopes = (raw: string[] | null | undefined, fallback: ApiScope[]): string[] => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...fallback];
  }
  const allowed = raw.filter((scope): scope is ApiScope => scope === 'read' || scope === 'write');
  if (!allowed.includes('read')) {
    return ['read', ...allowed];
  }
  return allowed;
};

const identifyOAuthAccessToken = async (
  accessToken: string,
  headers: Record<string, string | undefined>,
  database: SupabaseClient,
  limits: ApiLimitsConfig,
  now: Date,
  requestId: string
): Promise<ApiKeyIdentity> => {
  const claims = parseOAuthJwtClaims(accessToken);
  if (!claims) {
    throw new HttpError(401, 'invalid_api_key', 'Invalid API key');
  }

  const clientIdentityHash = hashClientIdentity(getClientIdentity(headers));
  await checkOrRecordOAuthFailure(database, clientIdentityHash, limits, now, false);

  let authResult: Awaited<ReturnType<SupabaseClient['auth']['getUser']>>;
  try {
    if (!database.auth?.getUser) {
      throw new HttpError(401, 'invalid_access_token', 'Invalid, expired, or revoked OAuth access token');
    }
    authResult = await database.auth.getUser(accessToken);
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (isNetworkFetchError(error)) {
      throw new HttpError(
        503,
        'auth_service_unavailable',
        'Authentication service is temporarily unavailable',
        {},
        { suggestedFix: 'Check the network connection to Supabase and try again.' }
      );
    }
    throw error;
  }

  if (authResult.error || !authResult.data.user || authResult.data.user.id !== claims.sub) {
    await checkOrRecordOAuthFailure(database, clientIdentityHash, limits, now, true);
    throw new HttpError(401, 'invalid_access_token', 'Invalid, expired, or revoked OAuth access token');
  }

  const { data: profile, error: profileError } = await database
    .from('user_profiles')
    .select('is_premium')
    .eq('user_id', claims.sub)
    .maybeSingle<UserProfileRecord>();

  if (profileError) {
    throw profileError;
  }

  let grantedScopes: string[] = [...DEFAULT_OAUTH_FALLBACK_SCOPES];
  const { data: scopeRecord, error: scopeError } = await database
    .from('oauth_client_scopes')
    .select('scopes')
    .eq('user_id', claims.sub)
    .eq('client_id', claims.clientId)
    .maybeSingle<OAuthClientScopeRecord>();

  if (scopeError) {
    if (!isMissingDatabaseArtifactError(scopeError as { code?: string; message?: string })) {
      throw scopeError;
    }
  } else if (scopeRecord) {
    grantedScopes = normalizeScopes(scopeRecord.scopes, DEFAULT_OAUTH_FALLBACK_SCOPES);

    const { error: touchError } = await database
      .from('oauth_client_scopes')
      .update({ last_used_at: now.toISOString() })
      .eq('user_id', claims.sub)
      .eq('client_id', claims.clientId);

    if (touchError) {
      logEvent('warn', 'Failed to update OAuth client scope last used timestamp', requestId, {
        oauthClientId: claims.clientId,
        error: touchError.message,
      });
    }
  }

  return {
    apiKeyId: null,
    oauthClientId: claims.clientId,
    userId: claims.sub,
    keyPrefix: `oauth:${claims.clientId.slice(0, 16)}`,
    isPremium: Boolean(profile?.is_premium),
    rateLimitMax: limits.requestsPerMinute,
    scopes: grantedScopes,
  };
};

export const identifyApiKey = async (
  headers: Record<string, string | undefined>,
  database: SupabaseClient,
  limits: ApiLimitsConfig,
  now: Date = new Date(),
  requestId = 'api-auth'
): Promise<ApiKeyIdentity> => {
  const apiKey = extractBearerToken(headers);
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return identifyOAuthAccessToken(apiKey, headers, database, limits, now, requestId);
  }

  const keyHash = hashApiKey(apiKey);
  const clientIdentityHash = hashClientIdentity(getClientIdentity(headers));
  const { data: lookupData, error: lookupError } = await database.rpc(
    'lookup_api_key_for_auth',
    {
      p_key_hash: keyHash,
      p_identity_hash: clientIdentityHash,
      p_window_start: getWindowStart(now),
      p_failure_limit: limits.failedAuthRequestsPerHour,
    }
  );

  if (lookupError) {
    throw lookupError;
  }

  const lookup = unwrapApiKeyLookupResult(lookupData);
  if (!lookup) {
    throw new Error('API key lookup RPC did not return a result');
  }

  if (lookup.limited) {
    const windowStart = getWindowStart(now);
    const resetAt = new Date(new Date(windowStart).getTime() + 60 * 60 * 1000).toISOString();
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((new Date(resetAt).getTime() - now.getTime()) / 1000)
    );

    throw new HttpError(
      429,
      'rate_limit_exceeded',
      'Too many invalid API key attempts',
      {
        ...buildRateLimitHeaders(limits.failedAuthRequestsPerHour, 0, resetAt),
        'Retry-After': String(retryAfterSeconds),
      }
    );
  }

  if (!lookup.id || !lookup.user_id || !lookup.key_prefix) {
    throw new HttpError(401, 'invalid_api_key', 'Invalid API key');
  }

  const apiKeyRecord: ApiKeyRecord = {
    id: lookup.id,
    user_id: lookup.user_id,
    key_prefix: lookup.key_prefix,
  };

  const { data: profile, error: profileError } = await database
    .from('user_profiles')
    .select('is_premium')
    .eq('user_id', apiKeyRecord.user_id)
    .maybeSingle<UserProfileRecord>();

  if (profileError) {
    throw profileError;
  }

  const isPremium = Boolean(profile?.is_premium);

  const { error: touchError } = await database
    .from('api_keys')
    .update({ last_used_at: now.toISOString() })
    .eq('id', apiKeyRecord.id);

  if (touchError) {
    logEvent('warn', 'Failed to update API key last used timestamp', requestId, {
      apiKeyId: apiKeyRecord.id,
      error: touchError.message,
    });
  }

  return {
    apiKeyId: apiKeyRecord.id,
    userId: apiKeyRecord.user_id,
    keyPrefix: apiKeyRecord.key_prefix,
    isPremium,
    rateLimitMax: limits.requestsPerMinute,
    // Keys predating the scopes column (lookup returns null) keep full access.
    scopes: Array.isArray(lookup.scopes) && lookup.scopes.length > 0
      ? lookup.scopes
      : DEFAULT_API_SCOPES,
  };
};

export const consumeApiRateLimit = async (
  database: SupabaseClient,
  identity: ApiKeyIdentity,
  now: Date = new Date()
): Promise<ApiClientContext> => {
  const { data: rateLimitData, error: rateLimitError } = await database.rpc(
    'consume_api_user_minute_limit',
    {
      p_user_id: identity.userId,
      p_window_start: new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString(),
      p_limit: identity.rateLimitMax,
    }
  );

  if (rateLimitError) {
    throw rateLimitError;
  }

  const rateLimit = unwrapRateLimitResult(rateLimitData);
  if (!rateLimit) {
    throw new Error('Rate limit RPC did not return a result');
  }

  const rateLimitHeaders = buildRateLimitHeaders(
    identity.rateLimitMax,
    rateLimit.remaining,
    rateLimit.reset_at
  );

  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(rateLimit.reset_at).getTime() - now.getTime()) / 1000)
    );
    throw new HttpError(429, 'rate_limit_exceeded', 'Rate limit exceeded', {
      ...rateLimitHeaders,
      'Retry-After': String(retryAfterSeconds),
    });
  }

  return {
    apiKeyId: identity.apiKeyId,
    ...(identity.oauthClientId ? { oauthClientId: identity.oauthClientId } : {}),
    userId: identity.userId,
    keyPrefix: identity.keyPrefix,
    isPremium: identity.isPremium,
    scopes: identity.scopes,
    rateLimit: {
      limit: identity.rateLimitMax,
      remaining: rateLimit.remaining,
      resetAt: rateLimit.reset_at,
      headers: rateLimitHeaders,
    },
  };
};

export const authenticateApiKey = async (
  headers: Record<string, string | undefined>,
  database: SupabaseClient,
  limits: ApiLimitsConfig,
  now: Date = new Date(),
  requestId = 'api-auth'
): Promise<ApiClientContext> => {
  const identity = await identifyApiKey(headers, database, limits, now, requestId);
  return consumeApiRateLimit(database, identity, now);
};
