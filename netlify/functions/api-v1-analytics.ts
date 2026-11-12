import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { z } from 'zod';
import {
  assertScope,
  consumeApiRateLimit,
  identifyApiKey,
  type ApiClientContext,
} from './_shared/apiKeys';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import {
  createCorsHeaderAttacher,
  createDefaultPublicApiDependencies,
  withRateHeaders,
  type PublicApiDependencies,
} from './_shared/publicApi';
import {
  findDuplicates,
  optimizationCandidates,
  summarizeSpend,
  type InsightPeriod,
  type InsightStatus,
  type InsightSubscription,
} from '../../src/utils/subscriptionInsights';
import { resolveSubscriptionRenewal } from '../../src/utils/subscriptionRenewal';

interface AnalyticsRow {
  id: string;
  name: string;
  category: string;
  amount: number | string;
  currency: string;
  period: string;
  billing_anchor_day?: number | null;
  custom_date: string | null;
  next_payment_date: string;
  is_trial?: boolean | null;
  trial_ends_on?: string | null;
  status: string;
}

type AnalyticsApiDependencies = PublicApiDependencies;

// Use '*' rather than naming newer columns (billing_anchor_day, is_trial,
// trial_ends_on) in the PostgREST select list so lagged migrations never trigger
// 42703 / HTTP 500; optional fields default safely in toInsightSubscription.
const ANALYTICS_COLUMNS = '*';

// Personal subscription sets are small; cap the analytics scan so a pathological
// account can never make one request unbounded.
const MAX_ANALYTICS_ROWS = 1000;

const ALLOWED_METHODS = 'GET, OPTIONS';
const { withCorsHeaders, preflight, methodNotAllowed } = createCorsHeaderAttacher(ALLOWED_METHODS);

const horizonSchema = z.object({
  horizonDays: z.coerce.number()
    .int('horizonDays must be a whole number')
    .min(1, 'horizonDays must be at least 1')
    .max(365, 'horizonDays cannot exceed 365')
    .default(30),
});

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

const toInsightSubscription = (row: AnalyticsRow, now: Date): InsightSubscription => {
  const status = (row.status ?? 'active') as InsightStatus;
  const period = row.period as InsightPeriod;
  const nextPaymentDate = status === 'active'
    ? resolveSubscriptionRenewal(
      {
        nextPaymentDate: row.next_payment_date,
        period,
        customDate: row.custom_date ?? undefined,
        billingAnchorDay: row.billing_anchor_day ?? undefined,
        isTrial: Boolean(row.is_trial),
        trialEndsOn: row.trial_ends_on ?? undefined,
      },
      'UTC',
      now
    ).effectiveNextPaymentDate
    : row.next_payment_date;

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    amount: Number(row.amount),
    currency: row.currency,
    period,
    customDate: row.custom_date ?? undefined,
    nextPaymentDate,
    isTrial: Boolean(row.is_trial),
    status,
  };
};

export const createAnalyticsApiHandler = (
  dependenciesFactory: () => AnalyticsApiDependencies = createDefaultPublicApiDependencies
): Handler => async (event: HandlerEvent): Promise<HandlerResponse> => {
  let requestId: string = crypto.randomUUID();
  let apiContext: ApiClientContext | null = null;

  if (event.httpMethod === 'OPTIONS') {
    return preflight();
  }

  if (event.httpMethod !== 'GET') {
    return methodNotAllowed(requestId);
  }

  try {
    const dependencies = dependenciesFactory();
    requestId = dependencies.createRequestId();
    const now = dependencies.now();
    const view = parseAnalyticsView(event.path);
    const horizonDays = view === 'summary' ? parseHorizon(event.queryStringParameters) : 30;

    const identity = dependencies.authenticatedIdentity ?? await identifyApiKey(
      event.headers,
      dependencies.database,
      dependencies.limits,
      now,
      requestId
    );
    assertScope(identity.scopes, 'read');

    if ((view === 'duplicates' || view === 'optimizations') && !identity.isPremium) {
      throw new HttpError(
        403,
        'premium_required',
        'Advanced analytics require Premium',
        {},
        {
          suggestedFix: 'Upgrade to Premium for duplicate detection and optimization insights, or use /api/v1/analytics/summary for basic spend totals.',
        }
      );
    }

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

    const subscriptions = ((data ?? []) as unknown as AnalyticsRow[]).map(row => toInsightSubscription(row, now));

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
