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
import { hasValidBarkConfig } from '../../src/utils/barkSettings';
import { normalizeLocale } from '../../src/utils/locale';

interface NotificationSettingsRow {
  user_id: string;
  bark_enabled: boolean;
  bark_server_url: string | null;
  bark_device_key: string | null;
  bark_days_before: number;
  time_zone: string | null;
  locale: string | null;
  updated_at: string;
}

interface NotificationSettingsApiDependencies {
  database: SupabaseClient;
  limits: ApiLimitsConfig;
  createRequestId(): string;
  now(): Date;
}

const NOTIFICATION_SETTINGS_COLUMNS = [
  'user_id',
  'bark_enabled',
  'bark_server_url',
  'bark_device_key',
  'bark_days_before',
  'time_zone',
  'locale',
  'updated_at',
].join(', ');

export const NOTIFICATION_DAYS_BEFORE = [1, 3, 7, 14] as const;

const writableFields = ['daysBefore', 'enabled'] as const;

const rejectedWriteFields = new Set([
  'barkConfigured',
  'barkDeviceKey',
  'barkServerUrl',
  'barkUrl',
  'deviceKey',
  'locale',
  'notificationHistory',
  'serverUrl',
  'timeZone',
  'updatedAt',
]);

const ALLOWED_METHODS = 'GET, PATCH, OPTIONS';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
};

const BARK_SETUP_HINT =
  'Configure Bark in the web app under Settings → Notifications. Guide: /en/user-guide/reminders (中文: /zh-CN/user-guide/reminders). Bark URL and test push are not available through the public API.';

const createDefaultDependencies = (): NotificationSettingsApiDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(process.env);

  return {
    database: createSupabaseAdminClient(supabaseConfig),
    limits: getApiLimitsConfig(process.env),
    createRequestId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
};

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  daysBefore: z.number().int().refine(
    (value): value is (typeof NOTIFICATION_DAYS_BEFORE)[number] =>
      (NOTIFICATION_DAYS_BEFORE as readonly number[]).includes(value),
    {
      message: `daysBefore must be one of: ${NOTIFICATION_DAYS_BEFORE.join(', ')}`,
    }
  ).optional(),
}).strict();

