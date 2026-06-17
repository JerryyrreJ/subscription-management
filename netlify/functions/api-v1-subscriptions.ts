import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { assertScope, consumeApiRateLimit, identifyApiKey, type ApiClientContext } from './_shared/apiKeys';
import { getApiLimitsConfig, getSupabaseAdminConfig, type ApiLimitsConfig } from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import { recordAudit } from './_shared/audit';
import { createSupabaseAdminClient } from './_shared/supabase';
import { calculateNextPaymentDate } from '../../src/utils/dates';
import {
  SUBSCRIPTION_CURRENCIES,
  SUBSCRIPTION_PERIODS,
  SUBSCRIPTION_STATUSES,
  subscriptionCreateInputSchema,
  subscriptionPatchInputSchema,
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
  status: string;
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
  'status',
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
  'status',
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
  status: `Use one of the supported lifecycle states: ${SUBSCRIPTION_STATUSES.join(', ')}. Set cancelled to stop tracking without deleting history.`,
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

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

const paginationSchema = z.object({
  limit: z.coerce.number().int('limit must be a whole number')
    .min(1, 'limit must be at least 1')
    .max(MAX_PAGE_LIMIT, `limit cannot exceed ${MAX_PAGE_LIMIT}`)
    .default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int('offset must be a whole number')
    .min(0, 'offset cannot be negative')
    .default(0),
});

const parsePagination = (
  query: HandlerEvent['queryStringParameters']
): { limit: number; offset: number } => {
  const result = paginationSchema.safeParse(query ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, 'invalid_pagination', issue?.message || 'Invalid pagination parameters', {}, {
      field: issue?.path.map(String).join('.') || undefined,
      suggestedFix: `Use limit between 1 and ${MAX_PAGE_LIMIT} and a non-negative offset, for example ?limit=${DEFAULT_PAGE_LIMIT}&offset=0.`,
    });
  }

  return result.data;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  createdAt: 'created_at',
  nextPaymentDate: 'next_payment_date',
  amount: 'amount',
  name: 'name',
};

const SORT_OPTIONS = [
  'createdAt',
  '-createdAt',
  'nextPaymentDate',
  '-nextPaymentDate',
  'amount',
  '-amount',
  'name',
  '-name',
] as const;

const listFiltersSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  period: z.enum(SUBSCRIPTION_PERIODS).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  expiringBefore: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expiringBefore must use YYYY-MM-DD')
    .refine(value => !Number.isNaN(Date.parse(value)), 'expiringBefore is not a valid date')
    .optional(),
  sort: z.enum(SORT_OPTIONS).default('-createdAt'),
});

type ListFilters = z.infer<typeof listFiltersSchema>;

// Filters parse separately from pagination so each surface keeps its own error
// code (invalid_pagination vs invalid_query). Unknown keys are ignored by Zod,
// so limit/offset passing through here is harmless.
const parseListFilters = (
  query: HandlerEvent['queryStringParameters']
): ListFilters => {
  const result = listFiltersSchema.safeParse(query ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.map(String).join('.') || undefined;
    throw new HttpError(400, 'invalid_query', issue?.message || 'Invalid query parameters', {}, {
      field,
      allowedValues: field === 'status'
        ? SUBSCRIPTION_STATUSES
        : field === 'period'
          ? SUBSCRIPTION_PERIODS
          : field === 'sort'
            ? SORT_OPTIONS
            : undefined,
      suggestedFix: 'Supported filters: status, category, period, q (name search), expiringBefore (YYYY-MM-DD), and sort (e.g. -nextPaymentDate).',
    });
  }

  return result.data;
};

