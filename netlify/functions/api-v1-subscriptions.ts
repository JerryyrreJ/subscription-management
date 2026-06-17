import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authenticateApiKey, type ApiClientContext } from './_shared/apiKeys';
import { getApiLimitsConfig, getSupabaseAdminConfig, type ApiLimitsConfig } from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import { createSupabaseAdminClient } from './_shared/supabase';
import { calculateNextPaymentDate } from '../../src/utils/dates';
import {
  SUBSCRIPTION_CURRENCIES,
  SUBSCRIPTION_PERIODS,
  subscriptionCreateInputSchema,
} from '../../src/utils/subscriptionDomain';

interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  amount: number | string;
  currency: string;
  period: string;
  last_payment_date: string;
  next_payment_date: string;
  custom_date: string | null;
  notification_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface SubscriptionsApiDependencies {
  database: SupabaseClient;
  limits: ApiLimitsConfig;
  createRequestId(): string;
  now(): Date;
}

const SUBSCRIPTION_COLUMNS = [
  'id',
  'user_id',
  'name',
  'category',
  'amount',
  'currency',
  'period',
  'last_payment_date',
  'next_payment_date',
  'custom_date',
  'notification_enabled',
  'created_at',
  'updated_at',
].join(', ');

const allowedSubscriptionFields = new Set([
  'name',
  'category',
  'amount',
  'currency',
  'period',
  'lastPaymentDate',
  'customDate',
  'notificationEnabled',
]);

const writableSubscriptionFields = Array.from(allowedSubscriptionFields).sort();

const subscriptionFieldGuidance: Record<string, string> = {
  name: 'Provide a non-empty subscription name, for example "Netflix" or "ChatGPT Plus".',
  category: 'Provide a short category label such as "Streaming", "Productivity", or "Developer Tools".',
  amount: 'Use a number in major currency units with at most 2 decimal places, for example 15.99.',
  currency: `Use one of the supported currency codes: ${SUBSCRIPTION_CURRENCIES.join(', ')}.`,
  period: `Use one of the supported billing periods: ${SUBSCRIPTION_PERIODS.join(', ')}.`,
  lastPaymentDate: 'Use the most recent payment date in YYYY-MM-DD format.',
  customDate: 'Use a positive whole-number string when period is custom; omit customDate for monthly or yearly subscriptions.',
  notificationEnabled: 'Use true or false. Omit the field to use the default value true.',
};

const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
};

const createDefaultDependencies = (): SubscriptionsApiDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(process.env);

  return {
    database: createSupabaseAdminClient(supabaseConfig),
    limits: getApiLimitsConfig(process.env),
    createRequestId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
};

const idSchema = z.string().uuid();

const parseSubscriptionId = (id: string): string => {
  const result = idSchema.safeParse(id);
  if (!result.success) {
    throw new HttpError(400, 'invalid_subscription_id', 'Subscription id must be a valid UUID', {}, {
      field: 'id',
      suggestedFix: 'Use an id returned by listSubscriptions or createSubscription.',
    });
  }

  return result.data;
};

const parseJsonObject = (body: string | null): Record<string, unknown> => {
  if (!body) {
    return {};
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object', {}, {
        suggestedFix: 'Send an object such as {"name":"Netflix","category":"Streaming","amount":15.99,"currency":"USD","period":"monthly","lastPaymentDate":"2026-06-01"}.',
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

const assertAllowedFields = (body: Record<string, unknown>): void => {
  const unknownField = Object.keys(body).find(key => !allowedSubscriptionFields.has(key));
  if (unknownField) {
    throw new HttpError(400, 'invalid_subscription_field', `Field is not writable: ${unknownField}`, {}, {
      field: unknownField,
      writableFields: writableSubscriptionFields,
      suggestedFix: 'Remove server-managed fields such as id, nextPaymentDate, createdAt, and updatedAt before retrying.',
    });
  }
};

const getValidationDetails = (error: z.ZodError) => {
  const issue = error.issues[0];
  const field = issue?.path.map(String).join('.') || undefined;

  return {
    field,
    allowedValues: field === 'currency'
      ? SUBSCRIPTION_CURRENCIES
      : field === 'period'
        ? SUBSCRIPTION_PERIODS
        : undefined,
    suggestedFix: field
      ? subscriptionFieldGuidance[field] ?? 'Correct the field value and retry the request.'
      : 'Validate the request body against the subscription write schema before retrying.',
  };
};

const parseSubscriptionPath = (path: string): string | null => {
  const normalizedPath = path.replace(/\/+$/, '');
  const publicMarker = '/api/v1/subscriptions';
  const functionMarker = '/.netlify/functions/api-v1-subscriptions';
  const marker = normalizedPath.includes(publicMarker) ? publicMarker : functionMarker;
  const markerIndex = normalizedPath.indexOf(marker);
  const suffix = markerIndex === -1
    ? ''
    : normalizedPath.slice(markerIndex + marker.length);
  const segments = suffix.split('/').filter(Boolean);

  if (segments.length > 1) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  return segments[0] ?? null;
};

const toApiSubscription = (row: SubscriptionRow) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  amount: Number(row.amount),
  currency: row.currency,
  period: row.period,
  lastPaymentDate: row.last_payment_date,
  nextPaymentDate: row.next_payment_date,
  customDate: row.custom_date ?? undefined,
  notificationEnabled: row.notification_enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toDatabasePayload = (
  parsed: z.infer<typeof subscriptionCreateInputSchema>
) => ({
  name: parsed.name,
  category: parsed.category,
  amount: parsed.amount,
  currency: parsed.currency,
  period: parsed.period,
  last_payment_date: parsed.lastPaymentDate,
  next_payment_date: calculateNextPaymentDate(
    parsed.lastPaymentDate,
    parsed.period,
    parsed.customDate
  ),
  custom_date: parsed.customDate || null,
  notification_enabled: parsed.notificationEnabled,
});

const getSubscription = async (
  database: SupabaseClient,
  userId: string,
  id: string
): Promise<SubscriptionRow> => {
  const { data, error } = await database
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle<SubscriptionRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new HttpError(404, 'subscription_not_found', 'Subscription not found');
  }

  return data;
};

const parseCreateInput = (body: Record<string, unknown>) => {
  assertAllowedFields(body);
  try {
    return subscriptionCreateInputSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HttpError(
        400,
        'invalid_subscription',
        error.issues[0]?.message || 'Subscription data is invalid',
        {},
        getValidationDetails(error)
      );
    }
    throw error;
  }
};

