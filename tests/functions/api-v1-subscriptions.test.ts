import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubscriptionsApiHandler } from '../../netlify/functions/api-v1-subscriptions.ts';
import { hashApiKey } from '../../netlify/functions/_shared/apiKeys.ts';
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
};

const subscriptionRow = {
  id: '33333333-3333-4333-8333-333333333333',
  user_id: userId,
  name: 'Netflix',
  category: 'Streaming',
  amount: 15.99,
  currency: 'USD',
  period: 'monthly',
  last_payment_date: '2026-06-01',
  next_payment_date: '2026-07-01',
  custom_date: null,
  notification_enabled: true,
  created_at: '2026-06-16T00:00:00.000Z',
  updated_at: '2026-06-16T00:00:00.000Z',
};

const createDatabase = (
  subscriptionResolver: (state: QueryState) => { data: unknown; error: { message: string } | null },
  rateLimitAllowed = true
) => createFakeSupabaseClient((state: QueryState) => {
  if (state.table === 'api_keys' && state.operation === 'select') {
    return {
      data: {
        id: apiKeyId,
        user_id: userId,
        key_prefix: apiKey.slice(0, 14),
      },
      error: null,
    };
  }

  if (state.table === 'api_keys' && state.operation === 'update') {
    return { data: null, error: null };
  }

  if (state.table === 'user_profiles') {
    return { data: { is_premium: false }, error: null };
  }

  if (state.table === 'subscriptions') {
    return subscriptionResolver(state);
  }

  return { data: null, error: { message: `Unexpected query: ${state.table}` } };
}, (name, args) => {
  assert.equal(name, 'consume_api_rate_limit');
  assert.equal(args.p_api_key_id, apiKeyId);

  return {
    data: [{
      allowed: rateLimitAllowed,
      request_count: rateLimitAllowed ? 1 : 60,
      remaining: rateLimitAllowed ? 59 : 0,
      reset_at: '2026-06-16T01:00:00.000Z',
    }],
    error: null,
  };
});

test('lists subscriptions for the API key owner and includes rate limit headers', async () => {
  const database = createDatabase(() => ({
    data: [subscriptionRow],
    error: null,
  }));
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-1',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'GET',
    '/api/v1/subscriptions',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ data: Array<{ id: string; nextPaymentDate: string }> }>(response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers?.['X-RateLimit-Limit'], '60');
  assert.equal(response.headers?.['X-RateLimit-Remaining'], '59');
  assert.equal(body.data[0].id, subscriptionRow.id);
  assert.equal(body.data[0].nextPaymentDate, '2026-07-01');
});

test('rejects invalid API keys before accessing subscriptions', async () => {
  let subscriptionQueried = false;
  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'api_keys') {
      return { data: null, error: null };
    }

    if (state.table === 'subscriptions') {
      subscriptionQueried = true;
    }

    return { data: null, error: null };
  });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-2',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'GET',
    '/api/v1/subscriptions',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));

  assert.equal(response.statusCode, 401);
  assert.equal(subscriptionQueried, false);
});

test('rejects client-managed subscription fields', async () => {
  const database = createDatabase(() => ({
    data: null,
    error: null,
  }));
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-3',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'POST',
    '/api/v1/subscriptions',
    {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    JSON.stringify({
      name: 'Netflix',
      category: 'Streaming',
      amount: 15.99,
      currency: 'USD',
      period: 'monthly',
      lastPaymentDate: '2026-06-01',
      nextPaymentDate: '2026-07-01',
    })
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_subscription_field');
});

test('returns 429 when an API key exceeds its hourly limit', async () => {
  const database = createDatabase(() => ({
    data: [subscriptionRow],
    error: null,
  }), false);
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-4',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'GET',
    '/api/v1/subscriptions',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 429);
  assert.equal(body.error.code, 'rate_limit_exceeded');
  assert.equal(response.headers?.['X-RateLimit-Remaining'], '0');
});

test('returns 400 for malformed subscription ids', async () => {
  let subscriptionQueried = false;
  const database = createDatabase((state: QueryState) => {
    subscriptionQueried = true;
    return {
      data: null,
      error: { message: `Unexpected subscription query: ${state.operation}` },
    };
  });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-5',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'GET',
    '/api/v1/subscriptions/not-a-uuid',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_subscription_id');
  assert.equal(subscriptionQueried, false);
});

test('hashes the supplied API key before lookup', async () => {
  let lookedUpHash: unknown;
  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'api_keys') {
      lookedUpHash = state.filters.key_hash;
      return { data: null, error: null };
    }

    return { data: null, error: null };
  });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-6',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  await handler(event(
    'GET',
    '/api/v1/subscriptions',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never);

  assert.equal(lookedUpHash, hashApiKey(apiKey));
});
