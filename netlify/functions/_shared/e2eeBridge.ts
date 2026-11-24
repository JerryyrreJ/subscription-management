import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEntry } from './audit';
import type { ApiKeyIdentity } from './apiKeys';
import { HttpError } from './http';
import { logEvent } from './logging';
import {
  type BarkE2eeMode,
  computeSubscriptionPushHash,
  decodeVaultKeyToken,
  decryptAuditPayload,
  decryptSubscriptionPayload,
  encryptAuditPayload,
  encryptSubscriptionPayload,
  type EncryptedSubscriptionContent,
  type Envelope,
  importDek,
  verifyDekCheck,
} from '../../../src/lib/e2ee/crypto';
import { buildPushSchedulesForSubscription } from '../../../src/lib/e2ee/pushScheduleBuilder';
import { normalizeSubscriptionRecord } from '../../../src/utils/subscriptionDomain';

export interface BridgeSubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  amount: number;
  currency: string;
  period: string;
  last_payment_date: string;
  next_payment_date: string;
  billing_anchor_day: number | null;
  custom_date: string | null;
  notification_enabled: boolean;
  is_trial: boolean;
  trial_ends_on: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BridgeAuditRow {
  id: string;
  action: string;
  subscription_id: string | null;
  api_key_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface E2eeBridgeSession {
  userId: string;
  keyEpoch: number;
  barkMode: BarkE2eeMode;
  dek: CryptoKey;
  dekBytes: Uint8Array;
  dispose(): void;
}

function isMissingE2eeTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  const msg = error.message ?? '';
  return (
    code === '42P01'
    || code === 'PGRST205'
    || msg.includes('Unexpected query: e2ee_accounts')
    || /does not exist|could not find the table/i.test(msg)
  );
}

/**
 * Checks whether `identity.userId` has E2EE enabled.
 * - Returns `null` when E2EE is not enabled (plaintext tables apply).
 * - Throws `403 e2ee_vault_key_required` when E2EE is enabled and no transient vault key was supplied.
 * - Returns a verified ephemeral `E2eeBridgeSession` in RAM when a valid vault key token was supplied.
 */
export async function resolveE2eeBridgeSession(
  database: SupabaseClient,
  identity: ApiKeyIdentity
): Promise<E2eeBridgeSession | null> {
  const { data: account, error } = await database
    .from('e2ee_accounts')
    .select('user_id, key_epoch, dek_check, bark_mode')
    .eq('user_id', identity.userId)
    .maybeSingle<{
      user_id: string;
      key_epoch: number;
      dek_check: Envelope;
      bark_mode: BarkE2eeMode;
    }>();

  if (error) {
    if (isMissingE2eeTableError(error as { code?: string; message?: string })) {
      return null;
    }
    throw error;
  }

  if (!account) {
    return null;
  }

  if (!identity.vaultKeyToken) {
    throw new HttpError(
      403,
      'e2ee_vault_key_required',
      'End-to-end encryption is enabled on this account. A vault key is required to read or write encrypted subscriptions.',
      {},
      {
        suggestedFix:
          'For local stdio MCP, set SUBSCRIPTION_MANAGER_VAULT_KEY in your local environment. For remote HTTP MCP or REST clients, use a split bridge key (subm_<key>.vk1_<vaultKey>) or pass the X-SteadyRenew-Vault-Key header.',
      }
    );
  }

  let dekBytes: Uint8Array;
  try {
    dekBytes = decodeVaultKeyToken(identity.vaultKeyToken);
  } catch {
    throw new HttpError(401, 'invalid_vault_key', 'Malformed vault key token');
  }

  const dek = await importDek(dekBytes);
  const valid = await verifyDekCheck(dek, account.dek_check, identity.userId, account.key_epoch);
  if (!valid) {
    dekBytes.fill(0);
    throw new HttpError(
      403,
      'invalid_vault_key',
      'Provided vault key does not match this encrypted account.'
    );
  }

  return {
    userId: identity.userId,
    keyEpoch: account.key_epoch,
    barkMode: account.bark_mode,
    dek,
    dekBytes,
    dispose() {
      dekBytes.fill(0);
    },
  };
}

