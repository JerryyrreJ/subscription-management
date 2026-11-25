import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  assertScope,
  consumeApiRateLimit,
  identifyApiKey,
  type ApiClientContext,
  type ApiKeyIdentity,
} from './_shared/apiKeys';
import { getApiLimitsConfig, getSupabaseAdminConfig, type ApiLimitsConfig } from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import { createSupabaseAdminClient } from './_shared/supabase';
import { runtimeEnvironment } from './_shared/webHandler';
import { isValidEnvelope, type Envelope } from '../../src/lib/e2ee/crypto';

/**
 * Zero-knowledge ciphertext endpoint `/api/v1/vault/*` used by the local stdio MCP server
 * (`SUBSCRIPTION_MANAGER_VAULT_KEY`) and custom zero-knowledge clients.
 * The server authenticates only `subm_<publicId>.<secret>` and never receives the vault DEK.
 */

interface VaultApiDependencies {
  database: SupabaseClient;
  limits: ApiLimitsConfig;
  createRequestId(): string;
  now(): Date;
  authenticatedIdentity?: ApiKeyIdentity;
}

const MAX_VAULT_REQUEST_BYTES = 256 * 1024;
const MAX_PENDING_PUSH_SCHEDULES_PER_USER = 500;
const MAX_PENDING_PUSH_SCHEDULES_PER_DAY = 25;
const SUBSCRIPTION_HASH_PATTERN = /^[a-f0-9]{64}$/;
const BARK_CIPHERTEXT_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const BARK_IV_PATTERN = /^[A-Za-z0-9]{16}$/;

const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
};

const envelopeSchema = z.custom<Envelope>(isValidEnvelope, {
  message: 'Expected a valid version-1 AES-256-GCM envelope { version: 1, nonce, ciphertext }',
});

const pushScheduleSchema = z
  .object({
    subscription_hash: z.string().regex(SUBSCRIPTION_HASH_PATTERN, 'Invalid subscription_hash'),
    trigger_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'trigger_date must be YYYY-MM-DD'),
    payload_mode: z.enum(['bark_ciphertext', 'generic']),
    bark_ciphertext: z.string().nullable().optional(),
    bark_iv: z.string().nullable().optional(),
  })
  .superRefine((item, ctx) => {
    if (item.payload_mode === 'bark_ciphertext') {
      if (
        !item.bark_ciphertext
        || item.bark_ciphertext.length < 16
        || item.bark_ciphertext.length > 16_384
        || !BARK_CIPHERTEXT_PATTERN.test(item.bark_ciphertext)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bark_ciphertext'],
          message: 'bark_ciphertext must be valid base64 (16-16384 chars) for bark_ciphertext mode',
        });
      }
      if (!item.bark_iv || !BARK_IV_PATTERN.test(item.bark_iv)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bark_iv'],
          message: 'bark_iv must be 16 alphanumeric characters for bark_ciphertext mode',
        });
      }
    } else if (item.bark_ciphertext != null || item.bark_iv != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload_mode'],
        message: 'generic push schedules must not carry bark_ciphertext or bark_iv',
      });
    }
  });

type PushScheduleInput = z.infer<typeof pushScheduleSchema>;

const createCiphertextBodySchema = z.object({
  id: z.string().uuid().optional(),
  envelope: envelopeSchema,
  auditId: z.string().uuid().optional(),
  auditEnvelope: envelopeSchema,
  subscriptionHash: z.string().regex(SUBSCRIPTION_HASH_PATTERN).optional(),
  pushSchedules: z.array(pushScheduleSchema).max(24).optional(),
});

const patchCiphertextBodySchema = z.object({
  envelope: envelopeSchema,
  auditId: z.string().uuid().optional(),
  auditEnvelope: envelopeSchema,
  subscriptionHash: z.string().regex(SUBSCRIPTION_HASH_PATTERN).optional(),
  pushSchedules: z.array(pushScheduleSchema).max(24).optional(),
});

const deleteCiphertextBodySchema = z.object({
  auditId: z.string().uuid().optional(),
  auditEnvelope: envelopeSchema,
  subscriptionHash: z.string().regex(SUBSCRIPTION_HASH_PATTERN).optional(),
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  subscriptionId: z.string().uuid('subscriptionId must be a valid UUID').optional(),
});

