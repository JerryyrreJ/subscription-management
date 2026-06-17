import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubscriptionsApiHandler } from '../../netlify/functions/api-v1-subscriptions.ts';
import { hashApiKey, hashClientIdentity } from '../../netlify/functions/_shared/apiKeys.ts';
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
  options: {
    rateLimitAllowed?: boolean;
    lookupFound?: boolean;
    lookupLimited?: boolean;
    touchError?: { message: string } | null;
  } = {}
) => createFakeSupabaseClient((state: QueryState) => {
  if (state.table === 'api_keys' && state.operation === 'update') {
    return { data: null, error: options.touchError ?? null };
  }

  if (state.table === 'user_profiles') {
    return { data: { is_premium: false }, error: null };
  }

  if (state.table === 'subscriptions') {
    return subscriptionResolver(state);
  }

  return { data: null, error: { message: `Unexpected query: ${state.table}` } };
}, (name, args) => {
  if (name === 'lookup_api_key_for_auth') {
    assert.equal(args.p_key_hash, hashApiKey(apiKey));
    assert.match(String(args.p_identity_hash), /^[a-f0-9]{64}$/);
    assert.equal(args.p_failure_limit, limits.failedAuthRequestsPerHour);

    if (options.lookupLimited) {
      return {
        data: [{ limited: true, id: null, user_id: null, key_prefix: null }],
        error: null,
      };
    }

    if (options.lookupFound === false) {
      return {
        data: [{ limited: false, id: null, user_id: null, key_prefix: null }],
        error: null,
      };
    }

    return {
      data: [{
        limited: false,
        id: apiKeyId,
        user_id: userId,
        key_prefix: apiKey.slice(0, 14),
      }],
      error: null,
    };
  }

  assert.equal(name, 'consume_api_user_rate_limit');
  assert.equal(args.p_user_id, userId);
  assert.equal(Object.hasOwn(args, 'p_api_key_id'), false);

  return {
    data: [{
      allowed: options.rateLimitAllowed ?? true,
      request_count: options.rateLimitAllowed === false ? 60 : 1,
      remaining: options.rateLimitAllowed === false ? 0 : 59,
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

test('responds to subscription API preflight requests with CORS headers', async () => {
  const handler = createSubscriptionsApiHandler(() => {
    throw new Error('Dependencies should not be created for preflight requests');
  });

  const response = expectHandlerResponse(await handler(event(
    'OPTIONS',
    '/api/v1/subscriptions',
    {
      origin: 'https://client.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type',
    }
  ), {} as never));

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers?.['Access-Control-Allow-Origin'], '*');
  assert.equal(response.headers?.['Access-Control-Allow-Headers'], 'Authorization, Content-Type');
  assert.equal(response.headers?.['Access-Control-Allow-Methods'], 'GET, POST, PATCH, DELETE, OPTIONS');
});

test('creates subscriptions for the API key owner and derives server-managed fields', async () => {
  let insertPayload: unknown;
  const createdRow = {
    ...subscriptionRow,
    id: '44444444-4444-4444-8444-444444444444',
    name: 'GitHub',
    category: 'Developer Tools',
    amount: '12.50',
    period: 'yearly',
    last_payment_date: '2026-06-17',
    next_payment_date: '2027-06-17',
    notification_enabled: false,
  };
  const database = createDatabase((state: QueryState) => {
    assert.equal(state.operation, 'insert');
    insertPayload = state.payload;
    return {
      data: createdRow,
      error: null,
    };
  });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-create',
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
      name: ' GitHub ',
      category: 'Developer Tools',
      amount: 12.5,
      currency: 'USD',
      period: 'yearly',
      lastPaymentDate: '2026-06-17',
      notificationEnabled: false,
    })
  ), {} as never));
  const body = parseJsonResponse<{ data: { id: string; amount: number; nextPaymentDate: string } }>(response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.headers?.['Access-Control-Allow-Origin'], '*');
  assert.deepEqual(insertPayload, {
    user_id: userId,
    name: 'GitHub',
    category: 'Developer Tools',
    amount: 12.5,
    currency: 'USD',
    period: 'yearly',
    last_payment_date: '2026-06-17',
    next_payment_date: '2027-06-17',
    custom_date: null,
    notification_enabled: false,
  });
  assert.equal(body.data.id, createdRow.id);
  assert.equal(body.data.amount, 12.5);
  assert.equal(body.data.nextPaymentDate, '2027-06-17');
});

