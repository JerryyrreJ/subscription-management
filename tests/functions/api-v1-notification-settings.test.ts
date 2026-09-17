import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationSettingsApiHandler } from '../../netlify/functions/api-v1-notification-settings.ts';
import { hashApiKey } from '../../netlify/functions/_shared/apiKeys.ts';
import {
  createFakeSupabaseClient,
  event,
  expectHandlerResponse,
  parseJsonResponse,
  type QueryState,
} from './apiTestHelpers.ts';

const apiKey = 'subm_test_api_key';
const apiKeyId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';

const limits = {
  freeRequestsPerHour: 60,
  premiumRequestsPerHour: 1000,
  freeActiveKeys: 1,
  premiumActiveKeys: 5,
  failedAuthRequestsPerHour: 300,
  rateLimitRetentionHours: 48,
};

const settingsRow = {
  user_id: userId,
  bark_enabled: true,
  bark_server_url: 'https://api.day.app',
  bark_device_key: 'device_key_abc',
  bark_days_before: 3,
  time_zone: 'Asia/Shanghai',
  locale: 'zh-CN',
  updated_at: '2026-06-16T00:00:00.000Z',
};

const createDatabase = (
  settingsResolver: (state: QueryState) => { data: unknown; error: { message: string } | null },
  options: {
    rateLimitAllowed?: boolean;
    lookupScopes?: string[];
  } = {}
) => createFakeSupabaseClient((state: QueryState) => {
  if (state.table === 'api_keys' && state.operation === 'update') {
    return { data: null, error: null };
  }

  if (state.table === 'user_profiles') {
    return { data: { is_premium: false }, error: null };
  }

  if (state.table === 'user_notification_settings') {
    return settingsResolver(state);
  }

  return { data: null, error: { message: `Unexpected query: ${state.table}` } };
}, (name, args) => {
  if (name === 'lookup_api_key_for_auth') {
    assert.equal(args.p_key_hash, hashApiKey(apiKey));
    return {
      data: [{
        limited: false,
        id: apiKeyId,
        user_id: userId,
        key_prefix: apiKey.slice(0, 14),
        scopes: options.lookupScopes ?? ['read', 'write'],
      }],
      error: null,
    };
  }

  assert.equal(name, 'consume_api_user_rate_limit');
  return {
    data: [{
      allowed: options.rateLimitAllowed ?? true,
      request_count: 1,
      remaining: 59,
      reset_at: '2026-06-16T01:00:00.000Z',
    }],
    error: null,
  };
});

test('reads notification settings without exposing Bark secrets', async () => {
  const database = createDatabase(() => ({ data: settingsRow, error: null }));
  const handler = createNotificationSettingsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-get',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'GET',
    '/api/v1/notification-settings',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{
    data: {
      enabled: boolean;
      daysBefore: number;
      timeZone: string | null;
      locale: string | null;
      barkConfigured: boolean;
      updatedAt: string;
    };
  }>(response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.data, {
    enabled: true,
    daysBefore: 3,
    timeZone: 'Asia/Shanghai',
    locale: 'zh-CN',
    barkConfigured: true,
    updatedAt: '2026-06-16T00:00:00.000Z',
  });
  assert.equal(Object.hasOwn(body.data as object, 'barkServerUrl'), false);
  assert.equal(Object.hasOwn(body.data as object, 'barkDeviceKey'), false);
});

test('returns 404 when notification settings have never been configured', async () => {
  const database = createDatabase(() => ({ data: null, error: null }));
  const handler = createNotificationSettingsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-missing',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'GET',
    '/api/v1/notification-settings',
    { authorization: `Bearer ${apiKey}` }
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string; suggestedFix?: string } }>(response);

  assert.equal(response.statusCode, 404);
  assert.equal(body.error.code, 'notification_settings_not_found');
  assert.match(body.error.suggestedFix ?? '', /Settings → Notifications/);
});

test('updates enabled and daysBefore', async () => {
  let updatePayload: Record<string, unknown> | undefined;
  const database = createDatabase((state: QueryState) => {
    if (state.operation === 'select') {
      return { data: settingsRow, error: null };
    }

    updatePayload = state.payload as Record<string, unknown>;
    return {
      data: {
        ...settingsRow,
        bark_enabled: false,
        bark_days_before: 7,
        updated_at: '2026-06-16T00:20:00.000Z',
      },
      error: null,
    };
  });
  const handler = createNotificationSettingsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-patch',
    now: () => new Date('2026-06-16T00:20:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'PATCH',
    '/api/v1/notification-settings',
    {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    JSON.stringify({ enabled: false, daysBefore: 7 })
  ), {} as never));
  const body = parseJsonResponse<{ data: { enabled: boolean; daysBefore: number } }>(response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(updatePayload, {
    bark_enabled: false,
    bark_days_before: 7,
  });
  assert.equal(body.data.enabled, false);
  assert.equal(body.data.daysBefore, 7);
});

test('rejects Bark URL and timezone writes', async () => {
  let settingsTouched = false;
  const database = createDatabase(() => {
    settingsTouched = true;
    return { data: settingsRow, error: null };
  });
  const handler = createNotificationSettingsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-reject',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'PATCH',
    '/api/v1/notification-settings',
    {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    JSON.stringify({ barkUrl: 'https://api.day.app/secret' })
  ), {} as never));
  const body = parseJsonResponse<{
    error: { code: string; field?: string; writableFields?: string[]; suggestedFix?: string };
  }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_notification_settings_field');
  assert.equal(body.error.field, 'barkUrl');
  assert.deepEqual(body.error.writableFields, ['daysBefore', 'enabled']);
  assert.match(body.error.suggestedFix ?? '', /Bark URL/);
  assert.equal(settingsTouched, false);

  const timezoneResponse = expectHandlerResponse(await handler(event(
    'PATCH',
    '/api/v1/notification-settings',
    {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    JSON.stringify({ timeZone: 'America/New_York' })
  ), {} as never));
  const timezoneBody = parseJsonResponse<{ error: { field?: string } }>(timezoneResponse);
  assert.equal(timezoneResponse.statusCode, 400);
  assert.equal(timezoneBody.error.field, 'timeZone');
});

test('rejects unsupported daysBefore values with recovery hints', async () => {
  const database = createDatabase(() => ({ data: settingsRow, error: null }));
  const handler = createNotificationSettingsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-days',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'PATCH',
    '/api/v1/notification-settings',
    {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    JSON.stringify({ daysBefore: 5 })
  ), {} as never));
  const body = parseJsonResponse<{
    error: { code: string; field?: string; allowedValues?: string[] };
  }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_notification_settings');
  assert.equal(body.error.field, 'daysBefore');
  assert.deepEqual(body.error.allowedValues, ['1', '3', '7', '14']);
});

test('rejects writes from a read-only API key', async () => {
  let settingsTouched = false;
  const database = createDatabase(() => {
    settingsTouched = true;
    return { data: settingsRow, error: null };
  }, { lookupScopes: ['read'] });
  const handler = createNotificationSettingsApiHandler(() => ({
    database,
    limits,
    createRequestId: () => 'request-readonly',
    now: () => new Date('2026-06-16T00:15:00.000Z'),
  }));

  const response = expectHandlerResponse(await handler(event(
    'PATCH',
    '/api/v1/notification-settings',
    {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    JSON.stringify({ enabled: false })
  ), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 403);
  assert.equal(body.error.code, 'insufficient_scope');
  assert.equal(settingsTouched, false);
});
