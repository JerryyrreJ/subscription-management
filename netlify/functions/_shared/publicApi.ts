import type { HandlerResponse } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ApiClientContext, ApiKeyIdentity } from './apiKeys';
import { getApiLimitsConfig, getSupabaseAdminConfig, type ApiLimitsConfig } from './env';
import { HttpError, jsonResponse } from './http';
import { createSupabaseAdminClient } from './supabase';
import { runtimeEnvironment } from './webHandler';

export interface PublicApiDependencies {
  database: SupabaseClient;
  limits: ApiLimitsConfig;
  createRequestId(): string;
  now(): Date;
  authenticatedIdentity?: ApiKeyIdentity;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
export const MAX_PAGE_OFFSET = 10_000;

export const paginationFields = {
  limit: z.coerce.number().int('limit must be a whole number')
    .min(1, 'limit must be at least 1')
    .max(MAX_PAGE_LIMIT, `limit cannot exceed ${MAX_PAGE_LIMIT}`)
    .default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int('offset must be a whole number')
    .min(0, 'offset cannot be negative')
    .max(MAX_PAGE_OFFSET, `offset cannot exceed ${MAX_PAGE_OFFSET}`)
    .default(0),
};

export const createDefaultPublicApiDependencies = (): PublicApiDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(runtimeEnvironment);

  return {
    database: createSupabaseAdminClient(supabaseConfig),
    limits: getApiLimitsConfig(runtimeEnvironment),
    createRequestId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
};

export const createCorsHeaderAttacher = (allowedMethods: string) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': allowedMethods,
  };

  const withCorsHeaders = (response: HandlerResponse): HandlerResponse => ({
    ...response,
    headers: { ...corsHeaders, ...(response.headers ?? {}) },
  });

  const preflight = (): HandlerResponse =>
    withCorsHeaders({ statusCode: 204, headers: { Allow: allowedMethods }, body: '' });

  const methodNotAllowed = (requestId: string): HandlerResponse =>
    withCorsHeaders(jsonResponse(405, {
      error: { code: 'method_not_allowed', message: 'Method not allowed' },
      requestId,
    }, { Allow: allowedMethods }));

  return { withCorsHeaders, preflight, methodNotAllowed };
};

export const withRateHeaders = (
  context: ApiClientContext,
  response: HandlerResponse
): HandlerResponse => ({
  ...response,
  headers: { ...(response.headers ?? {}), ...context.rateLimit.headers },
});

export const parsePublicApiJsonObject = (
  body: string | null,
  objectSuggestedFix: string
): Record<string, unknown> => {
  if (!body) {
    return {};
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object', {}, {
        suggestedFix: objectSuggestedFix,
      });
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON', {}, {
      suggestedFix: 'Check JSON syntax, quotes, commas, and that Content-Type is application/json.',
    });
  }
};
