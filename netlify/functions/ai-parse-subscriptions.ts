import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticateRequest, type AuthClient } from './_shared/auth';
import {
  getAiConfig,
  getSupabaseAdminConfig,
  type AiConfig,
  type SupabaseAdminConfig,
  type SupabasePublicConfig,
} from './_shared/env';
import { errorResponse, HttpError, jsonResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import { createSupabaseAdminClient, createSupabaseAuthClient } from './_shared/supabase';
import { createParser, type CaptureInput, type SubscriptionParser } from './_shared/ai';

interface AiParseDependencies {
  supabaseConfig: SupabaseAdminConfig;
  database: SupabaseClient;
  aiConfig: AiConfig;
  parser: SubscriptionParser | null;
  createAuthClient(config: SupabasePublicConfig): AuthClient;
  createRequestId(): string;
  now(): Date;
}

interface ProfileRow {
  is_premium: boolean | null;
}

interface QuotaResult {
  allowed: boolean;
  request_count: number;
  remaining: number;
  reset_at: string;
}

interface CostRow {
  input_tokens: number | string | null;
  output_tokens: number | string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const describeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return { error: error.message };
  }

  if (isRecord(error)) {
    return {
      error: typeof error.message === 'string' ? error.message : 'Unknown error',
      code: typeof error.code === 'string' ? error.code : undefined,
      details: typeof error.details === 'string' ? error.details : undefined,
      hint: typeof error.hint === 'string' ? error.hint : undefined,
    };
  }

  return { error: 'Unknown error' };
};

const ALLOWED_METHODS = 'POST, OPTIONS';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
};

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const createDefaultDependencies = (): AiParseDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(process.env);
  const aiConfig = getAiConfig(process.env);

  return {
    supabaseConfig,
    database: createSupabaseAdminClient(supabaseConfig),
    aiConfig,
    parser: createParser(aiConfig),
    createAuthClient: createSupabaseAuthClient,
    createRequestId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
};

const withCorsHeaders = (response: HandlerResponse): HandlerResponse => ({
  ...response,
  headers: { ...CORS_HEADERS, ...(response.headers ?? {}) },
});

const pad = (value: number): string => String(value).padStart(2, '0');

const dateKeys = (now: Date) => {
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  return {
    today: `${year}-${month}-${day}`,
    day: `${year}-${month}-${day}`,
    month: `${year}-${month}-01`,
  };
};

// Decoded byte size of a base64 payload, without allocating the buffer.
const base64Bytes = (value: string): number => {
  const len = value.length;
  if (len === 0) {
    return 0;
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
};

const parseCaptureInput = (
  body: string | null,
  config: AiConfig
): CaptureInput => {
  let parsed: unknown;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON', {}, {
      suggestedFix: 'Send {"text":"Netflix 15.99/month"} or {"image":{"mediaType":"image/png","dataBase64":"..."}}.',
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'invalid_capture', 'Request body must be a JSON object', {}, {
      suggestedFix: 'Provide a text field, an image field, or both.',
    });
  }

  const record = parsed as Record<string, unknown>;
  const input: CaptureInput = {};

  if (record.text !== undefined && record.text !== null) {
    if (typeof record.text !== 'string') {
      throw new HttpError(400, 'invalid_capture', 'text must be a string', {}, { field: 'text' });
    }
    if (record.text.length > config.maxInputChars) {
      throw new HttpError(400, 'input_too_large', `text exceeds the ${config.maxInputChars}-character limit`, {}, {
        field: 'text',
        suggestedFix: 'Paste a smaller excerpt, or split it into a few captures.',
      });
    }
    if (record.text.trim()) {
      input.text = record.text;
    }
  }

  if (record.image !== undefined && record.image !== null) {
    if (typeof record.image !== 'object' || Array.isArray(record.image)) {
      throw new HttpError(400, 'invalid_capture', 'image must be an object', {}, { field: 'image' });
    }
    const image = record.image as Record<string, unknown>;
    const mediaType = typeof image.mediaType === 'string' ? image.mediaType : '';
    const dataBase64 = typeof image.dataBase64 === 'string' ? image.dataBase64 : '';
    if (!ALLOWED_IMAGE_TYPES.has(mediaType)) {
      throw new HttpError(400, 'invalid_capture', 'Unsupported image type', {}, {
        field: 'image.mediaType',
        allowedValues: [...ALLOWED_IMAGE_TYPES],
      });
    }
    if (!dataBase64) {
      throw new HttpError(400, 'invalid_capture', 'image.dataBase64 is required', {}, { field: 'image.dataBase64' });
    }
    if (base64Bytes(dataBase64) > config.maxImageBytes) {
      throw new HttpError(400, 'image_too_large', `image exceeds the ${config.maxImageBytes}-byte limit`, {}, {
        field: 'image',
        suggestedFix: 'Downscale or crop the screenshot before uploading.',
      });
    }
    input.image = { mediaType, dataBase64 };
  }

  if (!input.text && !input.image) {
    throw new HttpError(400, 'invalid_capture', 'Provide text or an image to parse', {}, {
      suggestedFix: 'Type a sentence, paste a statement, or attach a screenshot.',
    });
  }

  return input;
};

const unwrapQuota = (data: unknown): QuotaResult | null => {
  if (Array.isArray(data)) {
    return (data[0] as QuotaResult | undefined) ?? null;
  }
  return (data as QuotaResult | null) ?? null;
};

