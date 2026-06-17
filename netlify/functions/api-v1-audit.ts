import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  assertScope,
  consumeApiRateLimit,
  identifyApiKey,
  type ApiClientContext,
} from './_shared/apiKeys';
import { getApiLimitsConfig, getSupabaseAdminConfig, type ApiLimitsConfig } from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import { createSupabaseAdminClient } from './_shared/supabase';

interface AuditRow {
  id: string;
  action: string;
  subscription_id: string | null;
  api_key_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AuditApiDependencies {
  database: SupabaseClient;
  limits: ApiLimitsConfig;
  createRequestId(): string;
  now(): Date;
}

const AUDIT_COLUMNS = [
  'id',
  'action',
  'subscription_id',
  'api_key_id',
  'request_id',
  'metadata',
  'created_at',
].join(', ');

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

const ALLOWED_METHODS = 'GET, OPTIONS';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
};

const querySchema = z.object({
  limit: z.coerce.number().int('limit must be a whole number')
    .min(1, 'limit must be at least 1')
    .max(MAX_PAGE_LIMIT, `limit cannot exceed ${MAX_PAGE_LIMIT}`)
    .default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int('offset must be a whole number')
    .min(0, 'offset cannot be negative')
    .default(0),
  subscriptionId: z.string().uuid('subscriptionId must be a valid UUID').optional(),
});

const createDefaultDependencies = (): AuditApiDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(process.env);

  return {
    database: createSupabaseAdminClient(supabaseConfig),
    limits: getApiLimitsConfig(process.env),
    createRequestId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
};

const parseQuery = (query: HandlerEvent['queryStringParameters']) => {
  const result = querySchema.safeParse(query ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, 'invalid_query', issue?.message || 'Invalid query parameters', {}, {
      field: issue?.path.map(String).join('.') || undefined,
      suggestedFix: `Use limit between 1 and ${MAX_PAGE_LIMIT}, a non-negative offset, and an optional subscriptionId UUID filter.`,
    });
  }

  return result.data;
};

const toApiAuditEntry = (row: AuditRow) => ({
  id: row.id,
  action: row.action,
  subscriptionId: row.subscription_id ?? undefined,
  apiKeyId: row.api_key_id ?? undefined,
  requestId: row.request_id ?? undefined,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
});

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

export const createAuditApiHandler = (
  dependenciesFactory: () => AuditApiDependencies = createDefaultDependencies
): Handler => async (event: HandlerEvent): Promise<HandlerResponse> => {
  let requestId: string = crypto.randomUUID();
  let apiContext: ApiClientContext | null = null;

  if (event.httpMethod === 'OPTIONS') {
    return withCorsHeaders({ statusCode: 204, headers: { Allow: ALLOWED_METHODS }, body: '' });
  }

  if (event.httpMethod !== 'GET') {
    return withCorsHeaders(jsonResponse(405, {
      error: { code: 'method_not_allowed', message: 'Method not allowed' },
      requestId,
    }, { Allow: ALLOWED_METHODS }));
  }

  try {
    const dependencies = dependenciesFactory();
    requestId = dependencies.createRequestId();
    const now = dependencies.now();
    const { limit, offset, subscriptionId } = parseQuery(event.queryStringParameters);

    const identity = await identifyApiKey(
      event.headers,
      dependencies.database,
      dependencies.limits,
      now,
      requestId
    );
    assertScope(identity.scopes, 'read');

    const context = await consumeApiRateLimit(dependencies.database, identity, now);
    apiContext = context;

    let auditQuery = dependencies.database
      .from('api_audit_log')
      .select(AUDIT_COLUMNS)
      .eq('user_id', identity.userId);

    if (subscriptionId) {
      auditQuery = auditQuery.eq('subscription_id', subscriptionId);
    }

    const { data, error } = await auditQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as unknown as AuditRow[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
      data: page.map(toApiAuditEntry),
      pagination: { limit, offset, hasMore },
      requestId,
    })));
  } catch (error) {
    logEvent('error', 'Audit API request failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const response = errorResponse(error, requestId);
    return withCorsHeaders(apiContext ? withRateHeaders(apiContext, response) : response);
  }
};

export const handler = createAuditApiHandler();