const createDefaultDependencies = (): VaultApiDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(runtimeEnvironment);
  return {
    database: createSupabaseAdminClient(supabaseConfig),
    limits: getApiLimitsConfig(runtimeEnvironment),
    createRequestId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
};

const withCorsHeaders = (response: HandlerResponse): HandlerResponse => ({
  ...response,
  headers: { ...CORS_HEADERS, ...(response.headers ?? {}) },
});

const withRateHeaders = (
  context: ApiClientContext,
  response: HandlerResponse
): HandlerResponse => ({
  ...response,
  headers: { ...(response.headers ?? {}), ...context.rateLimit.headers },
});

function parseVaultJsonBody(rawBody: string | null): Record<string, unknown> {
  if (!rawBody) {
    return {};
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_VAULT_REQUEST_BYTES) {
    throw new HttpError(
      413,
      'payload_too_large',
      `Request body exceeds maximum size of ${MAX_VAULT_REQUEST_BYTES} bytes`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'invalid_request', 'Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown, errorCode: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(
      400,
      errorCode,
      issue?.message || 'Invalid request payload',
      {},
      { field: issue?.path.map(String).join('.') || undefined }
    );
  }
  return result.data;
}

function validatePushScheduleInputs(
  boundHash: string | null,
  schedules: readonly PushScheduleInput[]
): void {
  if (schedules.length === 0) {
    return;
  }
  if (!boundHash) {
    throw new HttpError(
      400,
      'invalid_request',
      'subscriptionHash is required when providing pushSchedules'
    );
  }

  const seenDates = new Set<string>();
  for (const item of schedules) {
    if (item.subscription_hash !== boundHash) {
      throw new HttpError(
        400,
        'subscription_hash_mismatch',
        'All pushSchedules entries must match the target subscriptionHash'
      );
    }
    if (seenDates.has(item.trigger_date)) {
      throw new HttpError(
        400,
        'invalid_request',
        `Duplicate trigger_date in pushSchedules: ${item.trigger_date}`
      );
    }
    seenDates.add(item.trigger_date);
  }
}

async function replaceSubscriptionPushSchedules(
  database: SupabaseClient,
  userId: string,
  boundHash: string,
  schedules: readonly PushScheduleInput[]
): Promise<void> {
  validatePushScheduleInputs(boundHash, schedules);

  if (schedules.length > 0) {
    const { data: existingPending, error: countError } = await database
      .from('encrypted_push_schedules')
      .select('subscription_hash, trigger_date')
      .eq('user_id', userId)
      .is('dispatched_at', null);

    if (countError) {
      throw countError;
    }

    const otherRows = ((existingPending ?? []) as Array<{
      subscription_hash: string;
      trigger_date: string;
    }>).filter(row => row.subscription_hash !== boundHash);

    if (otherRows.length + schedules.length > MAX_PENDING_PUSH_SCHEDULES_PER_USER) {
      throw new HttpError(
        400,
        'push_schedule_limit_exceeded',
        `Pending push schedules cannot exceed ${MAX_PENDING_PUSH_SCHEDULES_PER_USER} per account`
      );
    }

    const dailyCounts = new Map<string, number>();
    for (const row of otherRows) {
      dailyCounts.set(row.trigger_date, (dailyCounts.get(row.trigger_date) ?? 0) + 1);
    }
    for (const item of schedules) {
      const nextCount = (dailyCounts.get(item.trigger_date) ?? 0) + 1;
      if (nextCount > MAX_PENDING_PUSH_SCHEDULES_PER_DAY) {
        throw new HttpError(
          400,
          'push_schedule_daily_limit_exceeded',
          `Pending push schedules for ${item.trigger_date} cannot exceed ${MAX_PENDING_PUSH_SCHEDULES_PER_DAY}`
        );
      }
      dailyCounts.set(item.trigger_date, nextCount);
    }
  }

  const { error: deleteError } = await database
    .from('encrypted_push_schedules')
    .delete()
    .eq('user_id', userId)
    .eq('subscription_hash', boundHash)
    .is('dispatched_at', null);

  if (deleteError) {
    throw deleteError;
  }

  if (schedules.length > 0) {
    const { error: upsertError } = await database.from('encrypted_push_schedules').upsert(
      schedules.map(item => ({
        user_id: userId,
        subscription_hash: boundHash,
        trigger_date: item.trigger_date,
        payload_mode: item.payload_mode,
        bark_ciphertext: item.bark_ciphertext ?? null,
        bark_iv: item.bark_iv ?? null,
      })),
      { onConflict: 'user_id,subscription_hash,trigger_date' }
    );
    if (upsertError) {
      throw upsertError;
    }
  }
}

