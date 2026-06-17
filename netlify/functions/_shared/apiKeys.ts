import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiLimitsConfig } from './env';
import { extractBearerToken } from './auth';
import { HttpError } from './http';
import { logEvent } from './logging';

export const API_KEY_PREFIX = 'subm_';

interface ApiKeyRecord {
  id: string;
  user_id: string;
  key_prefix: string;
}

interface UserProfileRecord {
  is_premium: boolean | null;
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
}

export interface ApiKeyMaterial {
  apiKey: string;
  keyPrefix: string;
}

export interface ApiKeyIdentity {
  apiKeyId: string;
  userId: string;
  keyPrefix: string;
  isPremium: boolean;
  rateLimitMax: number;
}

export interface ApiClientContext {
  apiKeyId: string;
  userId: string;
  keyPrefix: string;
  isPremium: boolean;
  rateLimit: {
    limit: number;
    remaining: number;
    resetAt: string;
    headers: Record<string, string>;
  };
}

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

export const identifyApiKey = async (
  headers: Record<string, string | undefined>,
  database: SupabaseClient,
  limits: ApiLimitsConfig,
  now: Date = new Date(),
  requestId = 'api-auth'
): Promise<ApiKeyIdentity> => {
  const apiKey = extractBearerToken(headers);
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    throw new HttpError(401, 'invalid_api_key', 'Invalid API key');
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
    rateLimitMax: isPremium ? limits.premiumRequestsPerHour : limits.freeRequestsPerHour,
  };
};

export const consumeApiRateLimit = async (
  database: SupabaseClient,
  identity: ApiKeyIdentity,
  now: Date = new Date()
): Promise<ApiClientContext> => {
  const { data: rateLimitData, error: rateLimitError } = await database.rpc(
    'consume_api_user_rate_limit',
    {
      p_user_id: identity.userId,
      p_window_start: getWindowStart(now),
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
    throw new HttpError(429, 'rate_limit_exceeded', 'Rate limit exceeded', rateLimitHeaders);
  }

  return {
    apiKeyId: identity.apiKeyId,
    userId: identity.userId,
    keyPrefix: identity.keyPrefix,
    isPremium: identity.isPremium,
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
