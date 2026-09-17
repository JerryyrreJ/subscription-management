import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUBSCRIPTION_CURRENCIES,
  SUBSCRIPTION_PERIODS,
  SUBSCRIPTION_STATUSES,
} from '../../src/utils/subscriptionDomain.ts';

interface ToolDef {
  name: string;
  operationId?: string;
  method: string;
  path: string;
  purpose?: string;
  riskLevel?: string;
  requiresConfirmation?: boolean;
  requiredScope?: string;
  fixedBody?: { status: string };
  parameters?: { properties?: Record<string, { enum?: readonly string[] }> };
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const schema = JSON.parse(
  readFileSync(join(repoRoot, 'docs-site', 'api', 'ai-tools.json'), 'utf8')
);
const tools: ToolDef[] = schema.tools;

// Every route an agent tool is allowed to address. Keeping this list here means a
// tool pointing at a path the API does not serve fails the suite.
const KNOWN_ROUTES = new Set([
  'GET /api/v1/subscriptions',
  'GET /api/v1/subscriptions/{id}',
  'POST /api/v1/subscriptions',
  'PATCH /api/v1/subscriptions/{id}',
  'DELETE /api/v1/subscriptions/{id}',
  'GET /api/v1/notification-settings',
  'PATCH /api/v1/notification-settings',
  'GET /api/v1/analytics/summary',
  'GET /api/v1/analytics/duplicates',
  'GET /api/v1/analytics/optimizations',
  'GET /api/v1/audit',
]);

const VALID_RISK = new Set(['low', 'medium', 'high']);

test('every tool is well-formed and maps to a real route', () => {
  assert.ok(Array.isArray(tools) && tools.length > 0);

  for (const tool of tools) {
    assert.ok(tool.name, 'tool has a name');
    assert.ok(tool.purpose, `${tool.name} has a purpose`);
    assert.ok(VALID_RISK.has(tool.riskLevel ?? ''), `${tool.name} has a valid riskLevel`);
    assert.equal(typeof tool.requiresConfirmation, 'boolean', `${tool.name} declares requiresConfirmation`);
    assert.ok(tool.parameters && typeof tool.parameters === 'object', `${tool.name} has parameters`);
    assert.ok(
      KNOWN_ROUTES.has(`${tool.method} ${tool.path}`),
      `${tool.name} maps to a known route (${tool.method} ${tool.path})`
    );
  }
});

test('write tools require confirmation and the write scope', () => {
  const writeMethods = new Set(['POST', 'PATCH', 'DELETE']);
  for (const tool of tools) {
    if (writeMethods.has(tool.method)) {
      assert.equal(tool.requiresConfirmation, true, `${tool.name} requires confirmation`);
      assert.equal(tool.requiredScope, 'write', `${tool.name} requires the write scope`);
    } else {
      assert.equal(tool.requiresConfirmation, false, `${tool.name} (read) needs no confirmation`);
    }
  }
});

test('the AI tool schema no longer exposes status-changing write helpers', () => {
  const statusTools = tools.filter((tool) => tool.fixedBody);
  assert.equal(statusTools.length, 0, 'cancel, pause, and resume helpers are removed');
  assert.equal(
    tools.some((tool) => ['cancel_subscription', 'pause_subscription', 'resume_subscription'].includes(tool.name)),
    false
  );
});

test('global conventions stay in sync with the domain constants', () => {
  assert.deepEqual(schema.globalConventions.currencies, [...SUBSCRIPTION_CURRENCIES]);
  assert.deepEqual(schema.globalConventions.billingPeriods, [...SUBSCRIPTION_PERIODS]);
  assert.deepEqual(schema.globalConventions.lifecycleStates, [...SUBSCRIPTION_STATUSES]);
  assert.equal(schema.globalConventions.writableFields.includes('status'), false);
});

test('shared schemas enumerate the same currencies and list-filter statuses as the domain', () => {
  assert.deepEqual(schema.$defs.subscriptionWrite.properties.currency.enum, [...SUBSCRIPTION_CURRENCIES]);
  assert.equal(schema.$defs.subscriptionWrite.properties.status, undefined);
  assert.equal(schema.$defs.subscriptionPatch.properties.status, undefined);

  const listTool = tools.find((tool) => tool.name === 'list_subscriptions');
  assert.deepEqual(listTool?.parameters?.properties?.status?.enum, [...SUBSCRIPTION_STATUSES]);
});

test('the documented routes are present in the OpenAPI spec', () => {
  const openapi = readFileSync(join(repoRoot, 'docs-site', 'api', 'openapi.yaml'), 'utf8');
  const paths = new Set(tools.map((tool) => tool.path));
  for (const path of paths) {
    assert.ok(openapi.includes(`${path}:`), `openapi.yaml documents ${path}`);
  }
});
