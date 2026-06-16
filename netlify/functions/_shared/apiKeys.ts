import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiLimitsConfig } from './env';
import { extractBearerToken } from './auth';
import { HttpError } from './http';

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

export const generateApiKey = (): string =>
  `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;

export const hashApiKey = (apiKey: string): string =>
  createHash('sha256').update(apiKey).digest('hex');

export const getApiKeyPrefix = (apiKey: string): string => apiKey.slice(0, 14);

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

const unwrapRateLimitResult = (data: unknown): RateLimitResult | null => {
  if (Array.isArray(data)) {
    return (data[0] as RateLimitResult | undefined) ?? null;
  }

  return (data as RateLimitResult | null) ?? null;
};

export const authenticateApiKey = async (
  headers: Record<string, string | undefined>,
  database: SupabaseClient,
  limits: ApiLimitsConfig,
  now: Date = new Date()
): Promise<ApiClientContext> => {
  const apiKey = extractBearerToken(headers);
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    throw new HttpError(401, 'invalid_api_key', 'Invalid API key');
  }

  const keyHash = hashApiKey(apiKey);
  const { data: apiKeyRecord, error: apiKeyError } = await database
    .from('api_keys')
    .select('id, user_id, key_prefix')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .maybeSingle<ApiKeyRecord>();

  if (apiKeyError) {
    throw apiKeyError;
  }

  if (!apiKeyRecord) {
    throw new HttpError(401, 'invalid_api_key', 'Invalid API key');
  }

  const { data: profile, error: profileError } = await database
    .from('user_profiles')
    .select('is_premium')
    .eq('user_id', apiKeyRecord.user_id)
    .maybeSingle<UserProfileRecord>();

  if (profileError) {
    throw profileError;
  }

  const isPremium = Boolean(profile?.is_premium);
  const limit = isPremium ? limits.premiumRequestsPerHour : limits.freeRequestsPerHour;
  const { data: rateLimitData, error: rateLimitError } = await database.rpc(
    'consume_api_rate_limit',
    {
      p_api_key_id: apiKeyRecord.id,
      p_window_start: getWindowStart(now),
      p_limit: limit,
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
    limit,
    rateLimit.remaining,
    rateLimit.reset_at
  );

  if (!rateLimit.allowed) {
    throw new HttpError(429, 'rate_limit_exceeded', 'Rate limit exceeded', rateLimitHeaders);
  }

  const { error: touchError } = await database
    .from('api_keys')
    .update({ last_used_at: now.toISOString() })
    .eq('id', apiKeyRecord.id);

  if (touchError) {
    throw touchError;
  }

  return {
    apiKeyId: apiKeyRecord.id,
    userId: apiKeyRecord.user_id,
    keyPrefix: apiKeyRecord.key_prefix,
    isPremium,
    rateLimit: {
      limit,
      remaining: rateLimit.remaining,
      resetAt: rateLimit.reset_at,
      headers: rateLimitHeaders,
    },
  };
};
