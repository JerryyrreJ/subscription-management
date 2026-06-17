import type { Config } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getApiLimitsConfig, getSupabaseAdminConfig } from './_shared/env';
import { createSupabaseAdminClient } from './_shared/supabase';

const RATE_LIMIT_TABLES = [
  'api_user_rate_limit_windows',
  'api_auth_failure_windows',
  'api_rate_limit_windows',
] as const;

const deleteExpiredWindows = async (
  database: SupabaseClient,
  table: typeof RATE_LIMIT_TABLES[number],
  cutoff: string
): Promise<number | null> => {
  const { count, error } = await database
    .from(table)
    .delete({ count: 'exact' })
    .lt('window_start', cutoff);

  if (error) {
    throw error;
  }

  return count;
};

export default async (): Promise<Response> => {
  let database: SupabaseClient;
  let retentionHours: number;

  try {
    database = createSupabaseAdminClient(getSupabaseAdminConfig());
    retentionHours = getApiLimitsConfig().rateLimitRetentionHours;
  } catch (error) {
    console.error('[API Rate Limit Cleanup] Server configuration error:', error);
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();

  try {
    const deletedCounts = Object.fromEntries(
      await Promise.all(
        RATE_LIMIT_TABLES.map(async table => [
          table,
          await deleteExpiredWindows(database, table, cutoff),
        ])
      )
    );

    const summary = {
      message: 'API rate limit cleanup completed',
      cutoff,
      retentionHours,
      deletedCounts,
      timestamp: new Date().toISOString(),
    };

    console.log('[API Rate Limit Cleanup] Summary:', summary);
    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[API Rate Limit Cleanup] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const config: Config = {
  schedule: '@daily',
};
