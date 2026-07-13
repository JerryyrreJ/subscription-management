import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountDeletionError, deleteAccount } from '../../src/services/accountService.ts';

const withMockedFetch = async (
  fetchImplementation: typeof fetch,
  callback: () => Promise<void>
) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImplementation;

  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('deleteAccount sends the access token and explicit confirmation', async () => {
  await withMockedFetch(async (input, init) => {
    assert.equal(input, '/.netlify/functions/delete-account');
    assert.equal(init?.method, 'DELETE');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer access-token');
    assert.deepEqual(JSON.parse(String(init?.body)), { confirmation: 'DELETE_ACCOUNT' });

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }, async () => {
    await deleteAccount('access-token');
  });
});

test('deleteAccount surfaces structured API failures', async () => {
  await withMockedFetch(async () => new Response(JSON.stringify({
    error: { code: 'account_deletion_failed', message: 'Account could not be deleted' },
  }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  }), async () => {
    await assert.rejects(
      deleteAccount('access-token'),
      (error: unknown) =>
        error instanceof AccountDeletionError &&
        error.code === 'account_deletion_failed'
    );
  });
});
