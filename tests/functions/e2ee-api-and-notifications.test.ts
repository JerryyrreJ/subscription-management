import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type https from 'node:https';
import type { LookupAddress } from 'node:dns';
import { generateApiKeyMaterial, hashApiKey } from '../../netlify/functions/_shared/apiKeys.ts';
import { createSubscriptionsApiHandler } from '../../netlify/functions/api-v1-subscriptions.ts';
import { createAnalyticsApiHandler } from '../../netlify/functions/api-v1-analytics.ts';
import { createAuditApiHandler } from '../../netlify/functions/api-v1-audit.ts';
import { createVaultApiHandler } from '../../netlify/functions/api-v1-vault.ts';
import { createApiMcpHandler } from '../../netlify/functions/api-mcp.ts';
import {
  createScheduledNotificationsHandler,
  createServerBarkCiphertextSender,
} from '../../netlify/functions/send-scheduled-notifications.ts';
import type { HttpsRequestFn } from '../../netlify/functions/_shared/barkServerPush.ts';
import { createFakeSupabaseClient, type QueryState } from './apiTestHelpers.ts';
import {
  computeSubscriptionPushHash,
  createDekCheck,
  decryptBarkPushPayload,
  encodeVaultKeyToken,
  encryptAuditPayload,
  encryptBarkPushPayload,
  encryptSubscriptionPayload,
  generateBarkEncryptionKey,
  generateDekBytes,
  importDek,
  type Envelope,
} from '../../src/lib/e2ee/crypto.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const API_KEY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LIMITS = {
  activeKeys: 5,
  freeActiveKeys: 2,
  premiumActiveKeys: 5,
  requestsPerMinute: 60,
  failedAuthRequestsPerHour: 20,
  rateLimitRetentionHours: 24,
};

