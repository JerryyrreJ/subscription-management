import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsApiHandler } from '../../netlify/functions/api-v1-analytics.ts';
import {
  createFakeSupabaseClient,
  event,
  expectHandlerResponse,
  parseJsonResponse,
  type QueryState,
} from './apiTestHelpers.ts';

const apiKey = 'subm_test_api_key';
const apiKeyId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';

const limits = {
  freeRequestsPerHour: 60,
  premiumRequestsPerHour: 1000,
  freeActiveKeys: 1,
  premiumActiveKeys: 5,
  failedAuthRequestsPerHour: 300,
  rateLimitRetentionHours: 48,
};

const rows = [
  { id: 'a', name: 'Netflix', category: 'Streaming', amount: '15.00', currency: 'USD', period: 'monthly', custom_date: null, next_payment_date: '2026-06-20', status: 'active' },
  { id: 'b', name: 'netflix', category: 'Streaming', amount: '9.99', currency: 'USD', period: 'monthly', custom_date: null, next_payment_date: '2026-07-30', status: 'active' },
  { id: 'c', name: 'Figma', category: 'Design', amount: '45.00', currency: 'USD', period: 'monthly', custom_date: null, next_payment_date: '2026-08-01', status: 'cancelled' },
];

const makeDatabase = (
  options: { scopes?: string[]; subscriptionRows?: unknown[] } = {}
) => createFakeSupabaseClient((state: QueryState) => {
  if (state.table === 'api_keys' && state.operation === 'update') {
    return { data: null, error: null };
  }
  if (state.table === 'user_profiles') {
    return { data: { is_premium: false }, error: null };
  }
  if (state.table === 'subscriptions') {
    return { data: options.subscriptionRows ?? rows, error: null };
  }
  return { data: null, error: { message: `Unexpected query: ${state.table}` } };
}, (name) => {
  if (name === 'lookup_api_key_for_auth') {
    return {
      data: [{
        limited: false,
        id: apiKeyId,
        user_id: userId,
        key_prefix: apiKey.slice(0, 14),
        scopes: options.scopes ?? ['read', 'write'],
      }],
      error: null,
    };
  }
  return {
    data: [{ allowed: true, request_count: 1, remaining: 59, reset_at: '2026-06-16T01:00:00.000Z' }],
    error: null,
  };
});

const handlerWith = (database: ReturnType<typeof makeDatabase>) =>
  createAnalyticsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-analytics',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

test('summary returns per-currency totals and upcoming renewals', async () => {
  const response = expectHandlerResponse(await handlerWith(makeDatabase())(event(
    'GET',
    '/api/v1/analytics/summary',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{
    summary: {
      counts: { total: number; active: number; cancelled: number };
      byCurrency: Array<{ currency: string; monthlyTotal: number }>;
      upcomingRenewals: Array<{ name: string }>;
    };
  }>(response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers?.['X-RateLimit-Limit'], '60');
  assert.deepEqual(body.summary.counts, { total: 3, active: 2, paused: 0, cancelled: 1 });
  assert.equal(body.summary.byCurrency.find(entry => entry.currency === 'USD')?.monthlyTotal, 24.99);
  assert.equal(body.summary.upcomingRenewals.length, 1);
  assert.equal(body.summary.upcomingRenewals[0].name, 'Netflix');
});

test('duplicates groups active subscriptions sharing a name', async () => {
  const response = expectHandlerResponse(await handlerWith(makeDatabase())(event(
    'GET',
    '/api/v1/analytics/duplicates',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ duplicates: Array<{ normalizedName: string; subscriptions: unknown[] }> }>(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.duplicates.length, 1);
  assert.equal(body.duplicates[0].normalizedName, 'netflix');
  assert.equal(body.duplicates[0].subscriptions.length, 2);
});

test('optimizations is reachable by a read-only key', async () => {
  const response = expectHandlerResponse(await handlerWith(makeDatabase({ scopes: ['read'] }))(event(
    'GET',
    '/api/v1/analytics/optimizations',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ optimizations: { monthlyToAnnual: unknown[] } }>(response);

  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(body.optimizations.monthlyToAnnual));
});

test('unknown analytics views return 404 with a recovery hint', async () => {
  const response = expectHandlerResponse(await handlerWith(makeDatabase())(event(
    'GET',
    '/api/v1/analytics/unknown',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string; suggestedFix?: string } }>(response);

  assert.equal(response.statusCode, 404);
  assert.equal(body.error.code, 'not_found');
  assert.match(body.error.suggestedFix ?? '', /summary/);
});

test('rejects non-GET methods', async () => {
  const response = expectHandlerResponse(await handlerWith(makeDatabase())(event(
    'POST',
    '/api/v1/analytics/summary',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));

  assert.equal(response.statusCode, 405);
});
