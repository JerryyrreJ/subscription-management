import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentSetupPrompt } from '../../src/utils/agentSetup.ts';

test('agent setup uses the current deployment, with no credential by default', () => {
 const prompt = buildAgentSetupPrompt({ origin: 'https://self-hosted.example:8443/', locale: 'zh-CN', mode: 'mcp' });
 assert.ok(prompt.includes('https://self-hosted.example:8443/agent/setup.md'));
 assert.ok(prompt.includes('https://self-hosted.example:8443/downloads/subscription-manager-mcp.tgz'));
 assert.ok(!prompt.includes('sub.jerrylu.xyz'));
 assert.ok(!prompt.includes('SUBSCRIPTION_MANAGER_API_KEY='));
 assert.ok(prompt.includes('stdio MCP'));
});

test('API-only setup and explicit key inclusion are supported in both languages', () => {
 for (const locale of ['en', 'zh-CN']) {
  const prompt = buildAgentSetupPrompt({ origin: 'http://localhost:8888', locale, mode: 'api', apiKey: 'subm_example.private' });
  assert.ok(prompt.includes('REST API'));
  assert.ok(prompt.includes('SUBSCRIPTION_MANAGER_API_KEY=subm_example.private'));
  assert.ok(prompt.includes('http://localhost:8888/agent/openapi.yaml'));
  assert.ok(prompt.includes('GET /api/v1/subscriptions?limit=1'));
 }
});
