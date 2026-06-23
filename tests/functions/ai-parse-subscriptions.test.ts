import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';
import { createAiParseHandler } from '../../netlify/functions/ai-parse-subscriptions.ts';
import type { AiConfig } from '../../netlify/functions/_shared/env.ts';
import type { AuthClient } from '../../netlify/functions/_shared/auth.ts';
import type { SubscriptionParser } from '../../netlify/functions/_shared/ai/index.ts';
import {
  createFakeSupabaseClient,
  event,
  expectHandlerResponse,
  parseJsonResponse,
  type QueryState,
} from './apiTestHelpers.ts';

const userId = '11111111-1111-4111-8111-111111111111';

const aiConfig: AiConfig = {
  provider: 'anthropic',
  apiKey: 'test-key',
  model: 'claude-haiku-4-5',
  fallbackModels: [],
  openRouterSiteUrl: null,
  openRouterAppTitle: null,
  freeDailyParses: 20,
  premiumDailyParses: 200,
  maxInputChars: 100,
  maxImageBytes: 1000,
  monthlyBudgetUsd: 50,
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 5,
};

const authClient: AuthClient = {
  auth: {
    getUser: async () => ({ data: { user: { id: userId } as unknown as User }, error: null }),
  },
};

interface QuotaRow {
  allowed: boolean;
  request_count: number;
  remaining: number;
  reset_at: string;
}

interface BuildOptions {
  parser?: SubscriptionParser | null;
  costRow?: { input_tokens: number; output_tokens: number } | null;
  quota?: QuotaRow;
  queryResolver?: (state: QueryState) => { data: unknown; error: { message: string } | null };
}

const buildHandler = (opts: BuildOptions = {}) => {
  const flags = { parseCalled: false, consumeCalled: false, addCostCalled: false };

  const parser: SubscriptionParser | null = opts.parser !== undefined ? opts.parser : {
    parse: async () => {
      flags.parseCalled = true;
      return {
        command: {
          type: 'create',
          drafts: [{
            name: 'Netflix', category: 'Streaming', amount: 15.99, currency: 'USD',
            period: 'monthly', lastPaymentDate: '2026-06-01', notificationEnabled: true, warnings: [],
          }],
        },
        usage: { inputTokens: 120, outputTokens: 40 },
      };
    },
  };

  const quota: QuotaRow = opts.quota ?? { allowed: true, request_count: 1, remaining: 19, reset_at: '2026-06-20T00:00:00.000Z' };
  const costRow = opts.costRow ?? null;

  const defaultQueryResolver = (state: QueryState) => {
    if (state.table === 'user_profiles') {
      return { data: { is_premium: false }, error: null };
    }
    if (state.table === 'ai_cost_windows') {
      return { data: costRow, error: null };
    }
    return { data: null, error: { message: `Unexpected query: ${state.table}` } };
  };

  const database = createFakeSupabaseClient(opts.queryResolver ?? defaultQueryResolver, (name) => {
    if (name === 'consume_ai_quota') {
      flags.consumeCalled = true;
      return { data: [quota], error: null };
    }
    if (name === 'add_ai_cost') {
      flags.addCostCalled = true;
      return { data: [{ input_tokens: 120, output_tokens: 40, request_count: 1 }], error: null };
    }
    return { data: null, error: null };
  });

  const handler = createAiParseHandler(() => ({
    supabaseConfig: { url: 'https://x.test', publishableKey: 'p', secretKey: 's' },
    database,
    aiConfig,
    parser,
    createAuthClient: () => authClient,
    createRequestId: () => 'req-ai',
    now: () => new Date('2026-06-19T12:00:00.000Z'),
  }));

  return { handler, flags };
};

const postEvent = (body: unknown) => event(
  'POST',
  '/.netlify/functions/ai-parse-subscriptions',
  { authorization: 'Bearer token', 'content-type': 'application/json' },
  JSON.stringify(body)
);

test('parses a capture and returns command + remaining quota', async () => {
  const { handler, flags } = buildHandler();
  const response = expectHandlerResponse(await handler(postEvent({ text: 'Netflix 15.99 monthly' }), {} as never));
  const body = parseJsonResponse<{ command: { type: string; drafts: Array<{ name: string }> }; quota: { remaining: number; limit: number } }>(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.command.type, 'create');
  assert.equal(body.command.drafts.length, 1);
  assert.equal(body.command.drafts[0].name, 'Netflix');
  assert.equal(body.quota.remaining, 19);
  assert.equal(body.quota.limit, 20);
  assert.equal(flags.parseCalled, true);
  assert.equal(flags.addCostCalled, true);
});

