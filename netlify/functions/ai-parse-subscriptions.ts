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
import { errorResponse, HttpError, isNetworkFetchError, jsonResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import { createSupabaseAdminClient, createSupabaseAuthClient } from './_shared/supabase';
import { createParser, type CaptureInput, type SubscriptionParser } from './_shared/ai';
import type { AiSubscriptionContextItem } from '../../src/utils/aiCommand';
import { calculateNextPaymentDate } from '../../src/utils/dates';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS } from '../../src/utils/subscriptionDomain';

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

interface BudgetReservation {
  allowed: boolean;
  input_tokens: number | string;
  output_tokens: number | string;
  request_count: number;
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
const MAX_CONTEXT_SUBSCRIPTIONS = 200;
const MAX_OUTPUT_TOKENS = 1024;

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
  const input: CaptureInput = { subscriptions: [] };

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

  if (record.subscriptions !== undefined && record.subscriptions !== null) {
    if (!Array.isArray(record.subscriptions)) {
      throw new HttpError(400, 'invalid_capture', 'subscriptions must be an array', {}, { field: 'subscriptions' });
    }

    input.subscriptions = record.subscriptions
      .slice(0, MAX_CONTEXT_SUBSCRIPTIONS)
      .map((item): AiSubscriptionContextItem | null => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const subscription = item as Record<string, unknown>;
        const id = typeof subscription.id === 'string' ? subscription.id.trim() : '';
        const name = typeof subscription.name === 'string' ? subscription.name.trim().slice(0, 120) : '';
        const category = typeof subscription.category === 'string' ? subscription.category.trim().slice(0, 80) : '';
        const amount = Number(subscription.amount);
        const currency = typeof subscription.currency === 'string' ? subscription.currency.toUpperCase() : '';
        const period = typeof subscription.period === 'string' ? subscription.period.toLowerCase() : '';
        const lastPaymentDate = typeof subscription.lastPaymentDate === 'string' ? subscription.lastPaymentDate : '';
        const nextPaymentDate = typeof subscription.nextPaymentDate === 'string'
          ? subscription.nextPaymentDate
          : '';
        const customDate = typeof subscription.customDate === 'string' ? subscription.customDate : undefined;

        if (
          !id ||
          !name ||
          !Number.isFinite(amount) ||
          !(SUBSCRIPTION_CURRENCIES as readonly string[]).includes(currency) ||
          !(SUBSCRIPTION_PERIODS as readonly string[]).includes(period) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(lastPaymentDate)
        ) {
          return null;
        }

        return {
          id,
          name,
          category,
          amount,
          currency: currency as AiSubscriptionContextItem['currency'],
          period: period as AiSubscriptionContextItem['period'],
          lastPaymentDate,
          nextPaymentDate: /^\d{4}-\d{2}-\d{2}$/.test(nextPaymentDate)
            ? nextPaymentDate
            : calculateNextPaymentDate(lastPaymentDate, period, customDate),
          customDate,
          notificationEnabled: subscription.notificationEnabled === undefined
            ? true
            : Boolean(subscription.notificationEnabled),
        };
      })
      .filter((subscription): subscription is AiSubscriptionContextItem => Boolean(subscription));
  }

  return input;
};

const unwrapQuota = (data: unknown): QuotaResult | null => {
  if (Array.isArray(data)) {
    return (data[0] as QuotaResult | undefined) ?? null;
  }
  return (data as QuotaResult | null) ?? null;
};

const unwrapBudgetReservation = (data: unknown): BudgetReservation | null => {
  if (Array.isArray(data)) {
    return (data[0] as BudgetReservation | undefined) ?? null;
  }
  return (data as BudgetReservation | null) ?? null;
};

const estimateTokenReservation = (input: CaptureInput): { inputTokens: number; outputTokens: number } => {
  const textChars = input.text?.length ?? 0;
  const contextChars = JSON.stringify(input.subscriptions).length;
  const imageTokens = input.image ? Math.ceil(base64Bytes(input.image.dataBase64) / 3) : 0;

  return {
    inputTokens: Math.max(1, Math.ceil((textChars + contextChars) / 4) + imageTokens),
    outputTokens: MAX_OUTPUT_TOKENS,
  };
};

const runDatabaseRequest = async <T>(operation: () => PromiseLike<T> | T): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (isNetworkFetchError(error)) {
      throw new HttpError(503, 'database_unavailable', 'Database service is temporarily unavailable', {}, {
        suggestedFix: 'Check the network connection to Supabase and try again.',
      });
    }
    throw error;
  }
};

