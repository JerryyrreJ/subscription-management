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
