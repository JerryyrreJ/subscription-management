import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApiMcpHandler } from '../../netlify/functions/api-mcp.ts';
import { hashApiKey } from '../../netlify/functions/_shared/apiKeys.ts';
import { createFakeSupabaseClient, type QueryState } from './apiTestHelpers.ts';

const apiKey = 'subm_test_mcp_key';
const apiKeyId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';

const limits = {
  requestsPerMinute: 60,
  activeKeys: 5,
  failedAuthRequestsPerHour: 300,
  rateLimitRetentionHours: 48,
};

const sampleRow = {
  id: '33333333-3333-4333-8333-333333333333',
  user_id: userId,
  name: 'Claude Pro',
  category: 'AI',
  amount: 20,
  currency: 'USD',
  period: 'monthly',
  last_payment_date: '2026-01-10',
  next_payment_date: '2026-02-10',
  billing_anchor_day: 10,
  custom_date: null,
  notification_enabled: true,
  is_trial: false,
  trial_ends_on: null,
  status: 'active',
  created_at: '2026-01-10T00:00:00.000Z',
  updated_at: '2026-01-10T00:00:00.000Z',
};

const createDatabase = (options: { scopes?: string[]; isPremium?: boolean } = {}) =>
  createFakeSupabaseClient(
    (state: QueryState) => {
      if (state.table === 'api_keys' && state.operation === 'update') {
        return { data: null, error: null };
      }
      if (state.table === 'user_profiles') {
        return { data: { is_premium: options.isPremium ?? false }, error: null };
      }
      if (state.table === 'subscriptions') {
        return { data: [sampleRow], error: null };
      }
      if (state.table === 'api_audit_log') {
        return { data: [], error: null };
      }
      return { data: null, error: { message: `Unexpected query: ${state.table}` } };
    },
    (name, args) => {
      if (name === 'lookup_api_key_for_auth') {
        if (args.p_key_hash !== hashApiKey(apiKey)) {
          return {
            data: [{ limited: false, id: null, user_id: null, key_prefix: null, scopes: null }],
            error: null,
          };
        }
        return {
          data: [
            {
              limited: false,
              id: apiKeyId,
              user_id: userId,
              key_prefix: apiKey.slice(0, 14),
              scopes: options.scopes ?? ['read', 'write'],
            },
          ],
          error: null,
        };
      }
      return {
        data: [
          {
            allowed: true,
            request_count: 1,
            remaining: 59,
            reset_at: '2026-06-16T01:00:00.000Z',
          },
        ],
        error: null,
      };
    }
  );

