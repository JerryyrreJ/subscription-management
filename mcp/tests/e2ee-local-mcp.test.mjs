import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(here, '..', 'src', 'server.mjs');

test('local MCP server executes zero-knowledge E2EE CRUD + analytics without sending vault key or plaintext over HTTP', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const dekBytes = webcrypto.getRandomValues(new Uint8Array(32));
  const vaultKeyToken = `vk1_${Buffer.from(dekBytes).toString('base64url')}`;
  const dek = await webcrypto.subtle.importKey('raw', dekBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);

  // Create server-stored dekCheck ciphertext
  const checkNonce = webcrypto.getRandomValues(new Uint8Array(12));
  const checkAad = new TextEncoder().encode(JSON.stringify(['e2ee-dek-check', 1, userId, 1]));
  const checkCipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: checkNonce, additionalData: checkAad, tagLength: 128 },
    dek,
    new TextEncoder().encode(JSON.stringify({ purpose: 'dek-check', userId, keyEpoch: 1 }))
  );
  const dekCheck = {
    version: 1,
    nonce: Buffer.from(checkNonce).toString('base64'),
    ciphertext: Buffer.from(checkCipher).toString('base64'),
  };

  const storedCipherRows = new Map();
  const storedAudits = [];
  const observedAuthHeaders = [];
  const observedBodies = [];

  const mockServer = http.createServer(async (req, res) => {
    observedAuthHeaders.push(req.headers.authorization || '');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const bodyStr = Buffer.concat(chunks).toString('utf8');
    if (bodyStr) observedBodies.push(bodyStr);

    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/api/v1/vault/state') {
      res.end(JSON.stringify({ enabled: true, userId, account: { userId, keyEpoch: 1, dekCheck, barkMode: 'generic' } }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/vault/subscriptions') {
      const parsed = JSON.parse(bodyStr);
      const now = '2026-11-24T12:00:00.000Z';
      const row = { id: parsed.id, envelope: parsed.envelope, revision: 1, createdAt: now, updatedAt: now };
      storedCipherRows.set(row.id, row);
      if (parsed.auditEnvelope) {
        storedAudits.unshift({
          id: parsed.auditId,
          action: 'subscription.create',
          subscriptionId: row.id,
          envelope: parsed.auditEnvelope,
          createdAt: now,
        });
      }
      res.statusCode = 201;
      res.end(JSON.stringify({ data: row }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/vault/subscriptions') {
      res.end(JSON.stringify({ data: [...storedCipherRows.values()] }));
      return;
    }

    if (url.pathname.startsWith('/api/v1/vault/subscriptions/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      if (req.method === 'GET') {
        const row = storedCipherRows.get(id);
        res.statusCode = row ? 200 : 404;
        res.end(JSON.stringify(row ? { data: row } : { error: { code: 'not_found' } }));
        return;
      }
      if (req.method === 'PATCH') {
        const parsed = JSON.parse(bodyStr);
        const existing = storedCipherRows.get(id);
        const updated = { ...existing, envelope: parsed.envelope, revision: existing.revision + 1, updatedAt: '2026-11-24T12:05:00.000Z' };
        storedCipherRows.set(id, updated);
        if (parsed.auditEnvelope) {
          storedAudits.unshift({
            id: parsed.auditId,
            action: 'subscription.update',
            subscriptionId: id,
            envelope: parsed.auditEnvelope,
            createdAt: updated.updatedAt,
          });
        }
        res.end(JSON.stringify({ data: updated }));
        return;
      }
      if (req.method === 'DELETE') {
        storedCipherRows.delete(id);
        res.end(JSON.stringify({ deleted: true, id }));
        return;
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/vault/audit') {
      res.end(JSON.stringify({ data: storedAudits, pagination: { limit: 50, offset: 0, hasMore: false } }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: { code: 'not_found' } }));
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const { port } = mockServer.address();

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: {
      ...process.env,
      SUBSCRIPTION_MANAGER_BASE_URL: `http://127.0.0.1:${port}`,
      SUBSCRIPTION_MANAGER_API_KEY: 'subm_localtest.secretpart',
      SUBSCRIPTION_MANAGER_VAULT_KEY: vaultKeyToken,
    },
    stderr: 'pipe',
  });

  const client = new Client({ name: 'e2ee-test-client', version: '1.0.0' });
  try {
    await client.connect(transport);

    // 1. Create encrypted subscription locally
    const createdRes = await client.callTool({
      name: 'create_subscription',
      arguments: {
        name: 'ZeroKnowledge Cloud',
        category: 'Security',
        amount: 12.5,
        currency: 'USD',
        period: 'monthly',
        nextPaymentDate: '2026-12-20',
      },
    });
    assert.ok(!createdRes.isError);
    const createdJson = JSON.parse(createdRes.content[0].text);
    assert.equal(createdJson.data.name, 'ZeroKnowledge Cloud');

    // 2. List & decrypt locally
    const listRes = await client.callTool({ name: 'list_subscriptions', arguments: {} });
    assert.ok(!listRes.isError);
    const listJson = JSON.parse(listRes.content[0].text);
    assert.equal(listJson.data.length, 1);
    assert.equal(listJson.data[0].name, 'ZeroKnowledge Cloud');

    // 3. Spend summary computed locally
    const summaryRes = await client.callTool({ name: 'get_spend_summary', arguments: { horizonDays: 30 } });
    assert.ok(!summaryRes.isError);
    const summaryJson = JSON.parse(summaryRes.content[0].text);
    assert.equal(summaryJson.summary.counts.active, 1);
    assert.equal(summaryJson.summary.byCurrency[0].monthlyTotal, 12.5);

    // 4. Audit log decrypted locally
    const auditRes = await client.callTool({ name: 'list_audit_log', arguments: {} });
    assert.ok(!auditRes.isError);
    const auditJson = JSON.parse(auditRes.content[0].text);
    assert.equal(auditJson.data[0].metadata.after.name, 'ZeroKnowledge Cloud');

    // Verify ZERO leakage of vault key or plaintext over HTTP!
    assert.ok(observedAuthHeaders.length > 0);
    assert.ok(observedAuthHeaders.every(h => h === 'Bearer subm_localtest.secretpart'));
    assert.ok(observedBodies.every(b => !b.includes('ZeroKnowledge Cloud') && !b.includes('12.5') && !b.includes('vk1_')));
  } finally {
    await client.close();
    await new Promise(resolve => mockServer.close(resolve));
  }
});