function contentToBridgeRow(
  id: string,
  userId: string,
  content: EncryptedSubscriptionContent,
  createdAt: string,
  updatedAt: string
): BridgeSubscriptionRow {
  return {
    id,
    user_id: userId,
    name: content.name,
    category: content.category,
    amount: Number(content.amount),
    currency: content.currency,
    period: content.period,
    last_payment_date: content.lastPaymentDate,
    next_payment_date: content.nextPaymentDate,
    billing_anchor_day: content.billingAnchorDay ?? null,
    custom_date: content.customDate ?? null,
    notification_enabled: content.notificationEnabled,
    is_trial: Boolean(content.isTrial),
    trial_ends_on: content.trialEndsOn ?? null,
    status: content.status ?? 'active',
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function dbPayloadToEncryptedContent(payload: Record<string, unknown>): EncryptedSubscriptionContent {
  return {
    name: String(payload.name ?? ''),
    category: String(payload.category ?? 'Other'),
    amount: Number(payload.amount ?? 0),
    currency: String(payload.currency ?? 'USD'),
    period: String(payload.period ?? 'monthly') as EncryptedSubscriptionContent['period'],
    lastPaymentDate: String(payload.last_payment_date ?? ''),
    nextPaymentDate: String(payload.next_payment_date ?? ''),
    billingAnchorDay:
      payload.billing_anchor_day !== null && payload.billing_anchor_day !== undefined
        ? Number(payload.billing_anchor_day)
        : null,
    customDate: payload.custom_date ? String(payload.custom_date) : undefined,
    notificationEnabled: payload.notification_enabled !== false,
    isTrial: Boolean(payload.is_trial),
    trialEndsOn: payload.trial_ends_on ? String(payload.trial_ends_on) : undefined,
    status: (payload.status as EncryptedSubscriptionContent['status']) ?? 'active',
  };
}

async function syncBridgeGenericPushSchedule(
  database: SupabaseClient,
  bridge: E2eeBridgeSession,
  row: BridgeSubscriptionRow | null,
  deletedId?: string
): Promise<void> {
  const targetId = row?.id ?? deletedId;
  if (!targetId) return;

  try {
    const subHash = await computeSubscriptionPushHash(bridge.dekBytes, targetId);
    await database
      .from('encrypted_push_schedules')
      .delete()
      .eq('user_id', bridge.userId)
      .eq('subscription_hash', subHash)
      .is('dispatched_at', null);

    if (!row || bridge.barkMode === 'off') {
      return;
    }

    const { data: settings } = await database
      .from('user_notification_settings')
      .select('bark_enabled, bark_device_key, bark_days_before, time_zone, locale')
      .eq('user_id', bridge.userId)
      .maybeSingle<{
        bark_enabled: boolean;
        bark_device_key: string;
        bark_days_before: number;
        time_zone: string | null;
        locale: string | null;
      }>();

    if (!settings?.bark_enabled || !settings.bark_device_key) {
      return;
    }

    const normalized = normalizeSubscriptionRecord({
      id: row.id,
      name: row.name,
      category: row.category,
      amount: row.amount,
      currency: row.currency as 'USD',
      period: row.period as 'monthly' | 'yearly' | 'custom',
      lastPaymentDate: row.last_payment_date,
      nextPaymentDate: row.next_payment_date,
      billingAnchorDay: row.billing_anchor_day ?? undefined,
      customDate: row.custom_date ?? undefined,
      notificationEnabled: row.notification_enabled,
      isTrial: row.is_trial,
      trialEndsOn: row.trial_ends_on ?? undefined,
      status: row.status as 'active' | 'paused' | 'cancelled',
    });

    // Ephemeral server bridge never receives the user's Bark AES key, so new API-created
    // subscriptions schedule privacy-preserving generic reminders until the web app syncs.
    const { rows: scheduleRows } = await buildPushSchedulesForSubscription(
      normalized,
      bridge.dekBytes,
      {
        barkEnabled: true,
        daysBefore: settings.bark_days_before,
        timeZone: settings.time_zone,
        locale: settings.locale,
        barkMode: 'generic',
      }
    );

    if (scheduleRows.length > 0) {
      await database.from('encrypted_push_schedules').upsert(
        scheduleRows.map(item => ({
          user_id: bridge.userId,
          ...item,
        })),
        { onConflict: 'user_id,subscription_hash,trigger_date' }
      );
    }
  } catch {
    // Best-effort schedule update
  }
}

export async function listBridgeSubscriptions(
  database: SupabaseClient,
  bridge: E2eeBridgeSession
): Promise<BridgeSubscriptionRow[]> {
  const { data, error } = await database
    .from('encrypted_subscriptions')
    .select('id, envelope, created_at, updated_at')
    .eq('user_id', bridge.userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rawRows = (data ?? []) as Array<{
    id: string;
    envelope: Envelope;
    created_at: string;
    updated_at: string;
  }>;

  const decrypted: BridgeSubscriptionRow[] = [];
  for (const row of rawRows) {
    const content = await decryptSubscriptionPayload(
      bridge.dek,
      bridge.userId,
      row.id,
      row.envelope
    );
    decrypted.push(
      contentToBridgeRow(row.id, bridge.userId, content, row.created_at, row.updated_at)
    );
  }
  return decrypted;
}

export async function getBridgeSubscription(
  database: SupabaseClient,
  bridge: E2eeBridgeSession,
  subscriptionId: string
): Promise<BridgeSubscriptionRow> {
  const { data, error } = await database
    .from('encrypted_subscriptions')
    .select('id, envelope, created_at, updated_at')
    .eq('user_id', bridge.userId)
    .eq('id', subscriptionId)
    .maybeSingle<{
      id: string;
      envelope: Envelope;
      created_at: string;
      updated_at: string;
    }>();

  if (error) throw error;
  if (!data) {
    throw new HttpError(404, 'subscription_not_found', 'Subscription not found');
  }

  const content = await decryptSubscriptionPayload(
    bridge.dek,
    bridge.userId,
    data.id,
    data.envelope
  );
  return contentToBridgeRow(data.id, bridge.userId, content, data.created_at, data.updated_at);
}

export async function createBridgeSubscription(
  database: SupabaseClient,
  bridge: E2eeBridgeSession,
  dbPayload: Record<string, unknown>
): Promise<BridgeSubscriptionRow> {
  const id = crypto.randomUUID();
  const content = dbPayloadToEncryptedContent(dbPayload);
  const envelope = await encryptSubscriptionPayload(bridge.dek, bridge.userId, id, content);

  const { data, error } = await database
    .from('encrypted_subscriptions')
    .insert({
      id,
      user_id: bridge.userId,
      envelope,
    })
    .select('id, created_at, updated_at')
    .single<{ id: string; created_at: string; updated_at: string }>();

  if (error) throw error;
  const created = contentToBridgeRow(data.id, bridge.userId, content, data.created_at, data.updated_at);
  await syncBridgeGenericPushSchedule(database, bridge, created);
  return created;
}

export async function updateBridgeSubscription(
  database: SupabaseClient,
  bridge: E2eeBridgeSession,
  subscriptionId: string,
  dbPayload: Record<string, unknown>
): Promise<BridgeSubscriptionRow> {
  const content = dbPayloadToEncryptedContent(dbPayload);
  const envelope = await encryptSubscriptionPayload(
    bridge.dek,
    bridge.userId,
    subscriptionId,
    content
  );

  const { data, error } = await database
    .from('encrypted_subscriptions')
    .update({ envelope })
    .eq('user_id', bridge.userId)
    .eq('id', subscriptionId)
    .select('id, created_at, updated_at')
    .single<{ id: string; created_at: string; updated_at: string }>();

  if (error) throw error;
  const updated = contentToBridgeRow(data.id, bridge.userId, content, data.created_at, data.updated_at);
  await syncBridgeGenericPushSchedule(database, bridge, updated);
  return updated;
}

export async function deleteBridgeSubscription(
  database: SupabaseClient,
  bridge: E2eeBridgeSession,
  subscriptionId: string
): Promise<void> {
  const { error } = await database
    .from('encrypted_subscriptions')
    .delete()
    .eq('user_id', bridge.userId)
    .eq('id', subscriptionId);

  if (error) throw error;
  await syncBridgeGenericPushSchedule(database, bridge, null, subscriptionId);
}

export async function recordBridgeAudit(
  database: SupabaseClient,
  bridge: E2eeBridgeSession,
  entry: AuditEntry,
  now: Date
): Promise<void> {
  try {
    const auditId = crypto.randomUUID();
    const envelope = await encryptAuditPayload(
      bridge.dek,
      bridge.userId,
      auditId,
      entry.metadata ?? {}
    );
    const { error } = await database.from('encrypted_api_audit_log').insert({
      id: auditId,
      user_id: entry.userId,
      api_key_id: entry.apiKeyId,
      action: entry.action,
      subscription_id: entry.subscriptionId ?? null,
      request_id: entry.requestId,
      envelope,
      created_at: now.toISOString(),
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    logEvent('warn', 'Failed to record encrypted API audit entry', entry.requestId, {
      action: entry.action,
      subscriptionId: entry.subscriptionId ?? undefined,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function listBridgeAuditRows(
  database: SupabaseClient,
  bridge: E2eeBridgeSession,
  query: { limit: number; offset: number; subscriptionId?: string }
): Promise<{ rows: BridgeAuditRow[]; hasMore: boolean }> {
  let dbQuery = database
    .from('encrypted_api_audit_log')
    .select('id, action, subscription_id, api_key_id, request_id, envelope, created_at')
    .eq('user_id', bridge.userId);

  if (query.subscriptionId) {
    dbQuery = dbQuery.eq('subscription_id', query.subscriptionId);
  }

  const { data, error } = await dbQuery
    .order('created_at', { ascending: false })
    .range(query.offset, query.offset + query.limit);

  if (error) throw error;
  const rawRows = (data ?? []) as Array<{
    id: string;
    action: string;
    subscription_id: string | null;
    api_key_id: string | null;
    request_id: string | null;
    envelope: Envelope;
    created_at: string;
  }>;

  const hasMore = rawRows.length > query.limit;
  const slice = hasMore ? rawRows.slice(0, query.limit) : rawRows;
  const decrypted: BridgeAuditRow[] = [];

  for (const row of slice) {
    const metadata = await decryptAuditPayload(bridge.dek, bridge.userId, row.id, row.envelope);
    decrypted.push({
      id: row.id,
      action: row.action,
      subscription_id: row.subscription_id,
      api_key_id: row.api_key_id,
      request_id: row.request_id,
      metadata,
      created_at: row.created_at,
    });
  }

  return { rows: decrypted, hasMore };
}
