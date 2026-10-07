import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('downloaded package installs independently and proxies CRUD through real MCP stdio', { timeout: 90_000 }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'installed-subscription-mcp-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const archive = fileURLToPath(new URL('../../dist/downloads/subscription-manager-mcp.tgz', import.meta.url));
  execFileSync('npm', ['install', '--prefix', directory, '--ignore-scripts', '--no-audit', '--no-fund', archive], { stdio: 'pipe', timeout: 60_000 });
  const installed = join(directory, 'node_modules/subscription-manager-mcp');
  const schema = JSON.parse(readFileSync(join(installed, 'schema/ai-tools.json'), 'utf8'));
  const canonical = JSON.parse(readFileSync(new URL('../../docs-site/api/ai-tools.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema, canonical, 'the deployed package carries the canonical tool definitions');

  const requests = [];
  let failure = '';
  const api = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : undefined });
    if (failure === 'html') {
      res.setHeader('content-type', 'text/html');
      return res.end('<html>SPA fallback</html>');
    }
    if (failure === 'redirect') {
      res.writeHead(302, { location: '/credential-leak' });
      return res.end();
    }
    res.setHeader('content-type', 'application/json');
    if (failure) {
      res.statusCode = Number(failure);
      return res.end(JSON.stringify({ error: { code: failure === '403' ? 'insufficient_scope' : failure === '429' ? 'rate_limit_exceeded' : 'invalid_api_key' } }));
    }
    res.end(JSON.stringify({ data: [], pagination: { limit: 1, offset: 0, hasMore: false } }));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => api.close(resolve)));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(installed, 'src/server.mjs')],
    cwd: directory,
    env: {
      SUBSCRIPTION_MANAGER_BASE_URL: `http://127.0.0.1:${api.address().port}`,
      SUBSCRIPTION_MANAGER_API_KEY: 'subm_test.private-test-key',
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'package-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), schema.tools.map(tool => tool.name));
  assert.equal(tools.find(tool => tool.name === 'list_subscriptions').annotations.readOnlyHint, true);
  for (const name of ['update_subscription', 'update_notification_settings', 'delete_subscription']) {
    assert.equal(tools.find(tool => tool.name === name).annotations.destructiveHint, true, `${name} can overwrite or remove existing data`);
  }
  const id = '11111111-1111-4111-8111-111111111111';
  const subscription = { name: 'Example', amount: 12, currency: 'USD', period: 'monthly', category: 'Tools', nextPaymentDate: '2026-11-07' };
  const cases = [
    ['list_subscriptions', { limit: 1, q: 'A & B' }, 'GET', '/api/v1/subscriptions?limit=1&q=A+%26+B', undefined],
    ['create_subscription', subscription, 'POST', '/api/v1/subscriptions', subscription],
    ['get_subscription', { id }, 'GET', `/api/v1/subscriptions/${id}`, undefined],
    ['update_subscription', { id, patch: { amount: 24 } }, 'PATCH', `/api/v1/subscriptions/${id}`, { amount: 24 }],
    ['delete_subscription', { id }, 'DELETE', `/api/v1/subscriptions/${id}`, undefined],
  ];
  for (const [name, args, method, url, body] of cases) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, false, name);
    assert.deepEqual(requests.at(-1), { method, url, body, authorization: 'Bearer subm_test.private-test-key' });
  }
  for (const status of ['401', '403', '429', 'html', 'redirect']) {
    failure = status;
    const count = requests.length;
    const result = await client.callTool({ name: 'list_subscriptions', arguments: { limit: 1 } });
    assert.equal(result.isError, true, status);
    assert.equal(requests.length, count + 1, 'errors are not retried; redirects are not followed');
    assert.ok(!JSON.stringify(result).includes('private-test-key'));
  }
});