function parseVaultRoute(rawPath: string): {
  resource: 'state' | 'subscriptions' | 'audit';
  id?: string;
} {
  const normalized = rawPath.replace(/\/+$/, '');
  const marker = normalized.includes('/api/v1/vault')
    ? '/api/v1/vault'
    : '/.netlify/functions/api-v1-vault';
  const index = normalized.indexOf(marker);
  const suffix = index === -1 ? '' : normalized.slice(index + marker.length);
  const segments = suffix.split('/').filter(Boolean);

  if (segments.length === 0 || (segments.length === 1 && segments[0] === 'state')) {
    return { resource: 'state' };
  }
  if (segments[0] === 'subscriptions' && segments.length === 1) {
    return { resource: 'subscriptions' };
  }
  if (segments[0] === 'subscriptions' && segments.length === 2) {
    const parsedId = z.string().uuid().safeParse(segments[1]);
    if (!parsedId.success) {
      throw new HttpError(400, 'invalid_subscription_id', 'Subscription ID must be a valid UUID');
    }
    return { resource: 'subscriptions', id: parsedId.data };
  }
  if (segments[0] === 'audit' && segments.length === 1) {
    return { resource: 'audit' };
  }

  throw new HttpError(404, 'not_found', 'Vault endpoint not found');
}

