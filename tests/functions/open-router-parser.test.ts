import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterParser } from '../../netlify/functions/_shared/ai/openRouterParser.ts';
import type { AiConfig } from '../../netlify/functions/_shared/env.ts';

const config: AiConfig = {
  provider: 'openrouter',
  apiKey: 'sk-or-test',
  model: 'google/gemini-2.5-flash-lite',
  fallbackModels: ['google/gemini-2.5-flash'],
  openRouterSiteUrl: 'https://subs.example.test',
  openRouterAppTitle: 'Subscription Manager',
  freeDailyParses: 20,
  premiumDailyParses: 200,
  maxInputChars: 20000,
  maxImageBytes: 4 * 1024 * 1024,
  monthlyBudgetUsd: 50,
  inputUsdPerMillion: 0.1,
  outputUsdPerMillion: 0.4,
};

test('OpenRouter parser sends multimodal JSON-schema request with model fallbacks', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedHeaders = new Headers();
  let capturedBody: Record<string, unknown> = {};

  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            subscriptions: [{
              name: 'Netflix',
              category: 'Streaming',
              amount: 15.99,
              currency: 'USD',
              period: 'monthly',
              lastPaymentDate: '2026-06-01',
            }],
          }),
        },
      }],
      usage: { prompt_tokens: 321, completion_tokens: 45 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const parser = createOpenRouterParser(config);
    const result = await parser.parse({
      text: 'Netflix $15.99 monthly',
      image: { mediaType: 'image/png', dataBase64: 'abc123' },
    }, '2026-06-19');

    assert.equal(capturedUrl, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(capturedHeaders.get('Authorization'), 'Bearer sk-or-test');
    assert.equal(capturedHeaders.get('HTTP-Referer'), 'https://subs.example.test');
    assert.equal(capturedHeaders.get('X-Title'), 'Subscription Manager');
    assert.deepEqual(capturedBody.models, [
      'google/gemini-2.5-flash-lite',
      'google/gemini-2.5-flash',
    ]);
    assert.deepEqual(capturedBody.provider, { require_parameters: true });
    assert.equal((capturedBody.response_format as { type: string }).type, 'json_schema');

    const messages = capturedBody.messages as Array<{ role: string; content: unknown }>;
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
    const content = messages[1].content as Array<Record<string, unknown>>;
    assert.equal(content[0].type, 'image_url');
    assert.deepEqual(content[0].image_url, { url: 'data:image/png;base64,abc123' });
    assert.equal(content[1].type, 'text');
    assert.match(String(content[1].text), /Current date: 2026-06-19/);

    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0].name, 'Netflix');
    assert.equal(result.usage.inputTokens, 321);
    assert.equal(result.usage.outputTokens, 45);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenRouter parser throws provider errors without exposing input content', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: 'No available provider found' },
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const parser = createOpenRouterParser(config);
    await assert.rejects(
      parser.parse({ text: 'private statement text' }, '2026-06-19'),
      /No available provider found/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