test('split-key E2EE bridge keeps vault key out of DB hash and executes full CRUD + analytics + audit with zero DB plaintext', async () => {
  const { apiKey, keyPrefix } = generateApiKeyMaterial();
  const expectedServerKeyHash = hashApiKey(apiKey);

  const dekBytes = generateDekBytes();
  const dek = await importDek(dekBytes);
  const dekCheck = await createDekCheck(dek, USER_ID, 1);
  const vaultToken = encodeVaultKeyToken(dekBytes);
  const splitBridgeBearer = `${apiKey}.${vaultToken}`;

  const encryptedSubs = new Map<string, { id: string; user_id: string; envelope: Envelope; revision: number; created_at: string; updated_at: string }>();
  const encryptedAudits: Array<{ id: string; user_id: string; api_key_id: string | null; action: string; subscription_id: string | null; request_id: string | null; envelope: Envelope; created_at: string }> = [];
  const observedAuthKeyHashes: string[] = [];

  const database = createFakeSupabaseClient(
    (state: QueryState) => {
      if (state.table === 'user_profiles') {
        return { data: { is_premium: true }, error: null };
      }
      if (state.table === 'api_keys' && state.operation === 'update') {
        return { data: null, error: null };
      }
      if (state.table === 'e2ee_accounts' && state.operation === 'select') {
        return {
          data: {
            user_id: USER_ID,
            key_epoch: 1,
            dek_check: dekCheck,
            bark_mode: 'generic',
          },
          error: null,
        };
      }
      if (state.table === 'user_notification_settings') {
        return { data: null, error: null };
      }
      if (state.table === 'encrypted_push_schedules') {
        return { data: [], error: null };
      }
      if (state.table === 'encrypted_subscriptions') {
        if (state.operation === 'insert') {
          const payload = state.payload as { id: string; user_id: string; envelope: Envelope };
          // Assert no plaintext leaked into DB payload
          const serialized = JSON.stringify(payload);
          assert.equal(serialized.includes('Cursor Pro'), false);
          const nowIso = '2026-11-24T10:00:00.000Z';
          const row = { ...payload, revision: 1, created_at: nowIso, updated_at: nowIso };
          encryptedSubs.set(row.id, row);
          return { data: row, error: null };
        }
        if (state.operation === 'select') {
          const filterId = state.filters.id;
          if (filterId !== undefined) {
            return { data: encryptedSubs.get(String(filterId)) ?? null, error: null };
          }
          return { data: [...encryptedSubs.values()], error: null };
        }
        if (state.operation === 'update') {
          const id = String(state.filters.id ?? '');
          const existing = encryptedSubs.get(id);
          if (!existing) return { data: null, error: null };
          const updated = {
            ...existing,
            envelope: (state.payload as { envelope: Envelope }).envelope,
            revision: existing.revision + 1,
            updated_at: '2026-11-24T10:05:00.000Z',
          };
          assert.equal(JSON.stringify(updated).includes('Cursor Business'), false);
          encryptedSubs.set(id, updated);
          return { data: updated, error: null };
        }
        if (state.operation === 'delete') {
          encryptedSubs.delete(String(state.filters.id ?? ''));
          return { data: null, error: null };
        }
      }
      if (state.table === 'encrypted_api_audit_log') {
        if (state.operation === 'insert') {
          const row = state.payload as (typeof encryptedAudits)[number];
          assert.equal(JSON.stringify(row).includes('Cursor'), false);
          encryptedAudits.unshift(row);
          return { data: row, error: null };
        }
        if (state.operation === 'select') {
          return { data: [...encryptedAudits], error: null };
        }
      }
      return { data: null, error: { message: `Unexpected table: ${state.table} ${state.operation}` } };
    },
    (rpcName, args) => {
      if (rpcName === 'lookup_api_key_for_auth') {
        observedAuthKeyHashes.push(String(args.p_key_hash));
        if (args.p_key_hash === expectedServerKeyHash) {
          return {
            data: [
              {
                limited: false,
                id: API_KEY_ID,
                user_id: USER_ID,
                key_prefix: keyPrefix,
                scopes: ['read', 'write'],
              },
            ],
            error: null,
          };
        }
        return { data: [{ limited: false, id: null, user_id: null, key_prefix: null, scopes: null }], error: null };
      }
      if (rpcName === 'consume_api_user_minute_limit') {
        return {
          data: [{ allowed: true, request_count: 1, remaining: 59, reset_at: '2026-11-24T11:00:00.000Z' }],
          error: null,
        };
      }
      return { data: null, error: { message: `Unexpected RPC: ${rpcName}` } };
    }
  );

  const deps = () => ({
    database,
    limits: LIMITS,
    createRequestId: () => 'req-e2ee-1',
    now: () => new Date('2026-11-24T10:00:00.000Z'),
  });

  const subsHandler = createSubscriptionsApiHandler(deps);
  const analyticsHandler = createAnalyticsApiHandler(deps);
  const auditHandler = createAuditApiHandler(deps);
  const vaultHandler = createVaultApiHandler(deps);

  // 1. Calling /api/v1/subscriptions WITHOUT vault key returns 403 e2ee_vault_key_required
  const blockedRes = await subsHandler(
    {
      httpMethod: 'GET',
      path: '/api/v1/subscriptions',
      headers: { Authorization: `Bearer ${apiKey}` },
      queryStringParameters: {},
      body: null,
    } as never,
    {} as never
  );
  assert.equal(blockedRes?.statusCode, 403);
  assert.match(blockedRes?.body ?? '', /e2ee_vault_key_required/);

  // 2. Calling /api/v1/vault/state WITH auth-only key succeeds (for local zero-knowledge MCP)
  const stateRes = await vaultHandler(
    {
      httpMethod: 'GET',
      path: '/api/v1/vault/state',
      headers: { Authorization: `Bearer ${apiKey}` },
      queryStringParameters: {},
      body: null,
    } as never,
    {} as never
  );
  assert.equal(stateRes?.statusCode, 200);
  assert.equal(JSON.parse(stateRes?.body ?? '{}').enabled, true);

  // 3. Create subscription via split bridge key `subm_...vk1_...`
  const createRes = await subsHandler(
    {
      httpMethod: 'POST',
      path: '/api/v1/subscriptions',
      headers: {
        Authorization: `Bearer ${splitBridgeBearer}`,
        'Content-Type': 'application/json',
      },
      queryStringParameters: {},
      body: JSON.stringify({
        name: 'Cursor Pro',
        category: 'Developer Tools',
        amount: 20,
        currency: 'USD',
        period: 'monthly',
        nextPaymentDate: '2026-12-15',
      }),
    } as never,
    {} as never
  );
  assert.equal(createRes?.statusCode, 201);
  // Every auth lookup hashed ONLY `apiKey`, never the `.vk1_...` suffix
  assert.ok(observedAuthKeyHashes.every(h => h === expectedServerKeyHash));

  const created = JSON.parse(createRes?.body ?? '{}').data;
  assert.equal(created.name, 'Cursor Pro');
  assert.equal(encryptedSubs.size, 1);

  // 4. Patch subscription via split bridge key
  const patchRes = await subsHandler(
    {
      httpMethod: 'PATCH',
      path: `/api/v1/subscriptions/${created.id}`,
      headers: {
        Authorization: `Bearer ${splitBridgeBearer}`,
        'Content-Type': 'application/json',
      },
      queryStringParameters: {},
      body: JSON.stringify({ name: 'Cursor Business', amount: 40 }),
    } as never,
    {} as never
  );
  assert.equal(patchRes?.statusCode, 200);
  assert.equal(JSON.parse(patchRes?.body ?? '{}').data.name, 'Cursor Business');

  // 5. Analytics summary works seamlessly over encrypted subscriptions
  const summaryRes = await analyticsHandler(
    {
      httpMethod: 'GET',
      path: '/api/v1/analytics/summary',
      headers: { Authorization: `Bearer ${splitBridgeBearer}` },
      queryStringParameters: { horizonDays: '30' },
      body: null,
    } as never,
    {} as never
  );
  assert.equal(summaryRes?.statusCode, 200);
  const summaryBody = JSON.parse(summaryRes?.body ?? '{}');
  assert.equal(summaryBody.summary.counts.active, 1);

  // 6. Audit log decrypts encrypted_api_audit_log cleanly
  const auditRes = await auditHandler(
    {
      httpMethod: 'GET',
      path: '/api/v1/audit',
      headers: { Authorization: `Bearer ${splitBridgeBearer}` },
      queryStringParameters: {},
      body: null,
    } as never,
    {} as never
  );
  assert.equal(auditRes?.statusCode, 200);
  const auditItems = JSON.parse(auditRes?.body ?? '{}').data;
  assert.equal(auditItems.length, 2);
  assert.equal(auditItems[0].action, 'subscription.update');
  assert.equal(auditItems[0].metadata.after.name, 'Cursor Business');
});

