import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authenticateRequest, type AuthClient } from './_shared/auth';
import {
  getApiLimitsConfig,
  getSupabaseAdminConfig,
  type ApiLimitsConfig,
  type SupabaseAdminConfig,
  type SupabasePublicConfig,
} from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { generateApiKeyMaterial, hashApiKey, type ApiKeyMaterial } from './_shared/apiKeys';
import { logEvent } from './_shared/logging';
import { createSupabaseAdminClient, createSupabaseAuthClient } from './_shared/supabase';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface ProfileRow {
  is_premium: boolean | null;
}

interface ApiKeyDependencies {
  supabaseConfig: SupabaseAdminConfig;
  database: SupabaseClient;
  limits: ApiLimitsConfig;
  createAuthClient(config: SupabasePublicConfig): AuthClient;
  createApiKeyMaterial(): ApiKeyMaterial;
  createRequestId(): string;
  now(): Date;
}

interface CreateApiKeyResult extends ApiKeyRow {
  created: boolean;
}

const createKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(80).default('Default key'),
});

const revokeQuerySchema = z.object({
  id: z.string().uuid(),
});

const parseCreateKeyBody = (body: string | null): z.infer<typeof createKeyBodySchema> => {
  const result = createKeyBodySchema.safeParse(parseJsonObject(body));
  if (!result.success) {
    throw new HttpError(
      400,
      'invalid_api_key',
      result.error.issues[0]?.message || 'API key data is invalid'
    );
  }

  return result.data;
};

const parseRevokeQuery = (
  query: HandlerEvent['queryStringParameters']
): z.infer<typeof revokeQuerySchema> => {
  const result = revokeQuerySchema.safeParse(query ?? {});
  if (!result.success) {
    throw new HttpError(400, 'invalid_api_key_id', 'API key id must be a valid UUID');
  }

  return result.data;
};

const createDefaultDependencies = (): ApiKeyDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(process.env);

  return {
    supabaseConfig,
    database: createSupabaseAdminClient(supabaseConfig),
    limits: getApiLimitsConfig(process.env),
    createAuthClient: createSupabaseAuthClient,
    createApiKeyMaterial: generateApiKeyMaterial,
    createRequestId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
};

const parseJsonObject = (body: string | null): unknown => {
  if (!body) {
    return {};
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object');
    }
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
};

const toPublicKey = (row: ApiKeyRow) => ({
  id: row.id,
  name: row.name,
  keyPrefix: row.key_prefix,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
});

const unwrapCreateApiKeyResult = (data: unknown): CreateApiKeyResult | null => {
  if (Array.isArray(data)) {
    return (data[0] as CreateApiKeyResult | undefined) ?? null;
  }

  return (data as CreateApiKeyResult | null) ?? null;
};

const getProfile = async (
  database: SupabaseClient,
  userId: string
): Promise<ProfileRow | null> => {
  const { data, error } = await database
    .from('user_profiles')
    .select('is_premium')
    .eq('user_id', userId)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw error;
  }

  return data;
};

const listKeys = async (
  database: SupabaseClient,
  userId: string
): Promise<ApiKeyRow[]> => {
  const { data, error } = await database
    .from('api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as ApiKeyRow[];
};

const getKeyLimit = (
  profile: ProfileRow | null,
  limits: ApiLimitsConfig
): number => profile?.is_premium ? limits.premiumActiveKeys : limits.freeActiveKeys;

const getHourlyLimit = (
  profile: ProfileRow | null,
  limits: ApiLimitsConfig
): number => profile?.is_premium ? limits.premiumRequestsPerHour : limits.freeRequestsPerHour;

export const createApiKeysHandler = (
  dependenciesFactory: () => ApiKeyDependencies = createDefaultDependencies
): Handler => async (event: HandlerEvent): Promise<HandlerResponse> => {
  let requestId: string = crypto.randomUUID();

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { Allow: 'GET, POST, DELETE' }, body: '' };
  }

  if (!['GET', 'POST', 'DELETE'].includes(event.httpMethod)) {
    return jsonResponse(405, {
      error: { code: 'method_not_allowed', message: 'Method not allowed' },
      requestId,
    }, { Allow: 'GET, POST, DELETE' });
  }

  try {
    const dependencies = dependenciesFactory();
    requestId = dependencies.createRequestId();
    const authenticated = await authenticateRequest(
      event.headers,
      dependencies.createAuthClient(dependencies.supabaseConfig)
    );
    const profile = await getProfile(dependencies.database, authenticated.userId);

    if (event.httpMethod === 'GET') {
      const keys = await listKeys(dependencies.database, authenticated.userId);
      return jsonResponse(200, {
        keys: keys.map(toPublicKey),
        limits: {
          activeKeys: getKeyLimit(profile, dependencies.limits),
          requestsPerHour: getHourlyLimit(profile, dependencies.limits),
          plan: profile?.is_premium ? 'premium' : 'free',
        },
        requestId,
      });
    }

    if (event.httpMethod === 'POST') {
      const parsed = parseCreateKeyBody(event.body);
      const activeKeyLimit = getKeyLimit(profile, dependencies.limits);
      const apiKeyMaterial = dependencies.createApiKeyMaterial();
      const { data: createData, error } = await dependencies.database.rpc(
        'create_api_key_if_under_limit',
        {
          p_user_id: authenticated.userId,
          p_name: parsed.name,
          p_key_prefix: apiKeyMaterial.keyPrefix,
          p_key_hash: hashApiKey(apiKeyMaterial.apiKey),
          p_active_key_limit: activeKeyLimit,
        }
      );

      if (error) {
        throw error;
      }

      const data = unwrapCreateApiKeyResult(createData);
      if (!data) {
        throw new Error('API key creation RPC did not return a result');
      }

      if (!data.created) {
        throw new HttpError(
          403,
          'api_key_limit_exceeded',
          `Active API key limit reached for this plan (${activeKeyLimit})`
        );
      }

      logEvent('info', 'API key created', requestId, {
        userId: authenticated.userId,
        keyId: data.id,
      });

      return jsonResponse(201, {
        apiKey: apiKeyMaterial.apiKey,
        key: toPublicKey(data),
        requestId,
      });
    }

    const query = parseRevokeQuery(event.queryStringParameters);
    const { data, error } = await dependencies.database
      .from('api_keys')
      .update({ revoked_at: dependencies.now().toISOString() })
      .eq('id', query.id)
      .eq('user_id', authenticated.userId)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle<{ id: string }>();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new HttpError(404, 'api_key_not_found', 'API key not found');
    }

    logEvent('info', 'API key revoked', requestId, {
      userId: authenticated.userId,
      keyId: query.id,
    });

    return jsonResponse(200, {
      revoked: true,
      requestId,
    });
  } catch (error) {
    logEvent('error', 'API key request failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(error, requestId);
  }
};

export const handler = createApiKeysHandler();