test('remote Streamable HTTP MCP handles preflight, 405 GET, 401 invalid auth, and full Client workflow', async t => {
  const mcpHandler = createApiMcpHandler(() => ({
    database: createDatabase({ scopes: ['read'] }),
    limits,
    createRequestId: () => 'mcp-req-1',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const preflight = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', { method: 'OPTIONS' })
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');

  const getRes = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'text/event-stream' },
    })
  );
  assert.equal(getRes.status, 405);

  // Standard MCP OAuth 2.1 handshake: unauthenticated initialize and tools/call
  // return HTTP 401 with WWW-Authenticate pointing at Protected Resource Metadata
  // so ChatGPT, Claude, Cursor, and Claude Code immediately trigger OAuth login.
  const unauthInitialize = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'chatgpt-connector', version: '1.0.0' },
        },
      }),
    })
  );
  assert.equal(unauthInitialize.status, 401);
  assert.equal(
    unauthInitialize.headers.get('www-authenticate'),
    'Bearer realm="SteadyRenew MCP", resource_metadata="https://steadyrenew.com/.well-known/oauth-protected-resource"'
  );
  assert.match(unauthInitialize.headers.get('access-control-expose-headers') ?? '', /WWW-Authenticate/);

  // Unauthenticated tools/call is also rejected with HTTP 401 + resource_metadata.
  const unauthCall = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_subscriptions', arguments: {} },
      }),
    })
  );
  assert.equal(unauthCall.status, 401);
  assert.match(
    unauthCall.headers.get('www-authenticate') ?? '',
    /resource_metadata="https:\/\/steadyrenew\.com\/\.well-known\/oauth-protected-resource"/
  );

  // Mixed batch containing a tool call cannot bypass authentication.
  const unauthBatch = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_subscriptions', arguments: {} } },
      ]),
    })
  );
  assert.equal(unauthBatch.status, 401);

  // Supplying an invalid Bearer token fails fast even on tools/list.
  const invalidKeyList = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer subm_invalid_key',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
    })
  );
  assert.equal(invalidKeyList.status, 401);

  const transport = new StreamableHTTPClientTransport(
    new URL('https://steadyrenew.com/api/mcp'),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      fetch: async (input, init) => mcpHandler(new Request(input, init)),
    }
  );
  const client = new Client({ name: 'mcp-remote-test', version: '1.0.0' });
  t.after(() => client.close());

  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 11);

  for (const tool of tools) {
    const serialized = JSON.stringify(tool.inputSchema);
    assert.equal(serialized.includes('"$defs"'), false, `${tool.name} should inline all $defs`);
    assert.equal(serialized.includes('"$ref"'), false, `${tool.name} should inline all $refs`);
    assert.ok(tool.title && tool.title.length > 0, `${tool.name} should expose a human-readable title`);
    assert.equal(tool.annotations?.title, tool.title);
    assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean');
    assert.equal(typeof tool.annotations?.destructiveHint, 'boolean');
    assert.equal(tool.annotations?.openWorldHint, false);
    assert.match(tool.description ?? '', /Use when:/);
  }

  const listResult = await client.callTool({
    name: 'list_subscriptions',
    arguments: { limit: 5 },
  });
  assert.equal(listResult.isError, false);
  const listContent = listResult.content as Array<{ type: string; text: string }>;
  const listText = listContent[0].text;
  const parsedList = JSON.parse(listText) as { data: Array<{ nextPaymentDate: string }> };
  // Overdue 2026-02-10 active monthly subscription is auto-advanced relative to 2026-06-16.
  assert.equal(parsedList.data[0].nextPaymentDate, '2026-07-10');

  // Read-only key attempting a write tool receives a clean MCP tool error (403 insufficient_scope).
  const writeResult = await client.callTool({
    name: 'create_subscription',
    arguments: {
      name: 'Netflix',
      category: 'Streaming',
      amount: 15.99,
      currency: 'USD',
      period: 'monthly',
      nextPaymentDate: '2026-07-01',
    },
  });
  assert.equal(writeResult.isError, true);
  assert.match(JSON.stringify(writeResult.content), /insufficient_scope/);

  // Missing path parameter fails cleanly before hitting any route handler.
  const missingIdResult = await client.callTool({
    name: 'get_subscription',
    arguments: {},
  });
  assert.equal(missingIdResult.isError, true);
  assert.match(JSON.stringify(missingIdResult.content), /Missing required path parameter: id/);
});

test('remote MCP authenticates each HTTP request once and rejects oversized POST payloads', async () => {
  let authLookups = 0;
  const database = createFakeSupabaseClient(
    (state: QueryState) => {
      if (state.table === 'api_keys' && state.operation === 'update') {
        return { data: null, error: null };
      }
      if (state.table === 'user_profiles') {
        return { data: { is_premium: false }, error: null };
      }
      if (state.table === 'subscriptions') {
        return { data: [sampleRow], error: null };
      }
      return { data: null, error: { message: `Unexpected query: ${state.table}` } };
    },
    name => {
      if (name === 'lookup_api_key_for_auth') {
        authLookups += 1;
        return {
          data: [
            {
              limited: false,
              id: apiKeyId,
              user_id: userId,
              key_prefix: apiKey.slice(0, 14),
              scopes: ['read'],
            },
          ],
          error: null,
        };
      }
      return {
        data: [
          {
            allowed: true,
            request_count: 1,
            remaining: 59,
            reset_at: '2026-06-16T01:00:00.000Z',
          },
        ],
        error: null,
      };
    }
  );

  const mcpHandler = createApiMcpHandler(() => ({
    database,
    limits,
    createRequestId: () => 'mcp-req-single-auth',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const oversizedBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'list_subscriptions',
      arguments: { padding: 'x'.repeat(270 * 1024) },
    },
  });
  const tooLarge = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: oversizedBody,
    })
  );
  assert.equal(tooLarge.status, 413);
  assert.equal(authLookups, 0);

  const callRes = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'list_subscriptions',
          arguments: { limit: 1 },
        },
      }),
    })
  );
  assert.equal(callRes.status, 200);
  assert.equal(authLookups, 1);
});