test('send-scheduled-notifications dispatches Bark native ciphertext schedules without reading subscription plaintext', async () => {
  const barkKey = generateBarkEncryptionKey();
  const sealed = await encryptBarkPushPayload(barkKey, {
    title: 'Netflix 将于 3 天后续费',
    body: '$15.99 / 月',
    sound: 'bell',
  });

  const dispatchedCiphertexts: Array<{ ciphertext: string; iv: string }> = [];
  let markedDispatched = false;

  const supabase = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_notification_settings' && state.operation === 'select') {
      return {
        data: [
          {
            user_id: USER_ID,
            bark_enabled: true,
            time_zone: 'UTC',
            locale: 'zh-CN',
            bark_server_url: 'https://api.day.app',
            bark_device_key: 'deviceKey123456',
            bark_days_before: 3,
            bark_history: {},
          },
        ],
        error: null,
      };
    }
    if (state.table === 'subscriptions' && state.operation === 'select') {
      // Encrypted account has 0 rows in plaintext `subscriptions`
      return { data: [], error: null };
    }
    if (state.table === 'e2ee_accounts' && state.operation === 'select') {
      return { data: { bark_mode: 'bark_e2ee' }, error: null };
    }
    if (state.table === 'encrypted_push_schedules' && state.operation === 'select') {
      return {
        data: [
          {
            id: 'sched-1',
            user_id: USER_ID,
            subscription_hash: 'a'.repeat(64),
            trigger_date: formatTodayUtc(),
            payload_mode: 'bark_ciphertext',
            bark_ciphertext: sealed.ciphertext,
            bark_iv: sealed.iv,
            dispatched_at: null,
          },
        ],
        error: null,
      };
    }
    if (state.table === 'encrypted_push_schedules' && state.operation === 'update') {
      markedDispatched = Boolean((state.payload as { dispatched_at?: string | null }).dispatched_at);
      return { data: { id: 'sched-1' }, error: null };
    }
    return { data: null, error: { message: `Unexpected query: ${state.table} ${state.operation}` } };
  });

  const handler = createScheduledNotificationsHandler({
    createSupabase: () => supabase,
    sendCiphertextNotification: async (_serverUrl, _deviceKey, ciphertext, iv) => {
      dispatchedCiphertexts.push({ ciphertext, iv });
      return true;
    },
  });

  const response = await handler(new Request('https://steadyrenew.com/.netlify/functions/send-scheduled-notifications'));
  assert.equal(response.status, 200);
  assert.equal(dispatchedCiphertexts.length, 1);
  assert.equal(markedDispatched, true);

  // Verify the iPhone Bark app decrypts the exact message from the blind-forwarded payload
  const onPhone = await decryptBarkPushPayload(
    barkKey,
    dispatchedCiphertexts[0].ciphertext,
    dispatchedCiphertexts[0].iv
  );
  assert.equal(onPhone.title, 'Netflix 将于 3 天后续费');
});

function formatTodayUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

test('createServerBarkCiphertextSender pins validated public IP to prevent DNS rebinding on encrypted POST pushes', async () => {
  let dnsCalls = 0;
  const rebindingDns = async () => {
    dnsCalls += 1;
    return dnsCalls === 1
      ? [{ address: '104.26.10.228' }]
      : [{ address: '169.254.169.254' }];
  };

  const captured: Array<{
    url: URL;
    options: https.RequestOptions;
    body: string;
  }> = [];

  const mockRequest = ((
    url: string | URL,
    options: https.RequestOptions,
    callback?: (res: unknown) => void
  ) => {
    const req = new EventEmitter() as EventEmitter & {
      write: (chunk: Buffer | string) => boolean;
      end: () => void;
      destroy: (err?: Error) => void;
    };
    let body = '';
    req.write = (chunk: Buffer | string) => {
      body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      return true;
    };
    req.destroy = () => {};
    req.end = () => {
      captured.push({ url: url instanceof URL ? url : new URL(url), options, body });
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        statusMessage: string;
        resume: () => void;
        destroy: () => void;
      };
      res.statusCode = 200;
      res.statusMessage = 'OK';
      res.resume = () => {};
      res.destroy = () => {};
      queueMicrotask(() => {
        callback?.(res);
        res.emit('data', Buffer.from(JSON.stringify({ code: 200, message: 'success' }), 'utf8'));
        res.emit('end');
      });
    };
    return req;
  }) as unknown as HttpsRequestFn;

  const sender = createServerBarkCiphertextSender(rebindingDns, undefined, mockRequest);
  const ok = await sender(
    'https://rebind-bark.example.org:8443',
    'deviceKey123456',
    'Y2lwaGVydGV4dA==',
    '1234567890abcdef'
  );

  assert.equal(ok, true);
  assert.equal(dnsCalls, 1);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].options.method, 'POST');
  assert.equal(captured[0].options.agent, false);
  assert.equal(captured[0].options.rejectUnauthorized, true);
  assert.equal(captured[0].options.servername, 'rebind-bark.example.org');
  assert.match(captured[0].body, /ciphertext=Y2lwaGVydGV4dA%3D%3D/);
  assert.match(captured[0].body, /iv=1234567890abcdef/);

  const pinnedLookup = captured[0].options.lookup!;
  const allLookup = await new Promise<LookupAddress[]>((resolve, reject) => {
    pinnedLookup('rebind-bark.example.org', { all: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses as LookupAddress[]);
    });
  });
  assert.deepEqual(allLookup, [{ address: '104.26.10.228', family: 4 }]);
  assert.equal(dnsCalls, 1);

  // Blocked privileged ports and private DNS records must never reach https.request.
  const blockedPort = await sender(
    'https://api.day.app:22',
    'deviceKey123456',
    'Y2lwaGVydGV4dA==',
    '1234567890abcdef'
  );
  assert.equal(blockedPort, false);
  assert.equal(captured.length, 1);

  const privateSender = createServerBarkCiphertextSender(
    async () => [{ address: '127.0.0.1' }],
    undefined,
    mockRequest
  );
  const blockedPrivate = await privateSender(
    'https://evil.example.org',
    'deviceKey123456',
    'Y2lwaGVydGV4dA==',
    '1234567890abcdef'
  );
  assert.equal(blockedPrivate, false);
  assert.equal(captured.length, 1);
});