const parseJsonObject = (body: string | null): Record<string, unknown> => {
  if (!body) {
    return {};
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'invalid_json', 'Request body must be a JSON object', {}, {
        suggestedFix: 'Send an object such as {"enabled":true,"daysBefore":3}.',
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

const assertWritableFields = (body: Record<string, unknown>): void => {
  for (const key of Object.keys(body)) {
    if (rejectedWriteFields.has(key) || !(writableFields as readonly string[]).includes(key)) {
      throw new HttpError(
        400,
        'invalid_notification_settings_field',
        `Field is not writable: ${key}`,
        {},
        {
          field: key,
          writableFields: [...writableFields],
          suggestedFix: rejectedWriteFields.has(key)
            ? `${key} is managed outside the public API. ${BARK_SETUP_HINT}`
            : `Only ${writableFields.join(' and ')} can be updated through this endpoint.`,
        }
      );
    }
  }
};

const toApiNotificationSettings = (row: NotificationSettingsRow) => {
  const serverUrl = row.bark_server_url ?? '';
  const deviceKey = row.bark_device_key ?? '';

  return {
    enabled: Boolean(row.bark_enabled),
    daysBefore: row.bark_days_before,
    timeZone: row.time_zone,
    locale: row.locale ? normalizeLocale(row.locale) : null,
    barkConfigured: hasValidBarkConfig({
      barkPush: {
        enabled: true,
        serverUrl,
        deviceKey,
        daysBefore: row.bark_days_before,
        notificationHistory: {},
      },
    }),
    updatedAt: row.updated_at,
  };
};

const getSettingsRow = async (
  database: SupabaseClient,
  userId: string
): Promise<NotificationSettingsRow> => {
  const { data, error } = await database
    .from('user_notification_settings')
    .select(NOTIFICATION_SETTINGS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle<NotificationSettingsRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new HttpError(
      404,
      'notification_settings_not_found',
      'Notification settings have not been configured yet',
      {},
      {
        suggestedFix: BARK_SETUP_HINT,
      }
    );
  }

  return data;
};

const parsePatchInput = (body: Record<string, unknown>) => {
  assertWritableFields(body);

  if (Object.keys(body).length === 0) {
    throw new HttpError(400, 'empty_patch', 'PATCH body must include at least one writable field', {}, {
      writableFields: [...writableFields],
      suggestedFix: 'Send {"enabled":true} and/or {"daysBefore":3}.',
    });
  }

  const result = patchSchema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.map(String).join('.') || undefined;
    throw new HttpError(
      400,
      'invalid_notification_settings',
      issue?.message || 'Notification settings are invalid',
      {},
      {
        field,
        allowedValues: field === 'daysBefore'
          ? NOTIFICATION_DAYS_BEFORE.map(String)
          : undefined,
        suggestedFix: field === 'daysBefore'
          ? `Use one of the supported reminder windows: ${NOTIFICATION_DAYS_BEFORE.join(', ')}.`
          : 'Correct the field value and retry the request.',
      }
    );
  }

  return result.data;
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

export const createNotificationSettingsApiHandler = (
  dependenciesFactory: () => NotificationSettingsApiDependencies = createDefaultDependencies
): Handler => async (event: HandlerEvent): Promise<HandlerResponse> => {
  let requestId: string = crypto.randomUUID();
  let apiContext: ApiClientContext | null = null;

  if (event.httpMethod === 'OPTIONS') {
    return withCorsHeaders({ statusCode: 204, headers: { Allow: ALLOWED_METHODS }, body: '' });
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'PATCH') {
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

    if (event.httpMethod === 'GET') {
      assertScope(identity.scopes, 'read');
    } else {
      assertScope(identity.scopes, 'write');
    }

    const context = await consumeApiRateLimit(dependencies.database, identity, now);
    apiContext = context;

    if (event.httpMethod === 'GET') {
      const row = await getSettingsRow(dependencies.database, identity.userId);
      return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
        data: toApiNotificationSettings(row),
        requestId,
      })));
    }

    const patch = parsePatchInput(parseJsonObject(event.body));
    const existing = await getSettingsRow(dependencies.database, identity.userId);

    const updatePayload: Record<string, unknown> = {};
    if (patch.enabled !== undefined) {
      updatePayload.bark_enabled = patch.enabled;
    }
    if (patch.daysBefore !== undefined) {
      updatePayload.bark_days_before = patch.daysBefore;
    }

    const { data, error } = await dependencies.database
      .from('user_notification_settings')
      .update(updatePayload)
      .eq('user_id', identity.userId)
      .select(NOTIFICATION_SETTINGS_COLUMNS)
      .maybeSingle<NotificationSettingsRow>();

    if (error) {
      throw error;
    }

    if (!data) {
      // Row disappeared between read and write; treat as not found.
      throw new HttpError(
        404,
        'notification_settings_not_found',
        'Notification settings have not been configured yet',
        {},
        { suggestedFix: BARK_SETUP_HINT }
      );
    }

    logEvent('info', 'Updated notification settings via public API', requestId, {
      userId: identity.userId,
      before: {
        enabled: existing.bark_enabled,
        daysBefore: existing.bark_days_before,
      },
      after: {
        enabled: data.bark_enabled,
        daysBefore: data.bark_days_before,
      },
    });

    return withCorsHeaders(withRateHeaders(context, jsonResponse(200, {
      data: toApiNotificationSettings(data),
      requestId,
    })));
  } catch (error) {
    logEvent('error', 'Notification settings API request failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    const response = errorResponse(error, requestId);
    return withCorsHeaders(apiContext ? withRateHeaders(apiContext, response) : response);
  }
};

export const handler = createNotificationSettingsApiHandler();