const parsePatchInput = (
  body: Record<string, unknown>,
  existing: ReturnType<typeof toApiSubscription>
) => {
  assertAllowedFields(body);
  if (Object.keys(body).length === 0) {
    throw new HttpError(400, 'empty_patch', 'PATCH body must include at least one writable field', {}, {
      writableFields: writableSubscriptionFields,
      suggestedFix: 'Send one or more writable fields, for example {"period":"yearly"} or {"amount":12.99}.',
    });
  }

  const merged: Record<string, unknown> = {
    name: existing.name,
    category: existing.category,
    amount: existing.amount,
    currency: existing.currency,
    period: existing.period,
    lastPaymentDate: existing.lastPaymentDate,
    customDate: existing.customDate,
    notificationEnabled: existing.notificationEnabled,
    ...body,
  };

  if (body.period && body.period !== 'custom' && !Object.hasOwn(body, 'customDate')) {
    merged.customDate = undefined;
  }

  return parseCreateInput(merged);
};

const withRateHeaders = (
  context: ApiClientContext,
  response: HandlerResponse
): HandlerResponse => ({
  ...response,
  headers: {
    ...(response.headers ?? {}),
    ...context.rateLimit.headers,
  },
});

const withCorsHeaders = (response: HandlerResponse): HandlerResponse => ({
  ...response,
  headers: {
    ...CORS_HEADERS,
    ...(response.headers ?? {}),
  },
});

export const createSubscriptionsApiHandler = (
  dependenciesFactory: () => SubscriptionsApiDependencies = createDefaultDependencies
): Handler => async (event: HandlerEvent): Promise<HandlerResponse> => {
  let requestId: string = crypto.randomUUID();
  let apiContext: ApiClientContext | null = null;

  if (event.httpMethod === 'OPTIONS') {
    return withCorsHeaders({
      statusCode: 204,
      headers: { Allow: ALLOWED_METHODS },
      body: '',
    });
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
    const context = await authenticateApiKey(
      event.headers,
      dependencies.database,
      dependencies.limits,
      dependencies.now(),
      requestId
    );
    apiContext = context;
    const subscriptionId = parseSubscriptionPath(event.path);

    if (event.httpMethod === 'GET' && !subscriptionId) {
      const { data, error } = await dependencies.database
        .from('subscriptions')
        .select(SUBSCRIPTION_COLUMNS)
        .eq('user_id', context.userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: ((data ?? []) as unknown as SubscriptionRow[]).map(toApiSubscription),
        requestId,
      })));
    }

    if (event.httpMethod === 'GET' && subscriptionId) {
      const id = parseSubscriptionId(subscriptionId);
      const subscription = await getSubscription(dependencies.database, context.userId, id);
      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: toApiSubscription(subscription),
        requestId,
      })));
    }

    if (event.httpMethod === 'POST') {
      if (subscriptionId) {
        throw new HttpError(404, 'not_found', 'Not found');
      }

      const parsed = parseCreateInput(parseJsonObject(event.body));
      const { data, error } = await dependencies.database
        .from('subscriptions')
        .insert({
          user_id: context.userId,
          ...toDatabasePayload(parsed),
        })
        .select(SUBSCRIPTION_COLUMNS)
        .single<SubscriptionRow>();

      if (error) {
        throw error;
      }

      logEvent('info', 'API subscription created', requestId, {
        apiKeyId: context.apiKeyId,
        userId: context.userId,
        subscriptionId: data.id,
      });

      return withCorsHeaders(withRateHeaders(context, jsonResponse(201, {
        data: toApiSubscription(data),
        requestId,
      })));
    }

    if (!subscriptionId) {
      throw new HttpError(404, 'not_found', 'Not found');
    }

    const id = parseSubscriptionId(subscriptionId);

    if (event.httpMethod === 'PATCH') {
      const existing = await getSubscription(dependencies.database, context.userId, id);
      const parsed = parsePatchInput(parseJsonObject(event.body), toApiSubscription(existing));
      const { data, error } = await dependencies.database
        .from('subscriptions')
        .update(toDatabasePayload(parsed))
        .eq('user_id', context.userId)
        .eq('id', id)
        .select(SUBSCRIPTION_COLUMNS)
        .single<SubscriptionRow>();

      if (error) {
        throw error;
      }

      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: toApiSubscription(data),
        requestId,
      })));
    }

    const { data, error } = await dependencies.database
      .from('subscriptions')
      .delete()
      .eq('user_id', context.userId)
      .eq('id', id)
      .select('id')
      .maybeSingle<{ id: string }>();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new HttpError(404, 'subscription_not_found', 'Subscription not found');
    }

    return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
      deleted: true,
      requestId,
    })));
  } catch (error) {
    logEvent('error', 'Subscriptions API request failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const response = errorResponse(error, requestId);
    return withCorsHeaders(apiContext ? withRateHeaders(apiContext, response) : response);
  }
};

export const handler = createSubscriptionsApiHandler();
