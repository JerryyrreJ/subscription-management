import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditApiHandler } from '../../netlify/functions/api-v1-audit.ts';
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
const subscriptionId = '33333333-3333-4333-8333-333333333333';

const limits = {
  freeRequestsPerHour: 60,
  premiumRequestsPerHour: 1000,
  freeActiveKeys: 1,
  premiumActiveKeys: 5,
  failedAuthRequestsPerHour: 300,
  rateLimitRetentionHours: 48,
};

const auditRows = [
  {
    id: 'log-1',
    action: 'subscription.create',
    subscription_id: subscriptionId,
    api_key_id: apiKeyId,
    request_id: 'req-1',
    metadata: { after: { name: 'Netflix' } },
    created_at: '2026-06-16T00:00:00.000Z',
  },
];

const makeDatabase = (
  options: { scopes?: string[]; capture?: (state: QueryState) => void } = {}
) => createFakeSupabaseClient((state: QueryState) => {
  if (state.table === 'api_keys' && state.operation === 'update') {
    return { data: null, error: null };
  }
  if (state.table === 'user_profiles') {
    return { data: { is_premium: false }, error: null };
  }
  if (state.table === 'api_audit_log') {
    options.capture?.(state);
    return { data: auditRows, error: null };
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
  createAuditApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-audit',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

test('lists audit entries for the API key owner in camelCase', async () => {
  const response = expectHandlerResponse(await handlerWith(makeDatabase())(event(
    'GET',
    '/api/v1/audit',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{
    data: Array<{ action: string; subscriptionId?: string; createdAt: string }>;
    pagination: { limit: number; offset: number; hasMore: boolean };
  }>(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.data[0].action, 'subscription.create');
  assert.equal(body.data[0].subscriptionId, subscriptionId);
  assert.equal(body.data[0].createdAt, '2026-06-16T00:00:00.000Z');
  assert.deepEqual(body.pagination, { limit: 50, offset: 0, hasMore: false });
});

test('filters audit entries by subscriptionId', async () => {
  let capturedFilters: Record<string, unknown> = {};
  const database = makeDatabase({ capture: (state) => { capturedFilters = state.filters; } });
  const response = expectHandlerResponse(await handlerWith(database)(event(
    'GET',
    '/api/v1/audit',
    { authorization: `Bearer ${apiKey}` },
    null,
    { subscriptionId }
  ), {} as never));

  assert.equal(response.statusCode, 200);
  assert.equal(capturedFilters['subscription_id'], subscriptionId);
});

test('rejects an invalid subscriptionId filter', async () => {
  const response = expectHandlerResponse(await handlerWith(makeDatabase())(event(
    'GET',
    '/api/v1/audit',
    { authorization: `Bearer ${apiKey}` },
    null,
    { subscriptionId: 'not-a-uuid' }
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string; field?: string } }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_query');
  assert.equal(body.error.field, 'subscriptionId');
});

test('is reachable by a read-only key', async () => {
  const response = expectHandlerResponse(await handlerWith(makeDatabase({ scopes: ['read'] }))(event(
    'GET',
    '/api/v1/audit',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));

  assert.equal(response.statusCode, 200);
});
