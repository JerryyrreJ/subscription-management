import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiConfig } from '../../netlify/functions/_shared/env.ts';

test('AI config prefers OpenRouter when an OpenRouter key is present', () => {
  const config = getAiConfig({
    OPENROUTER_API_KEY: 'sk-or-test',
    SITE_URL: 'https://subs.example.test',
    OPENROUTER_APP_TITLE: 'Subscription Manager',
  });

  assert.equal(config.provider, 'openrouter');
  assert.equal(config.apiKey, 'sk-or-test');
  assert.equal(config.model, 'google/gemini-2.5-flash-lite');
  assert.deepEqual(config.fallbackModels, ['google/gemini-2.5-flash']);
  assert.equal(config.openRouterSiteUrl, 'https://subs.example.test');
  assert.equal(config.openRouterAppTitle, 'Subscription Manager');
  assert.equal(config.inputUsdPerMillion, 0.1);
  assert.equal(config.outputUsdPerMillion, 0.4);
});

test('AI config allows overriding OpenRouter model and fallback order', () => {
  const config = getAiConfig({
    AI_PROVIDER: 'openrouter',
    OPENROUTER_API_KEY: 'sk-or-test',
    AI_MODEL: 'google/gemini-2.5-flash',
    AI_FALLBACK_MODELS: 'openai/gpt-5.4-nano, anthropic/claude-haiku-4.5',
    AI_INPUT_USD_PER_MTOK: '0.3',
    AI_OUTPUT_USD_PER_MTOK: '2.5',
  });

  assert.equal(config.provider, 'openrouter');
  assert.equal(config.model, 'google/gemini-2.5-flash');
  assert.deepEqual(config.fallbackModels, [
    'openai/gpt-5.4-nano',
    'anthropic/claude-haiku-4.5',
  ]);
  assert.equal(config.inputUsdPerMillion, 0.3);
  assert.equal(config.outputUsdPerMillion, 2.5);
});

test('AI config keeps Anthropic compatibility when only an Anthropic key exists', () => {
  const config = getAiConfig({ ANTHROPIC_API_KEY: 'sk-ant-test' });

  assert.equal(config.provider, 'anthropic');
  assert.equal(config.apiKey, 'sk-ant-test');
  assert.equal(config.model, 'claude-haiku-4-5');
  assert.deepEqual(config.fallbackModels, []);
  assert.equal(config.inputUsdPerMillion, 1);
  assert.equal(config.outputUsdPerMillion, 5);
});
