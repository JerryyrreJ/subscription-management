import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiKeyService, ApiKeyServiceError } from '../../src/services/apiKeyService';

const withMockFetch = async (
 response: Response,
 callback: () => Promise<void>
): Promise<void> => {
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async () => response;

 try {
  await callback();
 } finally {
  globalThis.fetch = originalFetch;
 }
};

test('listApiKeys rejects non-JSON success responses from a missing Functions endpoint', async () => {
 await withMockFetch(
  new Response('<!doctype html><html></html>', {
   status: 200,
   headers: { 'content-type': 'text/html' },
  }),
  async () => {
   await assert.rejects(
    () => ApiKeyService.listApiKeys('access-token'),
    (error: unknown) => error instanceof ApiKeyServiceError &&
     error.code === 'developer_api_unavailable'
   );
  }
 );
});

test('listApiKeys rejects malformed JSON API responses', async () => {
 await withMockFetch(
  Response.json({ keys: null, limits: null }),
  async () => {
   await assert.rejects(
    () => ApiKeyService.listApiKeys('access-token'),
    (error: unknown) => error instanceof ApiKeyServiceError &&
     error.code === 'invalid_api_response'
   );
  }
 );
});

test('listApiKeys rejects invalid JSON API responses', async () => {
 await withMockFetch(
  new Response('{not-json', {
   status: 200,
   headers: { 'content-type': 'application/json' },
  }),
  async () => {
   await assert.rejects(
    () => ApiKeyService.listApiKeys('access-token'),
    (error: unknown) => error instanceof ApiKeyServiceError &&
     error.code === 'invalid_api_response'
   );
  }
 );
});

test('connection verification accepts an empty paginated list, not a generic JSON success', async () => {
 await withMockFetch(Response.json({ data: [], pagination: { limit: 1, offset: 0, hasMore: false } }), async () => {
  await ApiKeyService.verifyConnection('subm_test.secret');
 });
 await withMockFetch(Response.json({ ok: true }), async () => {
  await assert.rejects(() => ApiKeyService.verifyConnection('subm_test.secret'), (error: unknown) => error instanceof ApiKeyServiceError && error.code === 'invalid_api_response');
 });
 await withMockFetch(new Response('<html>app</html>', { headers: { 'content-type': 'text/html' } }), async () => {
  await assert.rejects(() => ApiKeyService.verifyConnection('subm_test.secret'), (error: unknown) => error instanceof ApiKeyServiceError && error.code === 'developer_api_unavailable');
 });
});

test('key creation preserves the selected permissions and sends the login token', async () => {
 const originalFetch = globalThis.fetch;
 try {
  globalThis.fetch = async (url, options) => {
   assert.equal(url, '/.netlify/functions/api-keys');
   assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer login-token');
   assert.deepEqual(JSON.parse(String(options?.body)), { name: 'Reader', scopes: ['read'] });
   return Response.json({ apiKey: 'subm_test.secret', key: { id: 'key-id', name: 'Reader', keyPrefix: 'subm_test', scopes: ['read'], createdAt: '2026-10-07T00:00:00Z', lastUsedAt: null, revokedAt: null } });
  };
  const result = await ApiKeyService.createApiKey('login-token', 'Reader', ['read']);
  assert.deepEqual(result.key.scopes, ['read']);
 } finally { globalThis.fetch = originalFetch; }
});