export const createAiParseHandler = (
  dependenciesFactory: () => AiParseDependencies = createDefaultDependencies
): Handler => async (event: HandlerEvent): Promise<HandlerResponse> => {
  let requestId: string = crypto.randomUUID();

  if (event.httpMethod === 'OPTIONS') {
    return withCorsHeaders({ statusCode: 204, headers: { Allow: ALLOWED_METHODS }, body: '' });
  }

  if (event.httpMethod !== 'POST') {
    return withCorsHeaders(jsonResponse(405, {
      error: { code: 'method_not_allowed', message: 'Method not allowed' },
      requestId,
    }, { Allow: ALLOWED_METHODS }));
  }

  try {
    const dependencies = dependenciesFactory();
    requestId = dependencies.createRequestId();
    const now = dependencies.now();

    const authenticated = await authenticateRequest(
      event.headers,
      dependencies.createAuthClient(dependencies.supabaseConfig)
    );

    // No key configured (e.g. a self-host without one) -> feature is off; the UI
    // falls back to the manual form.
    if (!dependencies.parser) {
      throw new HttpError(503, 'ai_unavailable', 'AI capture is not configured on this server', {}, {
        suggestedFix: 'Add subscriptions manually, or set ANTHROPIC_API_KEY to enable AI capture.',
      });
    }

    // Validate + cap input BEFORE consuming any quota, so malformed or oversized
    // requests never cost a parse.
    const input = parseCaptureInput(event.body, dependencies.aiConfig);

    const { today, day, month } = dateKeys(now);

    // Global monthly budget circuit breaker.
    const { data: costRow, error: costError } = await dependencies.database
      .from('ai_cost_windows')
      .select('input_tokens, output_tokens')
      .eq('window_start', month)
      .maybeSingle<CostRow>();
    if (costError) {
      throw costError;
    }
    const spentUsd =
      (Number(costRow?.input_tokens ?? 0) / 1_000_000) * dependencies.aiConfig.inputUsdPerMillion +
      (Number(costRow?.output_tokens ?? 0) / 1_000_000) * dependencies.aiConfig.outputUsdPerMillion;
    if (spentUsd >= dependencies.aiConfig.monthlyBudgetUsd) {
      throw new HttpError(503, 'ai_budget_exceeded', 'AI capture is paused for this month', {}, {
        suggestedFix: 'Add subscriptions manually. The monthly AI budget resets at the start of next month.',
      });
    }

    const { data: profile, error: profileError } = await dependencies.database
      .from('user_profiles')
      .select('is_premium')
      .eq('user_id', authenticated.userId)
      .maybeSingle<ProfileRow>();
    if (profileError) {
      throw profileError;
    }
    const isPremium = Boolean(profile?.is_premium);
    const limit = isPremium
      ? dependencies.aiConfig.premiumDailyParses
      : dependencies.aiConfig.freeDailyParses;

    // Per-user daily quota. Charged before the model call so abuse and model
    // failures can't run up an unbounded bill.
    const { data: quotaData, error: quotaError } = await dependencies.database.rpc('consume_ai_quota', {
      p_user_id: authenticated.userId,
      p_window_start: day,
      p_limit: limit,
    });
    if (quotaError) {
      throw quotaError;
    }
    const quota = unwrapQuota(quotaData);
    if (!quota) {
      throw new Error('AI quota RPC did not return a result');
    }
    if (!quota.allowed) {
      const retryAfter = Math.max(0, Math.ceil((new Date(quota.reset_at).getTime() - now.getTime()) / 1000));
      throw new HttpError(429, 'ai_quota_exceeded', `Daily AI capture limit reached (${limit})`, {
        'Retry-After': String(retryAfter),
      }, {
        suggestedFix: 'Add subscriptions manually, or upgrade for a higher daily limit. The limit resets at the listed time.',
      });
    }

    // The model call. Failures degrade to a friendly error; details are never
    // surfaced and the raw input is never logged.
    let result;
    try {
      result = await dependencies.parser.parse(input, today);
    } catch (parseError) {
      logEvent('error', 'AI parse failed', requestId, {
        userId: authenticated.userId,
        ...describeError(parseError),
      });
      throw new HttpError(502, 'ai_parse_failed', 'AI could not read that input', {}, {
        suggestedFix: 'Try clearer wording or a sharper screenshot, or add the subscription manually.',
      });
    }

    // Record token usage for the budget breaker (best-effort).
    try {
      const { error: recordError } = await dependencies.database.rpc('add_ai_cost', {
        p_window_start: month,
        p_input_tokens: result.usage.inputTokens,
        p_output_tokens: result.usage.outputTokens,
      });
      if (recordError) {
        throw new Error(recordError.message);
      }
    } catch (recordError) {
      logEvent('warn', 'Failed to record AI cost', requestId, {
        ...describeError(recordError),
      });
    }

    logEvent('info', 'AI capture parsed', requestId, {
      userId: authenticated.userId,
      drafts: result.drafts.length,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    return withCorsHeaders(jsonResponse(200, {
      drafts: result.drafts,
      quota: { remaining: quota.remaining, limit, resetAt: quota.reset_at },
      requestId,
    }));
  } catch (error) {
    // Never include the request body (it may contain a bank statement).
    logEvent('error', 'AI capture request failed', requestId, {
      ...describeError(error),
    });
    return withCorsHeaders(errorResponse(error, requestId));
  }
};

export const handler = createAiParseHandler();
