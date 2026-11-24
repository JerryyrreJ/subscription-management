import test from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthProtectedResourceHandler } from '../../netlify/functions/oauth-protected-resource.ts';

test('OAuth protected resource metadata serves root and /api/mcp paths with Supabase Auth issuer', async () => {
  const handler = createOAuthProtectedResourceHandler({
    SUPABASE_URL: 'https://exampleproj.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  });

  const preflight = await handler(
    new Request('https://steadyrenew.com/.well-known/oauth-protected-resource', {
      method: 'OPTIONS',
    })
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');

  const rootRes = await handler(
    new Request('https://steadyrenew.com/.well-known/oauth-protected-resource')
  );
  assert.equal(rootRes.status, 200);
  const rootJson = (await rootRes.json()) as {
    resource: string;
    resource_name: string;
    authorization_servers: string[];
    bearer_methods_supported: string[];
  };
  assert.equal(rootJson.resource, 'https://steadyrenew.com/api/mcp');
  assert.equal(rootJson.resource_name, 'SteadyRenew');
  assert.deepEqual(rootJson.authorization_servers, ['https://exampleproj.supabase.co/auth/v1']);
  assert.deepEqual(rootJson.bearer_methods_supported, ['header']);

  // RFC 9728 path-specific lookup (`/.well-known/oauth-protected-resource/api/mcp`)
  // and Netlify rewritten function paths resolve to the exact same metadata.
  const subPathRes = await handler(
    new Request('https://steadyrenew.com/.netlify/functions/oauth-protected-resource/api/mcp')
  );
  assert.equal(subPathRes.status, 200);
  assert.deepEqual(await subPathRes.json(), await (await handler(
    new Request('https://steadyrenew.com/.well-known/oauth-protected-resource')
  )).json());

  const unknownPath = await handler(
    new Request('https://steadyrenew.com/.well-known/oauth-protected-resource/other')
  );
  assert.equal(unknownPath.status, 404);

  const postRes = await handler(
    new Request('https://steadyrenew.com/.well-known/oauth-protected-resource', {
      method: 'POST',
    })
  );
  assert.equal(postRes.status, 405);
});

test('OAuth protected resource metadata supports explicit authorization server override and fails closed when unconfigured', async () => {
  const overrideHandler = createOAuthProtectedResourceHandler({
    MCP_OAUTH_AUTHORIZATION_SERVER: 'https://auth.steadyrenew.com/auth/v1/',
  });
  const overrideRes = await overrideHandler(
    new Request('https://steadyrenew.com/.well-known/oauth-protected-resource')
  );
  assert.equal(overrideRes.status, 200);
  const overrideJson = (await overrideRes.json()) as { authorization_servers: string[] };
  assert.deepEqual(overrideJson.authorization_servers, ['https://auth.steadyrenew.com/auth/v1']);

  const unconfiguredHandler = createOAuthProtectedResourceHandler({});
  const unconfiguredRes = await unconfiguredHandler(
    new Request('https://steadyrenew.com/.well-known/oauth-protected-resource')
  );
  assert.equal(unconfiguredRes.status, 503);
});
