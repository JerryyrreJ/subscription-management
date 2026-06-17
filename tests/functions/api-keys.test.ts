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
  failedAuthRequestsPerHour: 300,
  rateLimitRetentionHours: 48,
};

test('creates an API key for an authenticated user and stores only the hash', async () => {
  const fullKey = 'subm_public_part.test_secret_part';
  const keyPrefix = 'subm_public_part';
  let rpcPayload: Record<string, unknown> | null = null;

  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_profiles') {
      return { data: { is_premium: false }, error: null };
    }

    return { data: null, error: { message: `Unexpected query: ${state.table}` } };
  }, (name, args) => {
    assert.equal(name, 'create_api_key_if_under_limit');
    rpcPayload = args;
    return {
      data: [{
        created: true,
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Zapier',
        key_prefix: keyPrefix,
        created_at: '2026-06-16T00:00:00.000Z',
        last_used_at: null,
        revoked_at: null,
      }],
      error: null,
    };
  });

  const handler = createApiKeysHandler(() => ({
    supabaseConfig,
    database,
    limits,
    createAuthClient: () => ({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
    }),
    createApiKeyMaterial: () => ({ apiKey: fullKey, keyPrefix }),
    createRequestId: () => 'request-1',
    now: () => new Date('2026-06-16T00:00:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'POST',
    '/.netlify/functions/api-keys',
    { authorization: 'Bearer access-token' },
    JSON.stringify({ name: 'Zapier' })
  ), {} as never));
  const body = parseJsonResponse<{ apiKey: string; key: { keyPrefix: string } }>(response);

  assert.equal(response.statusCode, 201);
  assert.equal(body.apiKey, fullKey);
  assert.equal(body.key.keyPrefix, keyPrefix);
  assert.deepEqual(rpcPayload, {
    p_user_id: user.id,
    p_name: 'Zapier',
    p_key_prefix: keyPrefix,
    p_key_hash: hashApiKey(fullKey),
    p_active_key_limit: limits.freeActiveKeys,
  });
  assert.notEqual(body.key.keyPrefix, fullKey.slice(0, 14));
});

test('enforces active API key limits for free users through the creation RPC', async () => {
  let rpcCalled = false;
  const fullKey = 'subm_new_public.test_secret';
  const keyPrefix = 'subm_new_public';
  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_profiles') {
      return { data: { is_premium: false }, error: null };
    }

    return { data: null, error: null };
  }, (name, args) => {
    assert.equal(name, 'create_api_key_if_under_limit');
    assert.equal(args.p_active_key_limit, limits.freeActiveKeys);
    rpcCalled = true;
    return {
      data: [{
        created: false,
        id: null,
        name: null,
        key_prefix: null,
        created_at: null,
        last_used_at: null,
        revoked_at: null,
      }],
      error: null,
    };
  });

  const handler = createApiKeysHandler(() => ({
    supabaseConfig,
    database,
    limits,
    createAuthClient: () => ({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
    }),
    createApiKeyMaterial: () => ({ apiKey: fullKey, keyPrefix }),
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
  assert.equal(Object.hasOwn(body, 'apiKey'), false);
  assert.equal(rpcCalled, true);
});

test('returns 400 for invalid API key names', async () => {
  let rpcCalled = false;
  const database = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_profiles') {
      return { data: { is_premium: false }, error: null };
    }

    return { data: [], error: null };
  }, () => {
    rpcCalled = true;
    return { data: null, error: null };
  });

  const handler = createApiKeysHandler(() => ({
    supabaseConfig,
    database,
    limits,
    createAuthClient: () => ({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
    }),
    createApiKeyMaterial: () => ({ apiKey: 'subm_new_public.test_secret', keyPrefix: 'subm_new_public' }),
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
  assert.equal(rpcCalled, false);
});