export const createVaultApiHandler = (
  dependenciesFactory: () => VaultApiDependencies = createDefaultDependencies
): Handler => async (event: HandlerEvent): Promise<HandlerResponse> => {
  let requestId: string = crypto.randomUUID();
  let apiContext: ApiClientContext | null = null;

  if (event.httpMethod === 'OPTIONS') {
    return withCorsHeaders({ statusCode: 204, headers: { Allow: ALLOWED_METHODS }, body: '' });
  }

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(event.httpMethod)) {
    return withCorsHeaders(jsonResponse(405, {
      error: { code: 'method_not_allowed', message: 'Method not allowed' },
      requestId,
    }, { Allow: ALLOWED_METHODS }));
  }

  try {
    const dependencies = dependenciesFactory();
    requestId = dependencies.createRequestId();
    const now = dependencies.now();
    const route = parseVaultRoute(event.path);

    const identity = dependencies.authenticatedIdentity ?? await identifyApiKey(
      event.headers,
      dependencies.database,
      dependencies.limits,
      now,
      requestId
    );

    assertScope(identity.scopes, event.httpMethod === 'GET' ? 'read' : 'write');
    const context = await consumeApiRateLimit(dependencies.database, identity, now);
    apiContext = context;

    const { data: account, error: accountError } = await dependencies.database
      .from('e2ee_accounts')
      .select('user_id, key_epoch, dek_check, bark_mode')
      .eq('user_id', identity.userId)
      .maybeSingle();

    if (accountError) {
      throw accountError;
    }

    if (route.resource === 'state') {
      if (event.httpMethod !== 'GET') {
        throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
      }
      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        enabled: Boolean(account),
        userId: identity.userId,
        account: account
          ? {
              userId: identity.userId,
              keyEpoch: account.key_epoch,
              dekCheck: account.dek_check,
              barkMode: account.bark_mode,
            }
          : null,
        requestId,
      })));
    }

    if (!account) {
      throw new HttpError(
        409,
        'e2ee_not_enabled',
        'End-to-end encryption is not enabled for this account. Use standard /api/v1/* endpoints.'
      );
    }

    if (route.resource === 'audit') {
      if (event.httpMethod !== 'GET') {
        throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
      }
      const { limit, offset, subscriptionId } = parseWithSchema(
        auditQuerySchema,
        event.queryStringParameters ?? {},
        'invalid_query'
      );

      let query = dependencies.database
        .from('encrypted_api_audit_log')
        .select('id, action, subscription_id, api_key_id, oauth_client_id, request_id, envelope, created_at')
        .eq('user_id', identity.userId);

      if (subscriptionId) {
        query = query.eq('subscription_id', subscriptionId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit);

      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        action: string;
        subscription_id: string | null;
        api_key_id: string | null;
        oauth_client_id?: string | null;
        request_id: string | null;
        envelope: Envelope;
        created_at: string;
      }>;
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: page.map(row => ({
          id: row.id,
          action: row.action,
          subscriptionId: row.subscription_id ?? undefined,
          apiKeyId: row.api_key_id ?? undefined,
          oauthClientId: row.oauth_client_id ?? undefined,
          requestId: row.request_id ?? undefined,
          envelope: row.envelope,
          createdAt: row.created_at,
        })),
        pagination: { limit, offset, hasMore },
        requestId,
      })));
    }

    // route.resource === 'subscriptions'
    if (event.httpMethod === 'GET' && !route.id) {
      const { data, error } = await dependencies.database
        .from('encrypted_subscriptions')
        .select('id, envelope, revision, created_at, updated_at')
        .eq('user_id', identity.userId)
        .order('created_at', { ascending: false })
        .range(0, 999);

      if (error) throw error;
      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: (data ?? []).map(row => ({
          id: row.id,
          envelope: row.envelope,
          revision: row.revision,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        requestId,
      })));
    }

    if (event.httpMethod === 'GET' && route.id) {
      const { data, error } = await dependencies.database
        .from('encrypted_subscriptions')
        .select('id, envelope, revision, created_at, updated_at')
        .eq('user_id', identity.userId)
        .eq('id', route.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new HttpError(404, 'subscription_not_found', 'Subscription not found');
      }
      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: {
          id: data.id,
          envelope: data.envelope,
          revision: data.revision,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
        requestId,
      })));
    }

    if (event.httpMethod === 'POST' && !route.id) {
      const bodyRaw = parseVaultJsonBody(event.body);
      const parsed = parseWithSchema(createCiphertextBodySchema, bodyRaw, 'invalid_request');
      if (parsed.pushSchedules !== undefined) {
        validatePushScheduleInputs(parsed.subscriptionHash ?? null, parsed.pushSchedules);
      }

      const id = parsed.id ?? crypto.randomUUID();
      const { data, error } = await dependencies.database
        .from('encrypted_subscriptions')
        .insert({
          id,
          user_id: identity.userId,
          envelope: parsed.envelope,
          subscription_hash: parsed.subscriptionHash ?? null,
        })
        .select('id, envelope, revision, created_at, updated_at')
        .single();

      if (error) throw error;

      if (parsed.pushSchedules !== undefined && parsed.subscriptionHash) {
        await replaceSubscriptionPushSchedules(
          dependencies.database,
          identity.userId,
          parsed.subscriptionHash,
          parsed.pushSchedules
        );
      }

      const { error: auditError } = await dependencies.database
        .from('encrypted_api_audit_log')
        .insert({
          id: parsed.auditId ?? crypto.randomUUID(),
          user_id: identity.userId,
          api_key_id: identity.apiKeyId,
          oauth_client_id: identity.oauthClientId ?? null,
          action: 'subscription.create',
          subscription_id: data.id,
          request_id: requestId,
          envelope: parsed.auditEnvelope,
          created_at: now.toISOString(),
        });

      if (auditError) throw auditError;

      return withCorsHeaders(withRateHeaders(context, jsonResponse(201, {
        data: {
          id: data.id,
          envelope: data.envelope,
          revision: data.revision,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
        requestId,
      })));
    }

    if (event.httpMethod === 'PATCH' && route.id) {
      const bodyRaw = parseVaultJsonBody(event.body);
      const parsed = parseWithSchema(patchCiphertextBodySchema, bodyRaw, 'invalid_request');

      const { data: existing, error: existingError } = await dependencies.database
        .from('encrypted_subscriptions')
        .select('id, subscription_hash')
        .eq('user_id', identity.userId)
        .eq('id', route.id)
        .maybeSingle<{ id: string; subscription_hash?: string | null }>();

      if (existingError) throw existingError;
      if (!existing) {
        throw new HttpError(404, 'subscription_not_found', 'Subscription not found');
      }

      if (
        parsed.subscriptionHash
        && existing.subscription_hash
        && existing.subscription_hash !== parsed.subscriptionHash
      ) {
        throw new HttpError(
          400,
          'subscription_hash_mismatch',
          'Provided subscriptionHash does not match this subscription'
        );
      }

      const boundHash = existing.subscription_hash ?? parsed.subscriptionHash ?? null;
      if (parsed.pushSchedules !== undefined) {
        validatePushScheduleInputs(boundHash, parsed.pushSchedules);
      }

      const updatePayload: Record<string, unknown> = { envelope: parsed.envelope };
      if (!existing.subscription_hash && parsed.subscriptionHash) {
        updatePayload.subscription_hash = parsed.subscriptionHash;
      }

      const { data, error } = await dependencies.database
        .from('encrypted_subscriptions')
        .update(updatePayload)
        .eq('user_id', identity.userId)
        .eq('id', route.id)
        .select('id, envelope, revision, created_at, updated_at')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new HttpError(404, 'subscription_not_found', 'Subscription not found');
      }

      // Only replace push schedules when explicitly provided (omitting `pushSchedules` preserves
      // existing Bark reminders when local clients update non-schedule fields).
      if (parsed.pushSchedules !== undefined && boundHash) {
        await replaceSubscriptionPushSchedules(
          dependencies.database,
          identity.userId,
          boundHash,
          parsed.pushSchedules
        );
      }

      const { error: auditError } = await dependencies.database
        .from('encrypted_api_audit_log')
        .insert({
          id: parsed.auditId ?? crypto.randomUUID(),
          user_id: identity.userId,
          api_key_id: identity.apiKeyId,
          oauth_client_id: identity.oauthClientId ?? null,
          action: 'subscription.update',
          subscription_id: route.id,
          request_id: requestId,
          envelope: parsed.auditEnvelope,
          created_at: now.toISOString(),
        });

      if (auditError) throw auditError;

      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: {
          id: data.id,
          envelope: data.envelope,
          revision: data.revision,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
        requestId,
      })));
    }

    if (event.httpMethod === 'DELETE' && route.id) {
      const bodyRaw = parseVaultJsonBody(event.body);
      const parsed = parseWithSchema(deleteCiphertextBodySchema, bodyRaw, 'invalid_request');
      const querySubHash = event.queryStringParameters?.subscriptionHash;
      if (querySubHash !== undefined && !SUBSCRIPTION_HASH_PATTERN.test(querySubHash)) {
        throw new HttpError(400, 'invalid_query', 'subscriptionHash query parameter must be 64 lowercase hex characters');
      }
      const requestedHash = parsed.subscriptionHash ?? querySubHash ?? null;

      const { data: existing, error: existingError } = await dependencies.database
        .from('encrypted_subscriptions')
        .select('id, subscription_hash')
        .eq('user_id', identity.userId)
        .eq('id', route.id)
        .maybeSingle<{ id: string; subscription_hash?: string | null }>();

      if (existingError) throw existingError;
      if (!existing) {
        throw new HttpError(404, 'subscription_not_found', 'Subscription not found');
      }

      if (
        requestedHash
        && existing.subscription_hash
        && existing.subscription_hash !== requestedHash
      ) {
        throw new HttpError(
          400,
          'subscription_hash_mismatch',
          'Provided subscriptionHash does not match this subscription'
        );
      }

      const { data: deleted, error } = await dependencies.database
        .from('encrypted_subscriptions')
        .delete()
        .eq('user_id', identity.userId)
        .eq('id', route.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!deleted) {
        throw new HttpError(404, 'subscription_not_found', 'Subscription not found');
      }

      const boundHash = existing.subscription_hash ?? requestedHash;
      if (boundHash) {
        const { error: scheduleDeleteError } = await dependencies.database
          .from('encrypted_push_schedules')
          .delete()
          .eq('user_id', identity.userId)
          .eq('subscription_hash', boundHash)
          .is('dispatched_at', null);

        if (scheduleDeleteError) throw scheduleDeleteError;
      }

      const { error: auditError } = await dependencies.database
        .from('encrypted_api_audit_log')
        .insert({
          id: parsed.auditId ?? crypto.randomUUID(),
          user_id: identity.userId,
          api_key_id: identity.apiKeyId,
          oauth_client_id: identity.oauthClientId ?? null,
          action: 'subscription.delete',
          subscription_id: route.id,
          request_id: requestId,
          envelope: parsed.auditEnvelope,
          created_at: now.toISOString(),
        });

      if (auditError) throw auditError;

      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        deleted: true,
        id: route.id,
        requestId,
      })));
    }

    throw new HttpError(404, 'not_found', 'Not found');
  } catch (error) {
    logEvent('error', 'Vault API request failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const response = errorResponse(error, requestId);
    return withCorsHeaders(apiContext ? withRateHeaders(apiContext, response) : response);
  }
};

export const handler: Handler = createVaultApiHandler();
