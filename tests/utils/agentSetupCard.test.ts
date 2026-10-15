import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../src/components/settings/AgentSetupCard.tsx', import.meta.url),
  'utf8'
);

test('Test API connection stays in the settings footer without a newly created key', () => {
  const footer = source.slice(source.indexOf('agent-setup-footer'));
  assert.ok(footer.includes('data-testid="test-api-connection"'));
  assert.ok(footer.includes("t('agentVerify')"));
  assert.equal(footer.includes('apiKey &&'), false);
  assert.ok(source.includes('agent-verify-key'));
  assert.ok(source.includes('pastedKey'));
});
