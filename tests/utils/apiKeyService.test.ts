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