test('send-scheduled-notifications skips encrypted schedules when bark_mode is off or claim returns 0 rows', async () => {
  let sentCount = 0;

  // Case 1: bark_mode === 'off' must skip before dispatching
  const offDb = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_notification_settings' && state.operation === 'select') {
      return {
        data: [
          {
            user_id: USER_ID,
            bark_enabled: true,
            time_zone: 'UTC',
            locale: 'en',
            bark_server_url: 'https://api.day.app',
            bark_device_key: 'deviceKey123456',
            bark_days_before: 3,
            bark_history: {},
          },
        ],
        error: null,
      };
    }
    if (state.table === 'subscriptions' && state.operation === 'select') {
      return { data: [], error: null };
    }
    if (state.table === 'e2ee_accounts' && state.operation === 'select') {
      return { data: { bark_mode: 'off' }, error: null };
    }
    return { data: null, error: { message: `Should not query ${state.table}` } };
  });

  const offHandler = createScheduledNotificationsHandler({
    createSupabase: () => offDb,
    sendNotification: async () => {
      sentCount += 1;
      return true;
    },
  });
  const offRes = await offHandler(new Request('https://steadyrenew.com/.netlify/functions/send-scheduled-notifications'));
  assert.equal(offRes.status, 200);
  assert.equal(sentCount, 0);

  // Case 2: concurrent worker already claimed row (update returns null) -> skip dispatch
  const raceDb = createFakeSupabaseClient((state: QueryState) => {
    if (state.table === 'user_notification_settings' && state.operation === 'select') {
      return {
        data: [
          {
            user_id: USER_ID,
            bark_enabled: true,
            time_zone: 'UTC',
            locale: 'en',
            bark_server_url: 'https://api.day.app',
            bark_device_key: 'deviceKey123456',
            bark_days_before: 3,
            bark_history: {},
          },
        ],
        error: null,
      };
    }
    if (state.table === 'subscriptions' && state.operation === 'select') {
      return { data: [], error: null };
    }
    if (state.table === 'e2ee_accounts' && state.operation === 'select') {
      return { data: { bark_mode: 'generic' }, error: null };
    }
    if (state.table === 'encrypted_push_schedules' && state.operation === 'select') {
      return {
        data: [
          {
            id: 'sched-race',
            user_id: USER_ID,
            subscription_hash: 'b'.repeat(64),
            trigger_date: formatTodayUtc(),
            payload_mode: 'generic',
            bark_ciphertext: null,
            bark_iv: null,
            dispatched_at: null,
          },
        ],
        error: null,
      };
    }
    if (state.table === 'encrypted_push_schedules' && state.operation === 'update') {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });

  const raceHandler = createScheduledNotificationsHandler({
    createSupabase: () => raceDb,
    sendNotification: async () => {
      sentCount += 1;
      return true;
    },
  });
  const raceRes = await raceHandler(new Request('https://steadyrenew.com/.netlify/functions/send-scheduled-notifications'));
  assert.equal(raceRes.status, 200);
  assert.equal(sentCount, 0);
});

