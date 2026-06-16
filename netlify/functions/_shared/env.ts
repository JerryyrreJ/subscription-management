import { z } from 'zod';

export type Environment = Record<string, string | undefined>;

const requiredValue = (name: string, value: string | undefined): string => {
  const result = z.string().trim().min(1).safeParse(value);
  if (!result.success) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return result.data;
};

const optionalValue = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized || undefined;
};

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

export interface SupabaseAdminConfig extends SupabasePublicConfig {
  secretKey: string;
}

export interface StripeServerConfig {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
  siteUrl: string;
}

export interface ApiLimitsConfig {
  freeRequestsPerHour: number;
  premiumRequestsPerHour: number;
  freeActiveKeys: number;
  premiumActiveKeys: number;
}

const optionalPositiveInteger = (
  name: string,
  value: string | undefined,
  fallback: number
): number => {
  const normalized = optionalValue(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== normalized) {
    throw new Error(`Invalid positive integer server environment variable: ${name}`);
  }

  return parsed;
};

export const getOptionalSupabasePublicConfig = (
  env: Environment = process.env
): SupabasePublicConfig | null => {
  const url = optionalValue(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  const publishableKey = optionalValue(
    env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
  );

  if (!url && !publishableKey) {
    return null;
  }

  if (!url || !publishableKey) {
    throw new Error('Supabase server configuration is incomplete');
  }

  return { url, publishableKey };
};

export const getSupabaseAdminConfig = (
  env: Environment = process.env
): SupabaseAdminConfig => {
  const publicConfig = getOptionalSupabasePublicConfig(env);
  if (!publicConfig) {
    throw new Error('Supabase server configuration is missing');
  }

  return {
    ...publicConfig,
    secretKey: requiredValue(
      'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY',
      env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
    ),
  };
};

export const getOptionalSupabaseAdminConfig = (
  env: Environment = process.env
): SupabaseAdminConfig | null => {
  const publicConfig = getOptionalSupabasePublicConfig(env);
  const secretKey = optionalValue(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);

  if (!publicConfig && !secretKey) {
    return null;
  }

  if (!publicConfig || !secretKey) {
    throw new Error('Supabase admin configuration is incomplete');
  }

  return { ...publicConfig, secretKey };
};

export const getStripeServerConfig = (
  env: Environment = process.env
): StripeServerConfig => ({
  secretKey: requiredValue('STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY),
  webhookSecret: requiredValue('STRIPE_WEBHOOK_SECRET', env.STRIPE_WEBHOOK_SECRET),
  priceId: requiredValue('STRIPE_PRICE_ID or VITE_STRIPE_PRICE_ID', env.STRIPE_PRICE_ID || env.VITE_STRIPE_PRICE_ID),
  siteUrl: requiredValue('SITE_URL or URL', env.SITE_URL || env.URL || 'http://localhost:5173'),
});

export const getApiLimitsConfig = (
  env: Environment = process.env
): ApiLimitsConfig => ({
  freeRequestsPerHour: optionalPositiveInteger(
    'API_FREE_RATE_LIMIT_PER_HOUR',
    env.API_FREE_RATE_LIMIT_PER_HOUR,
    60
  ),
  premiumRequestsPerHour: optionalPositiveInteger(
    'API_PREMIUM_RATE_LIMIT_PER_HOUR',
    env.API_PREMIUM_RATE_LIMIT_PER_HOUR,
    1000
  ),
  freeActiveKeys: optionalPositiveInteger(
    'API_FREE_ACTIVE_KEYS',
    env.API_FREE_ACTIVE_KEYS,
    1
  ),
  premiumActiveKeys: optionalPositiveInteger(
    'API_PREMIUM_ACTIVE_KEYS',
    env.API_PREMIUM_ACTIVE_KEYS,
    5
  ),
});
