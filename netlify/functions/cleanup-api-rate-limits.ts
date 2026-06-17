import type { Config } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getApiLimitsConfig, getSupabaseAdminConfig } from './_shared/env';
import { createSupabaseAdminClient } from './_shared/supabase';

const RATE_LIMIT_TABLES = [
  'api_user_rate_limit_windows',
  'api_auth_failure_windows',
  'api_rate_limit_windows',
] as const;

interface CleanupApiRateLimitsDependencies {
  database: SupabaseClient;
  retentionHours: number;
  now(): Date;
}

type CleanupApiRateLimitsHandler = (_request: Request) => Promise<Response>;

const createDefaultDependencies = (): CleanupApiRateLimitsDependencies => ({
  database: createSupabaseAdminClient(getSupabaseAdminConfig()),
  retentionHours: getApiLimitsConfig().rateLimitRetentionHours,
  now: () => new Date(),
});

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

export const createCleanupApiRateLimitsHandler = (
  dependenciesFactory: () => CleanupApiRateLimitsDependencies = createDefaultDependencies
): CleanupApiRateLimitsHandler => async (): Promise<Response> => {
  let dependencies: CleanupApiRateLimitsDependencies;
  try {
    dependencies = dependenciesFactory();
  } catch (error) {
    console.error('[API Rate Limit Cleanup] Server configuration error:', error);
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const now = dependencies.now();
  const cutoff = new Date(
    now.getTime() - dependencies.retentionHours * 60 * 60 * 1000
  ).toISOString();

  try {
    const deletedCounts = Object.fromEntries(
      await Promise.all(
        RATE_LIMIT_TABLES.map(async table => [
          table,
          await deleteExpiredWindows(dependencies.database, table, cutoff),
        ])
      )
    );

    const summary = {
      message: 'API rate limit cleanup completed',
      cutoff,
      retentionHours: dependencies.retentionHours,
      deletedCounts,
      timestamp: now.toISOString(),
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

export default createCleanupApiRateLimitsHandler();

export const config: Config = {
  schedule: '@daily',
};