const buildFakeJwt = (payload: Record<string, unknown>): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
};

test('remote MCP authenticates Supabase OAuth 2.1 JWTs, enforces per-client scopes, rejects web session JWTs, and records oauthClientId in audit logs', async t => {
  const oauthClientId = 'oauth-client-chatgpt';
  const validOAuthToken = buildFakeJwt({
    sub: userId,
    role: 'authenticated',
    client_id: oauthClientId,
  });
  const webSessionTokenWithoutClientId = buildFakeJwt({
    sub: userId,
    role: 'authenticated',
  });
  const revokedOAuthToken = buildFakeJwt({
    sub: userId,
    role: 'authenticated',
    client_id: 'revoked-client',
  });

  let storedClientScopes: string[] | null = ['read'];
  let scopeTouchedAt: string | null = null;
  const auditInserts: Array<Record<string, unknown>> = [];
  let recordedFailures = 0;

  const database = createFakeSupabaseClient(
    (state: QueryState) => {
      if (state.table === 'user_profiles') {
        return { data: { is_premium: true }, error: null };
      }
      if (state.table === 'oauth_client_scopes' && state.operation === 'select') {
        return {
          data: storedClientScopes ? { scopes: storedClientScopes } : null,
          error: null,
        };
      }
      if (state.table === 'oauth_client_scopes' && state.operation === 'update') {
        scopeTouchedAt = (state.payload as { last_used_at: string }).last_used_at;
        return { data: null, error: null };
      }
      if (state.table === 'subscriptions' && state.operation === 'select') {
        return { data: [sampleRow], error: null };
      }
      if (state.table === 'subscriptions' && state.operation === 'insert') {
        return {
          data: {
            ...sampleRow,
            id: '44444444-4444-4444-8444-444444444444',
            name: 'Cursor Pro',
          },
          error: null,
        };
      }
      if (state.table === 'api_audit_log' && state.operation === 'insert') {
        auditInserts.push(state.payload as Record<string, unknown>);
        return { data: null, error: null };
      }
      return { data: null, error: { message: `Unexpected query: ${state.table} (${state.operation})` } };
    },
    (name, args) => {
      if (name === 'check_or_record_api_auth_failure') {
        if (args.p_record_failure) {
          recordedFailures += 1;
        }
        return { data: recordedFailures >= 2, error: null };
      }
      return {
        data: [
          {
            allowed: true,
            request_count: 1,
            remaining: 59,
            reset_at: '2026-06-16T01:00:00.000Z',
          },
        ],
        error: null,
      };
    },
    async token => {
      if (token === validOAuthToken) {
        return { data: { user: { id: userId, email: 'user@steadyrenew.com' } }, error: null };
      }
      return { data: { user: null }, error: { message: 'Session revoked' } };
    }
  );

  const mcpHandler = createApiMcpHandler(() => ({
    database,
    limits: { ...limits, failedAuthRequestsPerHour: 2 },
    createRequestId: () => 'mcp-oauth-req',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  // Regular browser session JWTs without `client_id` cannot access /api/mcp.
  const webSessionRes = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webSessionTokenWithoutClientId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
  );
  assert.equal(webSessionRes.status, 401);
  assert.equal(recordedFailures, 0);

  // Revoked OAuth token fails with 401 and increments failure limiter; second attempt hits 429.
  const revokedRes1 = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${revokedOAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
  );
  assert.equal(revokedRes1.status, 401);
  assert.equal(recordedFailures, 1);

  const revokedRes2 = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${revokedOAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
  );
  assert.equal(revokedRes2.status, 429);

  // Reset failure counter for valid OAuth client session tests.
  recordedFailures = 0;

  const oauthTransport = new StreamableHTTPClientTransport(
    new URL('https://steadyrenew.com/api/mcp'),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${validOAuthToken}`,
        },
      },
      fetch: async (input, init) => mcpHandler(new Request(input, init)),
    }
  );
  const oauthClient = new Client({ name: 'chatgpt-mcp', version: '1.0.0' });
  t.after(() => oauthClient.close());
  await oauthClient.connect(oauthTransport);

  const readList = await oauthClient.callTool({ name: 'list_subscriptions', arguments: { limit: 1 } });
  assert.equal(readList.isError, false);
  assert.equal(scopeTouchedAt, '2026-06-16T00:15:00.000Z');

  // Read-only OAuth grant cannot create subscriptions.
  const deniedWrite = await oauthClient.callTool({
    name: 'create_subscription',
    arguments: {
      name: 'Cursor Pro',
      category: 'AI',
      amount: 20,
      currency: 'USD',
      period: 'monthly',
      nextPaymentDate: '2026-07-01',
    },
  });
  assert.equal(deniedWrite.isError, true);
  assert.match(JSON.stringify(deniedWrite.content), /insufficient_scope/);

  // Upgrading the grant to Read & Write in oauth_client_scopes takes effect immediately
  // without re-issuing the OAuth token, and records oauthClientId in api_audit_log.
  storedClientScopes = ['read', 'write'];
  const allowedWrite = await oauthClient.callTool({
    name: 'create_subscription',
    arguments: {
      name: 'Cursor Pro',
      category: 'AI',
      amount: 20,
      currency: 'USD',
      period: 'monthly',
      nextPaymentDate: '2026-07-01',
    },
  });
  assert.equal(allowedWrite.isError, false);
  assert.equal(auditInserts.length, 1);
  assert.equal(auditInserts[0].api_key_id, null);
  assert.equal((auditInserts[0].metadata as { oauthClientId?: string })?.oauthClientId, oauthClientId);

  // Fail-closed: deleting/missing oauth_client_scopes must reject the OAuth token instead of
  // falling back to read-only access.
  storedClientScopes = null;
  const missingScopeRes = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validOAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }),
    })
  );
  assert.equal(missingScopeRes.status, 403);
  assert.match(await missingScopeRes.text(), /insufficient_scope/);
  assert.match(missingScopeRes.headers.get('www-authenticate') ?? '', /error="insufficient_scope"/);
});

test('remote MCP fails closed with 503 when oauth_client_scopes table is unavailable', async () => {
  const validOAuthToken = buildFakeJwt({
    sub: userId,
    role: 'authenticated',
    client_id: 'oauth-client-missing-table',
  });

  const database = createFakeSupabaseClient(
    (state: QueryState) => {
      if (state.table === 'user_profiles') {
        return { data: { is_premium: true }, error: null };
      }
      if (state.table === 'oauth_client_scopes' && state.operation === 'select') {
        return {
          data: null,
          error: { code: 'PGRST205', message: 'Could not find the table public.oauth_client_scopes' },
        };
      }
      return { data: null, error: { message: `Unexpected query: ${state.table}` } };
    },
    name => {
      if (name === 'check_or_record_api_auth_failure') {
        return { data: false, error: null };
      }
      return { data: null, error: null };
    },
    async () => ({ data: { user: { id: userId, email: 'user@steadyrenew.com' } }, error: null })
  );

  const mcpHandler = createApiMcpHandler(() => ({
    database,
    limits,
    createRequestId: () => 'mcp-oauth-missing-table',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const res = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validOAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
  );
  assert.equal(res.status, 503);
  assert.match(await res.text(), /oauth_scope_unavailable/);
});
