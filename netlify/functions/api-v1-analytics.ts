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
import {
  findDuplicates,
  optimizationCandidates,
  summarizeSpend,
  type InsightPeriod,
  type InsightStatus,
  type InsightSubscription,
} from '../../src/utils/subscriptionInsights';

interface AnalyticsRow {
  id: string;
  name: string;
  category: string;
  amount: number | string;
  currency: string;
  period: string;
  custom_date: string | null;
  next_payment_date: string;
  status: string;
}

interface AnalyticsApiDependencies {
  database: SupabaseClient;
  limits: ApiLimitsConfig;
  createRequestId(): string;
  now(): Date;
}

const ANALYTICS_COLUMNS = [
  'id',
  'name',
  'category',
  'amount',
  'currency',
  'period',
  'custom_date',
  'next_payment_date',
  'status',
].join(', ');

// Personal subscription sets are small; cap the analytics scan so a pathological
// account can never make one request unbounded.
const MAX_ANALYTICS_ROWS = 1000;

const ALLOWED_METHODS = 'GET, OPTIONS';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
};

const horizonSchema = z.object({
  horizonDays: z.coerce.number()
    .int('horizonDays must be a whole number')
    .min(1, 'horizonDays must be at least 1')
    .max(365, 'horizonDays cannot exceed 365')
    .default(30),
});

const createDefaultDependencies = (): AnalyticsApiDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(process.env);

  return {
    database: createSupabaseAdminClient(supabaseConfig),
    limits: getApiLimitsConfig(process.env),
    createRequestId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
};

type AnalyticsView = 'summary' | 'duplicates' | 'optimizations';

const parseAnalyticsView = (path: string): AnalyticsView => {
  const normalized = path.replace(/\/+$/, '');
  const publicMarker = '/api/v1/analytics';
  const functionMarker = '/.netlify/functions/api-v1-analytics';
  const marker = normalized.includes(publicMarker) ? publicMarker : functionMarker;
  const markerIndex = normalized.indexOf(marker);
  const suffix = markerIndex === -1 ? '' : normalized.slice(markerIndex + marker.length);
  const segments = suffix.split('/').filter(Boolean);
  const view = segments[0];

  if (segments.length === 1 && (view === 'summary' || view === 'duplicates' || view === 'optimizations')) {
    return view;
  }

  throw new HttpError(404, 'not_found', 'Not found', {}, {
    suggestedFix: 'Use /api/v1/analytics/summary, /api/v1/analytics/duplicates, or /api/v1/analytics/optimizations.',
  });
};

const parseHorizon = (query: HandlerEvent['queryStringParameters']): number => {
  const result = horizonSchema.safeParse(query ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, 'invalid_query', issue?.message || 'Invalid query parameters', {}, {
      field: issue?.path.map(String).join('.') || undefined,
      suggestedFix: 'Use horizonDays between 1 and 365, for example ?horizonDays=30.',
    });
  }

  return result.data.horizonDays;
};

const toInsightSubscription = (row: AnalyticsRow): InsightSubscription => ({
  id: row.id,
  name: row.name,
  category: row.category,
  amount: Number(row.amount),
  currency: row.currency,
  period: row.period as InsightPeriod,
  customDate: row.custom_date ?? undefined,
  nextPaymentDate: row.next_payment_date,
  status: row.status as InsightStatus,
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

export const createAnalyticsApiHandler = (
  dependenciesFactory: () => AnalyticsApiDependencies = createDefaultDependencies
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
    const view = parseAnalyticsView(event.path);
    const horizonDays = view === 'summary' ? parseHorizon(event.queryStringParameters) : 30;

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

    const { data, error } = await dependencies.database
      .from('subscriptions')
      .select(ANALYTICS_COLUMNS)
      .eq('user_id', identity.userId)
      .range(0, MAX_ANALYTICS_ROWS - 1);

    if (error) {
      throw error;
    }

    const subscriptions = ((data ?? []) as unknown as AnalyticsRow[]).map(toInsightSubscription);

    const payload =
      view === 'summary'
        ? { summary: summarizeSpend(subscriptions, now, horizonDays) }
        : view === 'duplicates'
          ? { duplicates: findDuplicates(subscriptions) }
          : { optimizations: optimizationCandidates(subscriptions) };

    return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
      ...payload,
      requestId,
    })));
  } catch (error) {
    logEvent('error', 'Analytics API request failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const response = errorResponse(error, requestId);
    return withCorsHeaders(apiContext ? withRateHeaders(apiContext, response) : response);
  }
};

export const handler = createAnalyticsApiHandler();