test('/api/v1/vault/* enforces mandatory audits, 400/413 validation, hash binding, non-existent DELETE 404, and preserves schedules when omitted', async () => {
  const { apiKey, keyPrefix } = generateApiKeyMaterial();
  const expectedKeyHash = hashApiKey(apiKey);
  const dekBytes = generateDekBytes();
  const dek = await importDek(dekBytes);
  const dekCheck = await createDekCheck(dek, USER_ID, 1);

  const subId = '77777777-7777-4777-8777-777777777777';
  const subHash = await computeSubscriptionPushHash(dekBytes, subId);
  const otherHash = await computeSubscriptionPushHash(dekBytes, '88888888-8888-4888-8888-888888888888');
  const subEnv = await encryptSubscriptionPayload(dek, USER_ID, subId, {
    name: 'Vault Test',
    category: 'Other',
    amount: 9,
    currency: 'USD',
    period: 'monthly',
    lastPaymentDate: '2026-11-01',
    nextPaymentDate: '2026-12-01',
    notificationEnabled: true,
    status: 'active',
  }, 1);
  const auditEnv = await encryptAuditPayload(dek, USER_ID, '99999999-9999-4999-8999-999999999999', { ok: true }, 1);

  const subs = new Map<string, { id: string; user_id: string; envelope: Envelope; subscription_hash: string | null; revision: number; created_at: string; updated_at: string }>();
  let scheduleDeletes = 0;
  const auditRows: Array<Record<string, unknown>> = [];

  const database = createFakeSupabaseClient(
    (state: QueryState) => {
      if (state.table === 'user_profiles') return { data: { is_premium: true }, error: null };
      if (state.table === 'api_keys' && state.operation === 'update') return { data: null, error: null };
      if (state.table === 'e2ee_accounts') {
        return { data: { user_id: USER_ID, key_epoch: 1, dek_check: dekCheck, bark_mode: 'generic' }, error: null };
      }
      if (state.table === 'encrypted_subscriptions') {
        if (state.operation === 'insert') {
          const p = state.payload as { id: string; user_id: string; envelope: Envelope; subscription_hash?: string | null };
          const row = {
            id: p.id,
            user_id: p.user_id,
            envelope: p.envelope,
            subscription_hash: p.subscription_hash ?? null,
            revision: 1,
            created_at: '2026-11-25T00:00:00.000Z',
            updated_at: '2026-11-25T00:00:00.000Z',
          };
          subs.set(row.id, row);
          return { data: row, error: null };
        }
        if (state.operation === 'select') {
          const id = state.filters.id ? String(state.filters.id) : null;
          return { data: id ? (subs.get(id) ?? null) : [...subs.values()], error: null };
        }
        if (state.operation === 'update') {
          const id = String(state.filters.id ?? '');
          const existing = subs.get(id);
          if (!existing) return { data: null, error: null };
          const updated = { ...existing, ...(state.payload as Record<string, unknown>), revision: existing.revision + 1 };
          subs.set(id, updated as typeof existing);
          return { data: updated, error: null };
        }
        if (state.operation === 'delete') {
          const id = String(state.filters.id ?? '');
          const existed = subs.delete(id);
          return { data: existed ? { id } : null, error: null };
        }
      }
      if (state.table === 'encrypted_push_schedules') {
        if (state.operation === 'delete') {
          scheduleDeletes += 1;
          return { data: null, error: null };
        }
        return { data: [], error: null };
      }
      if (state.table === 'encrypted_api_audit_log' && state.operation === 'insert') {
        auditRows.push(state.payload as Record<string, unknown>);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
    (rpcName, args) => {
      if (rpcName === 'lookup_api_key_for_auth' && args.p_key_hash === expectedKeyHash) {
        return { data: [{ limited: false, id: API_KEY_ID, user_id: USER_ID, key_prefix: keyPrefix, scopes: ['read', 'write'] }], error: null };
      }
      if (rpcName === 'consume_api_user_minute_limit') {
        return { data: [{ allowed: true, request_count: 1, remaining: 59, reset_at: '2026-11-25T01:00:00.000Z' }], error: null };
      }
      return { data: null, error: null };
    }
  );

  const vaultHandler = createVaultApiHandler(() => ({
    database,
    limits: LIMITS,
    createRequestId: () => 'req-vault-hardening',
    now: () => new Date('2026-11-25T00:00:00.000Z'),
  }));

  // 1. Malformed JSON -> 400 (not 500)
  const badJsonRes = await vaultHandler(
    { httpMethod: 'POST', path: '/api/v1/vault/subscriptions', headers: { Authorization: `Bearer ${apiKey}` }, queryStringParameters: {}, body: '{broken' } as never,
    {} as never
  );
  assert.equal(badJsonRes?.statusCode, 400);

  // 2. Oversized payload > 256KB -> 413
  const hugeRes = await vaultHandler(
    { httpMethod: 'POST', path: '/api/v1/vault/subscriptions', headers: { Authorization: `Bearer ${apiKey}` }, queryStringParameters: {}, body: 'x'.repeat(260 * 1024) } as never,
    {} as never
  );
  assert.equal(hugeRes?.statusCode, 413);

  // 3. Invalid audit subscriptionId UUID -> 400
  const badAuditQuery = await vaultHandler(
    { httpMethod: 'GET', path: '/api/v1/vault/audit', headers: { Authorization: `Bearer ${apiKey}` }, queryStringParameters: { subscriptionId: 'not-a-uuid' }, body: null } as never,
    {} as never
  );
  assert.equal(badAuditQuery?.statusCode, 400);

  // 4. Missing auditEnvelope on POST -> 400 (cannot bypass audit log)
  const missingAuditRes = await vaultHandler(
    { httpMethod: 'POST', path: '/api/v1/vault/subscriptions', headers: { Authorization: `Bearer ${apiKey}` }, queryStringParameters: {}, body: JSON.stringify({ id: subId, envelope: subEnv }) } as never,
    {} as never
  );
  assert.equal(missingAuditRes?.statusCode, 400);

  // 5. Valid POST binds subscriptionHash and writes audit without wiping schedules
  const createRes = await vaultHandler(
    {
      httpMethod: 'POST',
      path: '/api/v1/vault/subscriptions',
      headers: { Authorization: `Bearer ${apiKey}` },
      queryStringParameters: {},
      body: JSON.stringify({ id: subId, envelope: subEnv, auditEnvelope: auditEnv, subscriptionHash: subHash }),
    } as never,
    {} as never
  );
  assert.equal(createRes?.statusCode, 201);
  assert.equal(scheduleDeletes, 0);
  assert.equal(auditRows.length, 1);

  // 6. PATCH with another subscription's subscriptionHash is blocked (400 subscription_hash_mismatch)
  const badHashPatch = await vaultHandler(
    {
      httpMethod: 'PATCH',
      path: `/api/v1/vault/subscriptions/${subId}`,
      headers: { Authorization: `Bearer ${apiKey}` },
      queryStringParameters: {},
      body: JSON.stringify({ envelope: subEnv, auditEnvelope: auditEnv, subscriptionHash: otherHash }),
    } as never,
    {} as never
  );
  assert.equal(badHashPatch?.statusCode, 400);
  assert.match(badHashPatch?.body ?? '', /subscription_hash_mismatch/);

  // 7. PATCH omitting pushSchedules preserves existing schedules (scheduleDeletes stays 0)
  const safePatch = await vaultHandler(
    {
      httpMethod: 'PATCH',
      path: `/api/v1/vault/subscriptions/${subId}`,
      headers: { Authorization: `Bearer ${apiKey}` },
      queryStringParameters: {},
      body: JSON.stringify({ envelope: subEnv, auditEnvelope: auditEnv, subscriptionHash: subHash }),
    } as never,
    {} as never
  );
  assert.equal(safePatch?.statusCode, 200);
  assert.equal(scheduleDeletes, 0);

  // 8. DELETE on non-existent subscription returns 404 and does not write audit
  const missingDelete = await vaultHandler(
    {
      httpMethod: 'DELETE',
      path: '/api/v1/vault/subscriptions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      headers: { Authorization: `Bearer ${apiKey}` },
      queryStringParameters: {},
      body: JSON.stringify({ auditEnvelope: auditEnv }),
    } as never,
    {} as never
  );
  assert.equal(missingDelete?.statusCode, 404);
  assert.equal(auditRows.length, 2);
});

test('E2EE bridge rate-limits invalid vk1_ tokens before DB/crypto checks and CORS allows X-SteadyRenew-Vault-Key', async () => {
  const { apiKey, keyPrefix } = generateApiKeyMaterial();
  const expectedKeyHash = hashApiKey(apiKey);
  let rateLimitCalls = 0;
  let e2eeAccountQueries = 0;

  const database = createFakeSupabaseClient(
    (state: QueryState) => {
      if (state.table === 'user_profiles') return { data: { is_premium: true }, error: null };
      if (state.table === 'api_keys' && state.operation === 'update') return { data: null, error: null };
      if (state.table === 'e2ee_accounts') {
        e2eeAccountQueries += 1;
        return { data: { user_id: USER_ID, key_epoch: 1, dek_check: { version: 1, nonce: 'AAAAAAAAAAAAAAAA', ciphertext: 'A'.repeat(32) }, bark_mode: 'generic' }, error: null };
      }
      return { data: [], error: null };
    },
    (rpcName, args) => {
      if (rpcName === 'lookup_api_key_for_auth' && args.p_key_hash === expectedKeyHash) {
        return { data: [{ limited: false, id: API_KEY_ID, user_id: USER_ID, key_prefix: keyPrefix, scopes: ['read', 'write'] }], error: null };
      }
      if (rpcName === 'consume_api_user_minute_limit') {
        rateLimitCalls += 1;
        return {
          data: [{ allowed: rateLimitCalls === 1, request_count: rateLimitCalls, remaining: Math.max(0, 1 - rateLimitCalls), reset_at: '2026-11-25T01:00:00.000Z' }],
          error: null,
        };
      }
      return { data: null, error: null };
    }
  );

  const deps = () => ({
    database,
    limits: LIMITS,
    createRequestId: () => 'req-rate-limit-vk1',
    now: () => new Date('2026-11-25T00:00:00.000Z'),
  });

  const subsHandler = createSubscriptionsApiHandler(deps);
  const analyticsHandler = createAnalyticsApiHandler(deps);
  const auditHandler = createAuditApiHandler(deps);
  const mcpHandler = createApiMcpHandler(deps);

  // First invalid vk1_ call consumes quota and returns 401 with X-RateLimit headers
  const res1 = await subsHandler(
    {
      httpMethod: 'GET',
      path: '/api/v1/subscriptions',
      headers: { Authorization: `Bearer ${apiKey}.vk1_invalid` },
      queryStringParameters: {},
      body: null,
    } as never,
    {} as never
  );
  assert.equal(res1?.statusCode, 401);
  assert.equal(rateLimitCalls, 1);
  assert.equal(e2eeAccountQueries, 1);
  assert.equal(res1?.headers?.['X-RateLimit-Remaining'], '0');

  // Second call is blocked by rate limit (429) BEFORE querying e2ee_accounts
  const res2 = await analyticsHandler(
    {
      httpMethod: 'GET',
      path: '/api/v1/analytics/summary',
      headers: { Authorization: `Bearer ${apiKey}.vk1_invalid` },
      queryStringParameters: {},
      body: null,
    } as never,
    {} as never
  );
  assert.equal(res2?.statusCode, 429);
  assert.equal(e2eeAccountQueries, 1);

  // CORS preflight on all bridge-enabled endpoints allows X-SteadyRenew-Vault-Key
  const subsPreflight = await subsHandler({ httpMethod: 'OPTIONS', path: '/api/v1/subscriptions', headers: {} } as never, {} as never);
  assert.match(String(subsPreflight?.headers?.['Access-Control-Allow-Headers'] ?? ''), /X-SteadyRenew-Vault-Key/);
  const analyticsPreflight = await analyticsHandler({ httpMethod: 'OPTIONS', path: '/api/v1/analytics/summary', headers: {} } as never, {} as never);
  assert.match(String(analyticsPreflight?.headers?.['Access-Control-Allow-Headers'] ?? ''), /X-SteadyRenew-Vault-Key/);
  const auditPreflight = await auditHandler({ httpMethod: 'OPTIONS', path: '/api/v1/audit', headers: {} } as never, {} as never);
  assert.match(String(auditPreflight?.headers?.['Access-Control-Allow-Headers'] ?? ''), /X-SteadyRenew-Vault-Key/);
  const mcpPreflight = await mcpHandler(new Request('https://steadyrenew.com/api/mcp', { method: 'OPTIONS' }));
  assert.match(mcpPreflight.headers.get('access-control-allow-headers') ?? '', /X-SteadyRenew-Vault-Key/);
});
