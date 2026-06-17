import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCleanupApiRateLimitsHandler } from '../../netlify/functions/cleanup-api-rate-limits.ts';

type DeleteCall = {
  table: string;
  count: string;
  column: string;
  value: string;
};

const createCleanupDatabase = (
  calls: DeleteCall[],
  failingTable?: string
): SupabaseClient => ({
  from: (table: string) => ({
    delete: (options: { count: string }) => ({
      lt: async (column: string, value: string) => {
        calls.push({
          table,
          count: options.count,
          column,
          value,
        });

        if (table === failingTable) {
          return { count: null, error: { message: 'delete failed' } };
        }

        return { count: table.length, error: null };
      },
    }),
  }),
} as unknown as SupabaseClient);

test('cleanup API rate limit windows deletes expired rows from all window tables', async () => {
  const calls: DeleteCall[] = [];
  const handler = createCleanupApiRateLimitsHandler(() => ({
    database: createCleanupDatabase(calls),
    retentionHours: 48,
    now: () => new Date('2026-06-17T12:00:00.000Z'),
  }));

  const response = await handler(new Request('https://example.test/.netlify/functions/cleanup-api-rate-limits'));
  const body = await response.json() as {
    cutoff: string;
    retentionHours: number;
    deletedCounts: Record<string, number>;
    timestamp: string;
  };

  assert.equal(response.status, 200);
  assert.equal(body.cutoff, '2026-06-15T12:00:00.000Z');
  assert.equal(body.retentionHours, 48);
  assert.equal(body.timestamp, '2026-06-17T12:00:00.000Z');
  assert.deepEqual(calls, [
    {
      table: 'api_user_rate_limit_windows',
      count: 'exact',
      column: 'window_start',
      value: '2026-06-15T12:00:00.000Z',
    },
    {
      table: 'api_auth_failure_windows',
      count: 'exact',
      column: 'window_start',
      value: '2026-06-15T12:00:00.000Z',
    },
    {
      table: 'api_rate_limit_windows',
      count: 'exact',
      column: 'window_start',
      value: '2026-06-15T12:00:00.000Z',
    },
  ]);
  assert.equal(
    body.deletedCounts.api_user_rate_limit_windows,
    'api_user_rate_limit_windows'.length
  );
});

test('cleanup API rate limit windows returns 500 when a delete fails', async () => {
  const calls: DeleteCall[] = [];
  const handler = createCleanupApiRateLimitsHandler(() => ({
    database: createCleanupDatabase(calls, 'api_auth_failure_windows'),
    retentionHours: 48,
    now: () => new Date('2026-06-17T12:00:00.000Z'),
  }));

  const response = await handler(new Request('https://example.test/.netlify/functions/cleanup-api-rate-limits'));
  const body = await response.json() as { error: string };

  assert.equal(response.status, 500);
  assert.equal(body.error, 'Internal server error');
  assert.equal(calls.some(call => call.table === 'api_auth_failure_windows'), true);
});
