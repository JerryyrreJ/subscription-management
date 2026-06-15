import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseAdminConfig, SupabasePublicConfig } from './env';

const CLIENT_OPTIONS = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
};

export const createSupabaseAuthClient = (
  config: SupabasePublicConfig
): SupabaseClient => createClient(config.url, config.publishableKey, CLIENT_OPTIONS);

export const createSupabaseAdminClient = (
  config: SupabaseAdminConfig
): SupabaseClient => createClient(config.url, config.secretKey, CLIENT_OPTIONS);
