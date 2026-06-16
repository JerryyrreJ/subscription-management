import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';
import { createApiKeysHandler } from '../../netlify/functions/api-keys.ts';
import { hashApiKey } from '../../netlify/functions/_shared/apiKeys.ts';
import {
  createFakeSupabaseClient,
  event,
  expectHandlerResponse,
  parseJsonResponse,
  type QueryState,
} from './apiTestHelpers.ts';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.test',
} as User;

const supabaseConfig = {
  url: 'https://supabase.test',
  publishableKey: 'publishable',
  secretKey: 'secret',
};

const limits = {
  freeRequestsPerHour: 60,
  premiumRequestsPerHour: 1000,
  freeActiveKeys: 1,
  premiumActiveKeys: 5,
};

test('creates an API key for an authenticated user and stores only the hash', async () => {
  const fullKey = 'subm_test_api_key';
  let insertedPayload: unknown;

  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_profiles') {
      return { data: { is_premium: false }, error: null };
    }

    if (state.table === 'api_keys' && state.operation === 'select') {
      return { data: [], error: null };
    }

    if (state.table === 'api_keys' && state.operation === 'insert') {
      insertedPayload = state.payload;
      return {
        data: {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Zapier',
          key_prefix: fullKey.slice(0, 14),
          created_at: '2026-06-16T00:00:00.000Z',
          last_used_at: null,
          revoked_at: null,
        },
        error: null,
      };
    }

    return { data: null, error: { message: `Unexpected query: ${state.table}` } };
  });

  const handler = createApiKeysHandler(() => ({
    supabaseConfig,
    database,
    limits,
    createAuthClient: () => ({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
    }),
    createApiKey: () => fullKey,
    createRequestId: () => 'request-1',
    now: () => new Date('2026-06-16T00:00:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'POST',
    '/.netlify/functions/api-keys',
    { authorization: 'Bearer access-token' },
    JSON.stringify({ name: 'Zapier' })
  ), {} as never));
  const body = parseJsonResponse<{ apiKey: string }>(response);

  assert.equal(response.statusCode, 201);
  assert.equal(body.apiKey, fullKey);
  assert.deepEqual(insertedPayload, {
    user_id: user.id,
    name: 'Zapier',
    key_prefix: fullKey.slice(0, 14),
    key_hash: hashApiKey(fullKey),
  });
});

test('enforces active API key limits for free users', async () => {
  let insertCalled = false;
  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_profiles') {
      return { data: { is_premium: false }, error: null };
    }

    if (state.table === 'api_keys' && state.operation === 'select') {
      return {
        data: [{
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Existing',
          key_prefix: 'subm_existing',
          created_at: '2026-06-16T00:00:00.000Z',
          last_used_at: null,
          revoked_at: null,
        }],
        error: null,
      };
    }

    if (state.table === 'api_keys' && state.operation === 'insert') {
      insertCalled = true;
    }

    return { data: null, error: null };
  });

  const handler = createApiKeysHandler(() => ({
    supabaseConfig,
    database,
    limits,
    createAuthClient: () => ({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
    }),
    createApiKey: () => 'subm_new_key',
    createRequestId: () => 'request-2',
    now: () => new Date('2026-06-16T00:00:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'POST',
    '/.netlify/functions/api-keys',
    { authorization: 'Bearer access-token' },
    JSON.stringify({ name: 'Too many' })
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 403);
  assert.equal(body.error.code, 'api_key_limit_exceeded');
  assert.equal(insertCalled, false);
});

test('returns 400 for invalid API key names', async () => {
  let insertCalled = false;
  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_profiles') {
      return { data: { is_premium: false }, error: null };
    }

    if (state.table === 'api_keys' && state.operation === 'insert') {
      insertCalled = true;
    }

    return { data: [], error: null };
  });

  const handler = createApiKeysHandler(() => ({
    supabaseConfig,
    database,
    limits,
    createAuthClient: () => ({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
    }),
    createApiKey: () => 'subm_new_key',
    createRequestId: () => 'request-3',
    now: () => new Date('2026-06-16T00:00:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'POST',
    '/.netlify/functions/api-keys',
    { authorization: 'Bearer access-token' },
    JSON.stringify({ name: '' })
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_api_key');
  assert.equal(insertCalled, false);
});
