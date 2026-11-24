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

const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
};

const envelopeSchema = z.custom<Envelope>(isValidEnvelope, {
  message: 'Expected a valid version-1 AES-256-GCM envelope { version: 1, nonce, ciphertext }',
});

const pushScheduleSchema = z.object({
  subscription_hash: z.string().regex(/^[a-f0-9]{64}$/),
  trigger_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payload_mode: z.enum(['bark_ciphertext', 'generic']),
  bark_ciphertext: z.string().nullable().optional(),
  bark_iv: z.string().nullable().optional(),
});

const createCiphertextBodySchema = z.object({
  id: z.string().uuid().optional(),
  envelope: envelopeSchema,
  auditId: z.string().uuid().optional(),
  auditEnvelope: envelopeSchema.optional(),
  subscriptionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  pushSchedules: z.array(pushScheduleSchema).max(24).optional(),
});

const patchCiphertextBodySchema = z.object({
  envelope: envelopeSchema,
  auditId: z.string().uuid().optional(),
  auditEnvelope: envelopeSchema.optional(),
  subscriptionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  pushSchedules: z.array(pushScheduleSchema).max(24).optional(),
});

const deleteCiphertextBodySchema = z.object({
  auditId: z.string().uuid().optional(),
  auditEnvelope: envelopeSchema.optional(),
  subscriptionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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
      const limit = Math.min(100, Math.max(1, Number(event.queryStringParameters?.limit ?? 50) || 50));
      const offset = Math.min(10_000, Math.max(0, Number(event.queryStringParameters?.offset ?? 0) || 0));
      const subscriptionId = event.queryStringParameters?.subscriptionId;

      let query = dependencies.database
        .from('encrypted_api_audit_log')
        .select('id, action, subscription_id, api_key_id, request_id, envelope, created_at')
        .eq('user_id', identity.userId);

      if (subscriptionId) {
        query = query.eq('subscription_id', subscriptionId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit);

      if (error) throw error;
      const rows = data ?? [];
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: page.map(row => ({
          id: row.id,
          action: row.action,
          subscriptionId: row.subscription_id ?? undefined,
          apiKeyId: row.api_key_id ?? undefined,
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
      const bodyRaw = event.body ? JSON.parse(event.body) : {};
      const parsed = createCiphertextBodySchema.parse(bodyRaw);
      const id = parsed.id ?? crypto.randomUUID();

      const { data, error } = await dependencies.database
        .from('encrypted_subscriptions')
        .insert({
          id,
          user_id: identity.userId,
          envelope: parsed.envelope,
        })
        .select('id, envelope, revision, created_at, updated_at')
        .single();

      if (error) throw error;

      if (parsed.subscriptionHash) {
        await dependencies.database
          .from('encrypted_push_schedules')
          .delete()
          .eq('user_id', identity.userId)
          .eq('subscription_hash', parsed.subscriptionHash)
          .is('dispatched_at', null);
      }
      if (parsed.pushSchedules && parsed.pushSchedules.length > 0) {
        await dependencies.database.from('encrypted_push_schedules').upsert(
          parsed.pushSchedules.map(item => ({
            user_id: identity.userId,
            subscription_hash: item.subscription_hash,
            trigger_date: item.trigger_date,
            payload_mode: item.payload_mode,
            bark_ciphertext: item.bark_ciphertext ?? null,
            bark_iv: item.bark_iv ?? null,
          })),
          { onConflict: 'user_id,subscription_hash,trigger_date' }
        );
      }
      if (parsed.auditEnvelope) {
        await dependencies.database.from('encrypted_api_audit_log').insert({
          id: parsed.auditId ?? crypto.randomUUID(),
          user_id: identity.userId,
          api_key_id: identity.apiKeyId,
          action: 'subscription.create',
          subscription_id: data.id,
          request_id: requestId,
          envelope: parsed.auditEnvelope,
          created_at: now.toISOString(),
        });
      }

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
      const bodyRaw = event.body ? JSON.parse(event.body) : {};
      const parsed = patchCiphertextBodySchema.parse(bodyRaw);

      const { data, error } = await dependencies.database
        .from('encrypted_subscriptions')
        .update({ envelope: parsed.envelope })
        .eq('user_id', identity.userId)
        .eq('id', route.id)
        .select('id, envelope, revision, created_at, updated_at')
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new HttpError(404, 'subscription_not_found', 'Subscription not found');
      }

      if (parsed.subscriptionHash) {
        await dependencies.database
          .from('encrypted_push_schedules')
          .delete()
          .eq('user_id', identity.userId)
          .eq('subscription_hash', parsed.subscriptionHash)
          .is('dispatched_at', null);
      }
      if (parsed.pushSchedules && parsed.pushSchedules.length > 0) {
        await dependencies.database.from('encrypted_push_schedules').upsert(
          parsed.pushSchedules.map(item => ({
            user_id: identity.userId,
            subscription_hash: item.subscription_hash,
            trigger_date: item.trigger_date,
            payload_mode: item.payload_mode,
            bark_ciphertext: item.bark_ciphertext ?? null,
            bark_iv: item.bark_iv ?? null,
          })),
          { onConflict: 'user_id,subscription_hash,trigger_date' }
        );
      }
      if (parsed.auditEnvelope) {
        await dependencies.database.from('encrypted_api_audit_log').insert({
          id: parsed.auditId ?? crypto.randomUUID(),
          user_id: identity.userId,
          api_key_id: identity.apiKeyId,
          action: 'subscription.update',
          subscription_id: route.id,
          request_id: requestId,
          envelope: parsed.auditEnvelope,
          created_at: now.toISOString(),
        });
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

    if (event.httpMethod === 'DELETE' && route.id) {
      const bodyRaw = event.body ? JSON.parse(event.body) : {};
      const parsed = deleteCiphertextBodySchema.parse(bodyRaw);
      const subHash = parsed.subscriptionHash ?? event.queryStringParameters?.subscriptionHash;

      const { error } = await dependencies.database
        .from('encrypted_subscriptions')
        .delete()
        .eq('user_id', identity.userId)
        .eq('id', route.id);

      if (error) throw error;

      if (subHash && /^[a-f0-9]{64}$/.test(subHash)) {
        await dependencies.database
          .from('encrypted_push_schedules')
          .delete()
          .eq('user_id', identity.userId)
          .eq('subscription_hash', subHash)
          .is('dispatched_at', null);
      }
      if (parsed.auditEnvelope) {
        await dependencies.database.from('encrypted_api_audit_log').insert({
          id: parsed.auditId ?? crypto.randomUUID(),
          user_id: identity.userId,
          api_key_id: identity.apiKeyId,
          action: 'subscription.delete',
          subscription_id: route.id,
          request_id: requestId,
          envelope: parsed.auditEnvelope,
          created_at: now.toISOString(),
        });
      }

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
