import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAgentAssets } from '../../scripts/agent-assets.ts';
import {
 buildAgentClientConfigSnippets,
 buildAgentSetupPrompt,
} from '../../src/utils/agentSetup.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('agent setup uses the current deployment, with no credential by default', () => {
 const prompt = buildAgentSetupPrompt({ origin: 'https://self-hosted.example:8443/', locale: 'zh-CN', mode: 'mcp' });
 assert.ok(prompt.includes('https://self-hosted.example:8443/agent/setup.md'));
 assert.ok(prompt.includes('https://self-hosted.example:8443/api/mcp'));
 assert.ok(prompt.includes('https://self-hosted.example:8443/downloads/steadyrenew-mcp.mjs'));
 assert.ok(prompt.includes('https://self-hosted.example:8443/downloads/subscription-manager-mcp.tgz'));
 assert.ok(!prompt.includes('sub.jerrylu.xyz'));
 assert.ok(!prompt.includes('SUBSCRIPTION_MANAGER_API_KEY='));
 assert.ok(prompt.includes('stdio MCP'));
 assert.ok(prompt.includes('idealTree'));
});

test('API-only setup and explicit key inclusion are supported in both languages', () => {
 for (const locale of ['en', 'zh-CN']) {
  const prompt = buildAgentSetupPrompt({ origin: 'http://localhost:8888', locale, mode: 'api', apiKey: 'subm_example.private' });
  assert.ok(prompt.includes('REST API'));
  assert.ok(prompt.includes('SUBSCRIPTION_MANAGER_API_KEY=subm_example.private'));
  assert.ok(prompt.includes('http://localhost:8888/agent/openapi.yaml'));
  assert.ok(prompt.includes('GET /api/v1/subscriptions?limit=1'));
  assert.ok(prompt.includes('idealTree'));
 }
});

test('read-only keys generate read-only onboarding instructions and manual client snippets', () => {
 const enReadOnly = buildAgentSetupPrompt({
  origin: 'https://steadyrenew.com',
  locale: 'en',
  mode: 'mcp',
  scopes: ['read'],
 });
 assert.match(enReadOnly, /read-only mode/i);
 assert.equal(enReadOnly.includes('create, update, and delete my cloud subscription records'), false);

 const zhReadOnly = buildAgentSetupPrompt({
  origin: 'https://steadyrenew.com',
  locale: 'zh-CN',
  mode: 'mcp',
  scopes: ['read'],
 });
 assert.ok(zhReadOnly.includes('只读'));
 assert.equal(zhReadOnly.includes('让我可以用自然语言查询、新增、修改和删除云端订阅记录'), false);

 const snippets = buildAgentClientConfigSnippets({ origin: 'https://steadyrenew.com' });
 assert.equal(snippets.remoteHttpUrl, 'https://steadyrenew.com/api/mcp');
 assert.ok(snippets.claudeCodeRemoteCmd.includes('--transport http steadyrenew https://steadyrenew.com/api/mcp'));
 assert.ok(snippets.claudeDesktopJson.includes('steadyrenew-mcp.mjs'));
 assert.ok(snippets.codexToml.includes('[mcp_servers.steadyrenew]'));
});

test('buildAgentAssets substitutes the deployment origin into /agent schemas and emits single-file MCP', () => {
 const assets = buildAgentAssets(repoRoot, 'https://custom-host.example:9443/app');
 const aiTools = JSON.parse(assets.get('/agent/ai-tools.json')!.toString('utf8')) as { baseUrl: string };
 const openApi = assets.get('/agent/openapi.yaml')!.toString('utf8');
 const singleFileMcp = assets.get('/downloads/steadyrenew-mcp.mjs')!.toString('utf8');

 assert.equal(aiTools.baseUrl, 'https://custom-host.example:9443');
 assert.match(openApi, /-\s*url:\s*https:\/\/custom-host\.example:9443/);
 assert.equal(openApi.includes('your-site.example'), false);
 assert.ok(singleFileMcp.startsWith('#!/usr/bin/env node'));
 assert.ok(singleFileMcp.includes('list_subscriptions'));
});