test('patches subscriptions only within the API key owner scope and recalculates billing dates', async () => {
  let readFilters: Record<string, unknown> | null = null;
  let updateFilters: Record<string, unknown> | null = null;
  let updatePayload: unknown;
  const database = createDatabase((state: QueryState) => {
    if (state.operation === 'select') {
      readFilters = { ...state.filters };
      return {
        data: subscriptionRow,
        error: null,
      };
    }

    assert.equal(state.operation, 'update');
    updateFilters = { ...state.filters };
    updatePayload = state.payload;
    return {
      data: {
        ...subscriptionRow,
        period: 'yearly',
        next_payment_date: '2027-06-01',
      },
      error: null,
    };
  });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-patch',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'PATCH',
    `/api/v1/subscriptions/${subscriptionRow.id}`,
    {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    JSON.stringify({ period: 'yearly' })
  ), {} as never));
  const body = parseJsonResponse<{ data: { period: string; nextPaymentDate: string } }>(response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(readFilters, {
    user_id: userId,
    id: subscriptionRow.id,
  });
  assert.deepEqual(updateFilters, {
    user_id: userId,
    id: subscriptionRow.id,
  });
  assert.deepEqual(updatePayload, {
    name: 'Netflix',
    category: 'Streaming',
    amount: 15.99,
    currency: 'USD',
    period: 'yearly',
    last_payment_date: '2026-06-01',
    next_payment_date: '2027-06-01',
    custom_date: null,
    notification_enabled: true,
  });
  assert.equal(body.data.period, 'yearly');
  assert.equal(body.data.nextPaymentDate, '2027-06-01');
});

test('clears stale custom billing data when patching back to a standard period', async () => {
  let updatePayload: unknown;
  const customSubscriptionRow = {
    ...subscriptionRow,
    period: 'custom',
    custom_date: '45',
    next_payment_date: '2026-07-16',
  };
  const database = createDatabase((state: QueryState) => {
    if (state.operation === 'select') {
      return {
        data: customSubscriptionRow,
        error: null,
      };
    }

    updatePayload = state.payload;
    return {
      data: {
        ...subscriptionRow,
        period: 'monthly',
        custom_date: null,
        next_payment_date: '2026-07-01',
      },
      error: null,
    };
  });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-patch-standard',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'PATCH',
    `/api/v1/subscriptions/${subscriptionRow.id}`,
    {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    JSON.stringify({ period: 'monthly' })
  ), {} as never));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(updatePayload, {
    name: 'Netflix',
    category: 'Streaming',
    amount: 15.99,
    currency: 'USD',
    period: 'monthly',
    last_payment_date: '2026-06-01',
    next_payment_date: '2026-07-01',
    custom_date: null,
    notification_enabled: true,
  });
});

test('deletes subscriptions only within the API key owner scope', async () => {
  let deleteFilters: Record<string, unknown> | null = null;
  const database = createDatabase((state: QueryState) => {
    assert.equal(state.operation, 'delete');
    deleteFilters = { ...state.filters };
    return {
      data: { id: subscriptionRow.id },
      error: null,
    };
  });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-delete',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'DELETE',
    `/api/v1/subscriptions/${subscriptionRow.id}`,
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ deleted: boolean }>(response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(deleteFilters, {
    user_id: userId,
    id: subscriptionRow.id,
  });
  assert.equal(body.deleted, true);
});

test('rejects invalid API keys before accessing subscriptions', async () => {
  let subscriptionQueried = false;
  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'subscriptions') {
      subscriptionQueried = true;
    }

    return { data: null, error: null };
  }, (name) => {
    assert.equal(name, 'lookup_api_key_for_auth');
    return {
      data: [{ limited: false, id: null, user_id: null, key_prefix: null }],
      error: null,
    };
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
  const body = parseJsonResponse<{
    error: {
      code: string;
      field?: string;
      suggestedFix?: string;
      writableFields?: string[];
    };
  }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_subscription_field');
  assert.equal(body.error.field, 'nextPaymentDate');
  assert.match(body.error.suggestedFix ?? '', /server-managed fields/);
  assert.ok(body.error.writableFields?.includes('period'));
  assert.equal(response.headers?.['X-RateLimit-Limit'], '60');
  assert.equal(response.headers?.['X-RateLimit-Remaining'], '59');
  assert.equal(response.headers?.['Access-Control-Allow-Origin'], '*');
});

