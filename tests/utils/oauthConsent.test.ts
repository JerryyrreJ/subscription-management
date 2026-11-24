import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOAuthConsentUrl,
  consumePendingOAuthAuthorizationId,
  extractAuthorizationId,
  isOAuthConsentPath,
  isSafeExternalRedirectUrl,
  peekPendingOAuthAuthorizationId,
  savePendingOAuthAuthorizationId,
  type SimpleStorage,
} from '../../src/utils/oauthConsent.ts';
import { isApplicationEntry } from '../../src/utils/siteRouting.ts';

const createMemoryStorage = (): SimpleStorage => {
  const store = new Map<string, string>();
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: key => {
      store.delete(key);
    },
  };
};

test('isOAuthConsentPath and siteRouting recognize /oauth/consent as an application route', () => {
  assert.equal(isOAuthConsentPath('/oauth/consent'), true);
  assert.equal(isOAuthConsentPath('/oauth/consent/'), true);
  assert.equal(isOAuthConsentPath('/app/oauth/consent'), true);
  assert.equal(isOAuthConsentPath('/app'), false);
  assert.equal(isOAuthConsentPath('/pricing'), false);

  assert.equal(
    isApplicationEntry(new URL('https://steadyrenew.com/oauth/consent?authorization_id=abc_123')),
    true
  );
});

test('extractAuthorizationId validates query parameters and rejects unsafe values', () => {
  assert.equal(extractAuthorizationId('?authorization_id=auth_req-123.456'), 'auth_req-123.456');
  assert.equal(extractAuthorizationId('authorization_id=uuid-value'), 'uuid-value');
  assert.equal(extractAuthorizationId('?authorization_id='), null);
  assert.equal(extractAuthorizationId('?authorization_id=bad%20space'), null);
  assert.equal(extractAuthorizationId('?authorization_id=<script>'), null);
});

test('pending OAuth authorization_id round-trips through storage and clears on consume', () => {
  const storage = createMemoryStorage();
  savePendingOAuthAuthorizationId(storage, 'auth-999');
  assert.equal(peekPendingOAuthAuthorizationId(storage), 'auth-999');
  assert.equal(consumePendingOAuthAuthorizationId(storage), 'auth-999');
  assert.equal(peekPendingOAuthAuthorizationId(storage), null);

  assert.equal(
    buildOAuthConsentUrl('https://steadyrenew.com/app', 'auth-999'),
    'https://steadyrenew.com/oauth/consent?authorization_id=auth-999'
  );
});

test('isSafeExternalRedirectUrl permits HTTPS, loopback HTTP, and native app schemes while blocking script/data URIs', () => {
  assert.equal(isSafeExternalRedirectUrl('https://chatgpt.com/connector_platform_oauth_redirect?code=123'), true);
  assert.equal(isSafeExternalRedirectUrl('https://claude.ai/api/mcp/auth_callback?code=123'), true);
  assert.equal(isSafeExternalRedirectUrl('http://127.0.0.1:54321/callback?code=123'), true);
  assert.equal(isSafeExternalRedirectUrl('http://localhost:3333/callback?code=123'), true);
  assert.equal(isSafeExternalRedirectUrl('cursor://mcp/oauth-callback?code=123'), true);

  assert.equal(isSafeExternalRedirectUrl('http://evil.example.com/callback'), false);
  assert.equal(isSafeExternalRedirectUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalRedirectUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeExternalRedirectUrl('file:///etc/passwd'), false);
  assert.equal(isSafeExternalRedirectUrl(''), false);
});