// Escape LIKE wildcards so a name search for "100% uptime" is treated literally.
const escapeLikePattern = (value: string): string =>
  value.replace(/[\\%_]/g, match => `\\${match}`);

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
        : field === 'status'
          ? SUBSCRIPTION_STATUSES
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
  status: row.status,
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
  status: parsed.status,
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

  let patch: Record<string, unknown>;
  try {
    patch = subscriptionPatchInputSchema.parse(body) as Record<string, unknown>;
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

  const merged: Record<string, unknown> = {
    name: existing.name,
    category: existing.category,
    amount: existing.amount,
    currency: existing.currency,
    period: existing.period,
    lastPaymentDate: existing.lastPaymentDate,
    customDate: existing.customDate,
    notificationEnabled: existing.notificationEnabled,
    status: existing.status,
  };

  for (const key of Object.keys(body)) {
    merged[key] = patch[key];
  }

  if (Object.hasOwn(body, 'period') && merged.period !== 'custom' && !Object.hasOwn(body, 'customDate')) {
    merged.customDate = undefined;
  }

  // Only re-check the period/customDate relationship when the patch touches it,
  // so updates to unrelated fields are never blocked by pre-existing data.
  if (Object.hasOwn(body, 'period') || Object.hasOwn(body, 'customDate')) {
    if (merged.period === 'custom' && !merged.customDate) {
      throw new HttpError(400, 'invalid_subscription', 'Custom period is required', {}, {
        field: 'customDate',
        suggestedFix: subscriptionFieldGuidance.customDate,
      });
    }

    if (merged.period !== 'custom' && merged.customDate) {
      throw new HttpError(400, 'invalid_subscription', 'Custom period is only allowed for custom billing', {}, {
        field: 'customDate',
        suggestedFix: subscriptionFieldGuidance.customDate,
      });
    }
  }

  return merged as z.infer<typeof subscriptionCreateInputSchema>;
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
    const now = dependencies.now();
    const identity = await identifyApiKey(
      event.headers,
      dependencies.database,
      dependencies.limits,
      now,
      requestId
    );
    const subscriptionId = parseSubscriptionPath(event.path);

    // Enforce the key's scope before any quota is consumed: read for GET,
    // write for POST/PATCH/DELETE. A 403 here never charges rate-limit budget.
    assertScope(identity.scopes, event.httpMethod === 'GET' ? 'read' : 'write');

    // Charge the hourly quota only once the request is known to be well-formed,
    // so malformed input (400s) never burns an agent's rate-limit budget.
    const consume = async (): Promise<ApiClientContext> => {
      const context = await consumeApiRateLimit(dependencies.database, identity, now);
      apiContext = context;
      return context;
    };

    if (event.httpMethod === 'GET' && !subscriptionId) {
      const { limit, offset } = parsePagination(event.queryStringParameters);
      const filters = parseListFilters(event.queryStringParameters);
      const context = await consume();

      let listQuery = dependencies.database
        .from('subscriptions')
        .select(SUBSCRIPTION_COLUMNS)
        .eq('user_id', identity.userId);

      if (filters.status) {
        listQuery = listQuery.eq('status', filters.status);
      }
      if (filters.category) {
        listQuery = listQuery.eq('category', filters.category);
      }
      if (filters.period) {
        listQuery = listQuery.eq('period', filters.period);
      }
      if (filters.q) {
        listQuery = listQuery.ilike('name', `%${escapeLikePattern(filters.q)}%`);
      }
      if (filters.expiringBefore) {
        listQuery = listQuery.lte('next_payment_date', filters.expiringBefore);
      }

      const ascending = !filters.sort.startsWith('-');
      const sortColumn = SORTABLE_COLUMNS[filters.sort.replace(/^-/, '')];
      const { data, error } = await listQuery
        .order(sortColumn, { ascending })
        .range(offset, offset + limit);

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as unknown as SubscriptionRow[];
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      const appliedFilters = Object.fromEntries(
        Object.entries({
          status: filters.status,
          category: filters.category,
          period: filters.period,
          q: filters.q,
          expiringBefore: filters.expiringBefore,
        }).filter(([, value]) => value !== undefined)
      );

      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: page.map(toApiSubscription),
        pagination: { limit, offset, hasMore },
        query: { sort: filters.sort, filters: appliedFilters },
        requestId,
      })));
    }

    if (event.httpMethod === 'GET' && subscriptionId) {
      const id = parseSubscriptionId(subscriptionId);
      const context = await consume();
      const subscription = await getSubscription(dependencies.database, identity.userId, id);
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
      const context = await consume();
      const { data, error } = await dependencies.database
        .from('subscriptions')
        .insert({
          user_id: identity.userId,
          ...toDatabasePayload(parsed),
        })
        .select(SUBSCRIPTION_COLUMNS)
        .single<SubscriptionRow>();

      if (error) {
        throw error;
      }

      logEvent('info', 'API subscription created', requestId, {
        apiKeyId: identity.apiKeyId,
        userId: identity.userId,
        subscriptionId: data.id,
      });

      const created = toApiSubscription(data);
      await recordAudit(dependencies.database, {
        userId: identity.userId,
        apiKeyId: identity.apiKeyId,
        action: 'subscription.create',
        subscriptionId: created.id,
        requestId,
        metadata: { after: created },
      }, now);

      return withCorsHeaders(withRateHeaders(context, jsonResponse(201, {
        data: created,
        requestId,
      })));
    }

    if (!subscriptionId) {
      throw new HttpError(404, 'not_found', 'Not found');
    }

    const id = parseSubscriptionId(subscriptionId);

    if (event.httpMethod === 'PATCH') {
      const existing = toApiSubscription(
        await getSubscription(dependencies.database, identity.userId, id)
      );
      const body = parseJsonObject(event.body);
      const parsed = parsePatchInput(body, existing);
      const context = await consume();

      // Recalculate the next payment date only when a field that affects it
      // changes; otherwise keep the stored value so unrelated edits don't move it.
      const billingChanged = ['lastPaymentDate', 'period', 'customDate']
        .some(field => Object.hasOwn(body, field));
      const payload = toDatabasePayload(parsed);
      if (!billingChanged) {
        payload.next_payment_date = existing.nextPaymentDate;
      }

      const { data, error } = await dependencies.database
        .from('subscriptions')
        .update(payload)
        .eq('user_id', identity.userId)
        .eq('id', id)
        .select(SUBSCRIPTION_COLUMNS)
        .single<SubscriptionRow>();

      if (error) {
        throw error;
      }

      const updated = toApiSubscription(data);
      await recordAudit(dependencies.database, {
        userId: identity.userId,
        apiKeyId: identity.apiKeyId,
        action: 'subscription.update',
        subscriptionId: updated.id,
        requestId,
        metadata: { before: existing, after: updated, patch: body },
      }, now);

      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: updated,
        requestId,
      })));
    }

    const existing = toApiSubscription(
      await getSubscription(dependencies.database, identity.userId, id)
    );
    const context = await consume();
    const { error } = await dependencies.database
      .from('subscriptions')
      .delete()
      .eq('user_id', identity.userId)
      .eq('id', id);

    if (error) {
      throw error;
    }

    await recordAudit(dependencies.database, {
      userId: identity.userId,
      apiKeyId: identity.apiKeyId,
      action: 'subscription.delete',
      subscriptionId: id,
      requestId,
      metadata: { before: existing },
    }, now);

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