test('returns AI recovery hints for invalid subscription payloads', async () => {
  const database = createDatabase(() => ({
    data: null,
    error: null,
  }));
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-invalid-period',
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
      period: 'weekly',
      lastPaymentDate: '2026-06-01',
    })
  ), {} as never));
  const body = parseJsonResponse<{
    error: {
      code: string;
      field?: string;
      suggestedFix?: string;
      allowedValues?: string[];
    };
  }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_subscription');
  assert.equal(body.error.field, 'period');
  assert.match(body.error.suggestedFix ?? '', /supported billing periods/);
  assert.deepEqual(body.error.allowedValues, ['monthly', 'yearly', 'custom']);
});

test('returns 429 when an API key exceeds its hourly limit', async () => {
  const database = createDatabase(() => ({
    data: [subscriptionRow],
    error: null,
  }), { rateLimitAllowed: false });
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

test('returns 429 when invalid API key attempts exceed the auth failure limit', async () => {
  let profileQueried = false;
  let subscriptionQueried = false;
  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_profiles') {
      profileQueried = true;
    }

    if (state.table === 'subscriptions') {
      subscriptionQueried = true;
    }

    return { data: null, error: null };
  }, (name) => {
    assert.equal(name, 'lookup_api_key_for_auth');
    return {
      data: [{ limited: true, id: null, user_id: null, key_prefix: null }],
      error: null,
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
    '/api/v1/subscriptions',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 429);
  assert.equal(body.error.code, 'rate_limit_exceeded');
  assert.equal(profileQueried, false);
  assert.equal(subscriptionQueried, false);
});

test('does not fail the request when last_used_at cannot be updated', async () => {
  const database = createDatabase(() => ({
    data: [subscriptionRow],
    error: null,
  }), { touchError: { message: 'timestamp write failed' } });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-6',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'GET',
    '/api/v1/subscriptions',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ data: Array<{ id: string }> }>(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.data[0].id, subscriptionRow.id);
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
    createRequestId: () => 'request-7',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'GET',
    '/api/v1/subscriptions/not-a-uuid',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string; field?: string; suggestedFix?: string } }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_subscription_id');
  assert.equal(body.error.field, 'id');
  assert.match(body.error.suggestedFix ?? '', /listSubscriptions|createSubscription/);
  assert.equal(subscriptionQueried, false);
});

test('hashes the supplied API key before lookup', async () => {
  let lookedUpHash: unknown;
  const database = createFakeSupabaseClient(() => {
    return { data: null, error: null };
  }, (name, args) => {
    assert.equal(name, 'lookup_api_key_for_auth');
    lookedUpHash = args.p_key_hash;
    return {
      data: [{ limited: false, id: null, user_id: null, key_prefix: null }],
      error: null,
    };
  });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-8',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  await handler(event(
    'GET',
    '/api/v1/subscriptions',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never);

  assert.equal(lookedUpHash, hashApiKey(apiKey));
});

test('uses request metadata as a fallback auth failure identity when IP headers are absent', async () => {
  let identityHash: unknown;
  const database = createFakeSupabaseClient(() => {
    return { data: null, error: null };
  }, (name, args) => {
    assert.equal(name, 'lookup_api_key_for_auth');
    identityHash = args.p_identity_hash;
    return {
      data: [{ limited: false, id: null, user_id: null, key_prefix: null }],
      error: null,
    };
  });
  const handler = createSubscriptionsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-9',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  await handler(event(
    'GET',
    '/api/v1/subscriptions',
    {
      authorization: `Bearer ${apiKey}`,
      'user-agent': 'SubscriptionBot/1.0',
      'accept-language': 'en-US',
      'accept-encoding': 'gzip',
    }
  ), {} as never);

  assert.equal(
    identityHash,
    hashClientIdentity('fingerprint:SubscriptionBot/1.0:en-US:gzip')
  );
});
