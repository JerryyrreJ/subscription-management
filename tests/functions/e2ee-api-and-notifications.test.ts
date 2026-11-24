import test from 'node:test';
import assert from 'node:assert/strict';
import { generateApiKeyMaterial, hashApiKey } from '../../netlify/functions/_shared/apiKeys.ts';
import { createSubscriptionsApiHandler } from '../../netlify/functions/api-v1-subscriptions.ts';
import { createAnalyticsApiHandler } from '../../netlify/functions/api-v1-analytics.ts';
import { createAuditApiHandler } from '../../netlify/functions/api-v1-audit.ts';
import { createVaultApiHandler } from '../../netlify/functions/api-v1-vault.ts';
import { createScheduledNotificationsHandler } from '../../netlify/functions/send-scheduled-notifications.ts';
import { createFakeSupabaseClient, type QueryState } from './apiTestHelpers.ts';
import {
  createDekCheck,
  decryptBarkPushPayload,
  encodeVaultKeyToken,
  encryptBarkPushPayload,
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
      return { data: null, error: null };
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
