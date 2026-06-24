import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiCommand, type AiSubscriptionContextItem } from '../../src/utils/aiCommand.ts';

const TODAY = '2026-06-22';
const context: AiSubscriptionContextItem[] = [{
  id: 'sub-warmcar',
  name: 'Warmcar',
  category: 'Entertainment',
  amount: 99,
  currency: 'CNY',
  period: 'custom',
  lastPaymentDate: '2026-06-13',
  customDate: '90',
  notificationEnabled: true,
}, {
  id: 'sub-tencent',
  name: '腾讯云',
  category: 'Productivity',
  amount: 88,
  currency: 'CNY',
  period: 'monthly',
  lastPaymentDate: '2026-06-01',
  notificationEnabled: true,
}];

test('normalizes create command drafts', () => {
  const { command } = normalizeAiCommand({
    action: 'create',
    subscriptions: [{
      name: 'Netflix',
      category: 'Streaming',
      amount: 15.99,
      currency: 'USD',
      period: 'monthly',
      lastPaymentDate: '2026-06-01',
    }],
  }, TODAY, context);

  assert.equal(command.type, 'create');
  assert.equal(command.type === 'create' ? command.drafts[0].name : '', 'Netflix');
});

test('normalizes delete command only for known subscription ids', () => {
  const valid = normalizeAiCommand({ action: 'delete', subscriptionId: 'sub-warmcar' }, TODAY, context);
  assert.equal(valid.command.type, 'delete');
  assert.equal(valid.command.type === 'delete' ? valid.command.subscriptionId : '', 'sub-warmcar');

  const invalid = normalizeAiCommand({ action: 'delete', subscriptionId: 'missing' }, TODAY, context);
  assert.equal(invalid.command.type, 'none');
});

test('normalizes update command with a validated patch', () => {
  const { command } = normalizeAiCommand({
    action: 'update',
    subscriptionId: 'sub-tencent',
    patch: { amount: 74, currency: 'CNY', period: 'yearly' },
  }, TODAY, context);

  assert.equal(command.type, 'update');
  assert.equal(command.type === 'update' ? command.subscriptionId : '', 'sub-tencent');
  assert.deepEqual(command.type === 'update' ? command.patch : {}, {
    amount: 74,
    currency: 'CNY',
    period: 'yearly',
  });
});

test('keeps incomplete custom period updates for user completion', () => {
  const { command } = normalizeAiCommand({
    action: 'update',
    subscriptionId: 'sub-tencent',
    patch: { period: 'custom' },
  }, TODAY, context);

  assert.equal(command.type, 'update');
  assert.deepEqual(command.type === 'update' ? command.patch : {}, {
    period: 'custom',
  });
  assert.deepEqual(command.type === 'update' ? command.missingFields : [], ['customDate']);
});

test('does not require custom interval when the target already has one', () => {
  const { command } = normalizeAiCommand({
    action: 'update',
    subscriptionId: 'sub-warmcar',
    patch: { amount: 79 },
  }, TODAY, context);

  assert.equal(command.type, 'update');
  assert.equal(command.type === 'update' ? command.missingFields : undefined, undefined);
});

test('drops non-boolean notificationEnabled updates', () => {
  const invalid = normalizeAiCommand({
    action: 'update',
    subscriptionId: 'sub-tencent',
    patch: { notificationEnabled: 'false' },
  }, TODAY, context);
  assert.equal(invalid.command.type, 'none');

  const valid = normalizeAiCommand({
    action: 'update',
    subscriptionId: 'sub-tencent',
    patch: { notificationEnabled: false },
  }, TODAY, context);
  assert.equal(valid.command.type, 'update');
  assert.deepEqual(valid.command.type === 'update' ? valid.command.patch : {}, {
    notificationEnabled: false,
  });
});

test('falls back to none for unsupported or empty actions', () => {
  const { command } = normalizeAiCommand({ action: 'chat', reason: 'Not a write operation.' }, TODAY, context);
  assert.equal(command.type, 'none');
  assert.equal(command.type === 'none' ? command.reason : '', 'Not a write operation.');
});
