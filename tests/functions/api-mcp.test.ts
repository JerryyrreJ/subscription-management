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

  const unauth = await mcpHandler(
    new Request('https://steadyrenew.com/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
  );
  assert.equal(unauth.status, 401);
  assert.match(unauth.headers.get('www-authenticate') ?? '', /Bearer/);

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
