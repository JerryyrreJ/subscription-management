import test from 'node:test';
import assert from 'node:assert/strict';
import type { HandlerEvent } from '@netlify/functions';
import type { User } from '@supabase/supabase-js';
import { createDeleteAccountHandler } from '../../netlify/functions/delete-account.ts';

const authenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.test',
} as User;

const event = (
  method = 'DELETE',
  body = JSON.stringify({ confirmation: 'DELETE_ACCOUNT' }),
  headers: Record<string, string> = { authorization: 'Bearer valid-token' }
): HandlerEvent => ({
  httpMethod: method,
  headers,
  body,
} as unknown as HandlerEvent);

const supabaseConfig = {
  url: 'https://supabase.test',
  publishableKey: 'publishable',
  secretKey: 'secret',
};

test('account deletion only accepts DELETE requests', async () => {
  const handler = createDeleteAccountHandler(() => {
    throw new Error('Dependencies should not be created');
  });

  const response = await handler(event('POST'), {} as never);

  assert.equal(response?.statusCode, 405);
  assert.equal(response?.headers?.Allow, 'DELETE');
});

test('account deletion requires an explicit server confirmation value', async () => {
  let adminCalled = false;
  const handler = createDeleteAccountHandler(() => ({
    supabaseConfig,
    authClient: {
      auth: { getUser: async () => ({ data: { user: authenticatedUser }, error: null }) },
    },
    adminClient: {
      auth: { admin: { deleteUser: async () => {
        adminCalled = true;
        return { data: null, error: null };
      } } },
    },
    createRequestId: () => 'request-confirmation',
  }));

  const response = await handler(event('DELETE', JSON.stringify({ confirmation: 'wrong' })), {} as never);

  assert.equal(response?.statusCode, 400);
  assert.equal(adminCalled, false);
});

test('account deletion rejects an invalid access token', async () => {
  let adminCalled = false;
  const handler = createDeleteAccountHandler(() => ({
    supabaseConfig,
    authClient: {
      auth: { getUser: async () => ({ data: { user: null }, error: { message: 'invalid' } }) },
    },
    adminClient: {
      auth: { admin: { deleteUser: async () => {
        adminCalled = true;
        return { data: null, error: null };
      } } },
    },
    createRequestId: () => 'request-invalid-token',
  }));

  const response = await handler(event(), {} as never);

  assert.equal(response?.statusCode, 401);
  assert.equal(adminCalled, false);
});

test('account deletion ignores a forged body user id and deletes the authenticated user', async () => {
  let deletedUserId = '';
  const handler = createDeleteAccountHandler(() => ({
    supabaseConfig,
    authClient: {
      auth: { getUser: async token => {
        assert.equal(token, 'valid-token');
        return { data: { user: authenticatedUser }, error: null };
      } },
    },
    adminClient: {
      auth: { admin: { deleteUser: async userId => {
        deletedUserId = userId;
        return { data: { user: null }, error: null };
      } } },
    },
    createRequestId: () => 'request-success',
  }));

  const response = await handler(event(
    'DELETE',
    JSON.stringify({ confirmation: 'DELETE_ACCOUNT', userId: 'attacker-controlled-id' })
  ), {} as never);

  assert.equal(response?.statusCode, 200);
  assert.equal(deletedUserId, authenticatedUser.id);
  assert.equal(JSON.parse(response?.body || '{}').deleted, true);
});

test('account deletion does not report success when Supabase rejects deletion', async () => {
  const handler = createDeleteAccountHandler(() => ({
    supabaseConfig,
    authClient: {
      auth: { getUser: async () => ({ data: { user: authenticatedUser }, error: null }) },
    },
    adminClient: {
      auth: { admin: { deleteUser: async () => ({
        data: null,
        error: { message: 'deletion rejected', code: 'unexpected_failure' },
      }) } },
    },
    createRequestId: () => 'request-admin-error',
  }));

  const response = await handler(event(), {} as never);

  assert.equal(response?.statusCode, 502);
  assert.equal(JSON.parse(response?.body || '{}').error.code, 'account_deletion_failed');
});