const releaseBudgetReservation = async (
  database: SupabaseClient,
  month: string,
  reserved: { inputTokens: number; outputTokens: number },
  requestId: string
): Promise<void> => {
  try {
    const { error: releaseError } = await runDatabaseRequest(() => database.rpc('adjust_ai_cost', {
      p_window_start: month,
      p_input_token_delta: -reserved.inputTokens,
      p_output_token_delta: -reserved.outputTokens,
    }));
    if (releaseError) {
      throw new Error(releaseError.message);
    }
  } catch (releaseError) {
    logEvent('warn', 'Failed to release AI budget reservation', requestId, {
      ...describeError(releaseError),
    });
  }
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

    const { data: profile, error: profileError } = await runDatabaseRequest(() => dependencies.database
      .from('user_profiles')
      .select('is_premium')
      .eq('user_id', authenticated.userId)
      .maybeSingle<ProfileRow>());
    if (profileError) {
      throw profileError;
    }
    const isPremium = Boolean(profile?.is_premium);
    const limit = isPremium
      ? dependencies.aiConfig.premiumDailyParses
      : dependencies.aiConfig.freeDailyParses;

    // Reserve the estimated request cost before calling the provider. This closes
    // the concurrency race where many requests could all observe the same old
    // monthly spend and then enter the model call together.
    const reserved = estimateTokenReservation(input);
    const { data: budgetData, error: budgetError } = await runDatabaseRequest(() => dependencies.database.rpc('reserve_ai_budget', {
      p_window_start: month,
      p_estimated_input_tokens: reserved.inputTokens,
      p_estimated_output_tokens: reserved.outputTokens,
      p_monthly_budget_usd: dependencies.aiConfig.monthlyBudgetUsd,
      p_input_usd_per_million: dependencies.aiConfig.inputUsdPerMillion,
      p_output_usd_per_million: dependencies.aiConfig.outputUsdPerMillion,
    }));
    if (budgetError) {
      throw budgetError;
    }
    const budgetReservation = unwrapBudgetReservation(budgetData);
    if (!budgetReservation) {
      throw new Error('AI budget reservation RPC did not return a result');
    }
    if (!budgetReservation.allowed) {
      throw new HttpError(503, 'ai_budget_exceeded', 'AI capture is paused for this month', {}, {
        suggestedFix: 'Add subscriptions manually. The monthly AI budget resets at the start of next month.',
      });
    }

    // Per-user daily quota. Charged before the model call so abuse and model
    // failures can't run up an unbounded bill. If this step fails after budget
    // reservation, release the reservation because no provider call will happen.
    let quota: QuotaResult;
    try {
      const { data: quotaData, error: quotaError } = await runDatabaseRequest(() => dependencies.database.rpc('consume_ai_quota', {
        p_user_id: authenticated.userId,
        p_window_start: day,
        p_limit: limit,
      }));
      if (quotaError) {
        throw quotaError;
      }
      const quotaResult = unwrapQuota(quotaData);
      if (!quotaResult) {
        throw new Error('AI quota RPC did not return a result');
      }
      if (!quotaResult.allowed) {
        const retryAfter = Math.max(0, Math.ceil((new Date(quotaResult.reset_at).getTime() - now.getTime()) / 1000));
        throw new HttpError(429, 'ai_quota_exceeded', `Daily AI capture limit reached (${limit})`, {
          'Retry-After': String(retryAfter),
        }, {
          suggestedFix: 'Add subscriptions manually, or upgrade for a higher daily limit. The limit resets at the listed time.',
        });
      }
      quota = quotaResult;
    } catch (quotaError) {
      await releaseBudgetReservation(dependencies.database, month, reserved, requestId);
      throw quotaError;
    }

    // The model call. Failures degrade to a friendly error; details are never
    // surfaced and the raw input is never logged.
    let result;
    try {
      result = await dependencies.parser.parse(input, today);
    } catch (parseError) {
      await releaseBudgetReservation(dependencies.database, month, reserved, requestId);
      logEvent('error', 'AI parse failed', requestId, {
        userId: authenticated.userId,
        ...describeError(parseError),
      });
      if (isNetworkFetchError(parseError)) {
        throw new HttpError(503, 'ai_provider_unavailable', 'AI provider is temporarily unavailable', {}, {
          suggestedFix: 'Check the network connection to the configured AI provider and try again.',
        });
      }
      throw new HttpError(502, 'ai_parse_failed', 'AI could not read that input', {}, {
        suggestedFix: 'Try clearer wording or a sharper screenshot, or add the subscription manually.',
      });
    }

    // Replace the reservation with the provider-reported usage (best-effort).
    // If this adjustment fails, the reservation stays in place conservatively.
    try {
      const { error: recordError } = await runDatabaseRequest(() => dependencies.database.rpc('adjust_ai_cost', {
        p_window_start: month,
        p_input_token_delta: result.usage.inputTokens - reserved.inputTokens,
        p_output_token_delta: result.usage.outputTokens - reserved.outputTokens,
      }));
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
      commandType: result.command.type,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    return withCorsHeaders(jsonResponse(200, {
      command: result.command,
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
