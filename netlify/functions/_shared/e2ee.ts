import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http';

/** Fail closed: no fallback when encryption state cannot be checked. */
export async function requirePlaintextAccount(database: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await database.from('encrypted_vaults').select('user_id').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) throw new HttpError(423, 'e2ee_enabled', 'End-to-end encryption is enabled. Use an updated client and unlock your vault.');
}
