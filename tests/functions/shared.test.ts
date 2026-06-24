import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';
import { authenticateRequest, extractBearerToken } from '../../netlify/functions/_shared/auth.ts';
import { HttpError, isNetworkFetchError } from '../../netlify/functions/_shared/http.ts';
import { sanitizeLogDetails } from '../../netlify/functions/_shared/logging.ts';

test('extractBearerToken accepts case-insensitive authorization headers', () => {
  assert.equal(
    extractBearerToken({ Authorization: 'Bearer access-token' }),
    'access-token'
  );
});

test('authenticateRequest returns trusted identity without exposing the token', async () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.test',
  } as User;

  const authenticated = await authenticateRequest(
    { authorization: 'Bearer access-token' },
    {
      auth: {
        getUser: async token => {
          assert.equal(token, 'access-token');
          return { data: { user }, error: null };
        },
      },
    }
  );

  assert.deepEqual(authenticated, {
    userId: user.id,
    email: user.email,
  });
});

test('authenticateRequest rejects an invalid token with 401', async () => {
  await assert.rejects(
    authenticateRequest(
      { authorization: 'Bearer invalid-token' },
      {
        auth: {
          getUser: async () => ({
            data: { user: null },
            error: { message: 'invalid token' },
          }),
        },
      }
    ),
    (error: unknown) => error instanceof HttpError && error.statusCode === 401
  );
});

test('authenticateRequest reports Supabase auth network failures as 503', async () => {
  await assert.rejects(
    authenticateRequest(
      { authorization: 'Bearer access-token' },
      {
        auth: {
          getUser: async () => {
            throw new TypeError('fetch failed');
          },
        },
      }
    ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 503 &&
      error.code === 'auth_service_unavailable'
  );
});

test('isNetworkFetchError recognizes Supabase plain-object fetch failures', () => {
  assert.equal(
    isNetworkFetchError({
      message: 'TypeError: fetch failed',
      code: '',
      details: 'TypeError: fetch failed\n    at runDatabaseRequest',
      hint: '',
    }),
    true
  );
});

test('sanitizeLogDetails recursively redacts secrets and masks email addresses', () => {
  assert.deepEqual(
    sanitizeLogDetails({
      email: 'owner@example.test',
      authorization: 'Bearer secret',
      nested: {
        stripeSecret: 'sk_test_secret',
        barkDeviceKey: 'device-key',
        keyPrefix: 'subm_public',
        key_prefix: 'subm_legacy',
        customerEmail: 'customer@example.test',
      },
    }),
    {
      email: 'o***@example.test',
      authorization: '<redacted>',
      nested: {
        stripeSecret: '<redacted>',
        barkDeviceKey: '<redacted>',
        keyPrefix: '<redacted>',
        key_prefix: '<redacted>',
        customerEmail: 'c***@example.test',
      },
    }
  );
});