test('passes current subscriptions context into the parser', async () => {
  let receivedCount = 0;
  const { handler } = buildHandler({
    parser: {
      parse: async (input) => {
        receivedCount = input.subscriptions.length;
        return {
          command: { type: 'delete', subscriptionId: input.subscriptions[0]?.id ?? '' },
          usage: { inputTokens: 20, outputTokens: 10 },
        };
      },
    },
  });
  const response = expectHandlerResponse(await handler(postEvent({
    text: 'delete Warmcar',
    subscriptions: [{
      id: 'sub-warmcar',
      name: 'Warmcar',
      category: 'Entertainment',
      amount: 99,
      currency: 'CNY',
      period: 'custom',
      lastPaymentDate: '2026-06-13',
      customDate: '90',
      notificationEnabled: true,
    }],
  }), {} as never));
  const body = parseJsonResponse<{ command: { type: string; subscriptionId: string } }>(response);

  assert.equal(response.statusCode, 200);
  assert.equal(receivedCount, 1);
  assert.equal(body.command.type, 'delete');
  assert.equal(body.command.subscriptionId, 'sub-warmcar');
});

test('returns 503 when no model is configured', async () => {
  const { handler, flags } = buildHandler({ parser: null });
  const response = expectHandlerResponse(await handler(postEvent({ text: 'Netflix' }), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 503);
  assert.equal(body.error.code, 'ai_unavailable');
  assert.equal(flags.parseCalled, false);
});

test('rejects oversized text before consuming quota or calling the model', async () => {
  const { handler, flags } = buildHandler();
  const response = expectHandlerResponse(await handler(postEvent({ text: 'a'.repeat(101) }), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'input_too_large');
  assert.equal(flags.consumeCalled, false);
  assert.equal(flags.parseCalled, false);
});

test('pauses when the monthly budget is exceeded', async () => {
  // 100M input tokens * $1/MTok = $100 >= $50 budget
  const { handler, flags } = buildHandler({ costRow: { input_tokens: 100_000_000, output_tokens: 0 } });
  const response = expectHandlerResponse(await handler(postEvent({ text: 'Netflix' }), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 503);
  assert.equal(body.error.code, 'ai_budget_exceeded');
  assert.equal(flags.consumeCalled, false);
  assert.equal(flags.parseCalled, false);
});

test('returns 503 when Supabase database queries cannot connect', async () => {
  const { handler, flags } = buildHandler({
    queryResolver: (state) => {
      if (state.table === 'user_profiles') {
        throw new TypeError('fetch failed');
      }
      if (state.table === 'ai_cost_windows') {
        return { data: null, error: null };
      }
      return { data: null, error: { message: `Unexpected query: ${state.table}` } };
    },
  });
  const response = expectHandlerResponse(await handler(postEvent({ text: 'Netflix' }), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 503);
  assert.equal(body.error.code, 'database_unavailable');
  assert.equal(flags.parseCalled, false);
});

test('returns 429 with Retry-After when the daily quota is exhausted', async () => {
  const { handler, flags } = buildHandler({ quota: { allowed: false, request_count: 20, remaining: 0, reset_at: '2026-06-20T00:00:00.000Z' } });
  const response = expectHandlerResponse(await handler(postEvent({ text: 'Netflix' }), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 429);
  assert.equal(body.error.code, 'ai_quota_exceeded');
  assert.ok(response.headers?.['Retry-After']);
  assert.equal(flags.parseCalled, false);
});

test('returns 503 when the configured AI provider cannot connect', async () => {
  const { handler } = buildHandler({
    parser: {
      parse: async () => {
        throw new TypeError('fetch failed');
      },
    },
  });
  const response = expectHandlerResponse(await handler(postEvent({ text: 'Netflix' }), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 503);
  assert.equal(body.error.code, 'ai_provider_unavailable');
});

test('rejects an empty capture', async () => {
  const { handler } = buildHandler();
  const response = expectHandlerResponse(await handler(postEvent({}), {} as never));
  const body = parseJsonResponse<{ error: { code: string } }>(response);

  assert.equal(response.statusCode, 400);
  assert.equal(body.error.code, 'invalid_capture');
});

test('handles preflight and rejects non-POST methods', async () => {
  const { handler } = buildHandler();

  const preflight = expectHandlerResponse(await handler(event('OPTIONS', '/.netlify/functions/ai-parse-subscriptions'), {} as never));
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers?.['Access-Control-Allow-Origin'], '*');

  const get = expectHandlerResponse(await handler(event('GET', '/.netlify/functions/ai-parse-subscriptions', { authorization: 'Bearer token' }), {} as never));
  assert.equal(get.statusCode, 405);
});
