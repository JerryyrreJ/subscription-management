import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingSyncOperation, Subscription } from '../../src/types.ts';
import {
 applyPendingOperationsToSubscriptions,
 chooseConflictWinner,
 mergePendingOperation,
 normalizeSubscription,
} from '../../src/utils/subscriptionSync.ts';

const createSubscription = (overrides: Partial<Subscription> = {}): Subscription => normalizeSubscription({
 id: overrides.id || 'sub-1',
 name: overrides.name || 'Netflix',
 category: overrides.category || 'Entertainment',
 amount: overrides.amount || 15,
 currency: overrides.currency || 'USD',
 period: overrides.period || 'monthly',
 lastPaymentDate: overrides.lastPaymentDate || '2026-03-01',
 nextPaymentDate: overrides.nextPaymentDate || '2026-04-01',
 createdAt: overrides.createdAt || '2026-03-01T00:00:00.000Z',
 updatedAt: overrides.updatedAt || '2026-03-01T00:00:00.000Z',
 notificationEnabled: overrides.notificationEnabled ?? true,
});

const createOperation = (overrides: Partial<PendingSyncOperation> = {}): PendingSyncOperation => ({
 id: overrides.id || crypto.randomUUID(),
 type: overrides.type || 'update',
 subscriptionId: overrides.subscriptionId || 'sub-1',
 subscription: overrides.subscription,
 baseUpdatedAt: overrides.baseUpdatedAt,
 queuedAt: overrides.queuedAt || '2026-03-02T00:00:00.000Z',
});

test('mergePendingOperation folds update into an existing create', () => {
 const createdSubscription = createSubscription();
 const updatedSubscription = createSubscription({
  amount: 18,
  updatedAt: '2026-03-03T00:00:00.000Z',
 });

 const operations = mergePendingOperation(
  [createOperation({ type: 'create', subscription: createdSubscription })],
  createOperation({
   type: 'update',
   subscription: updatedSubscription,
   queuedAt: '2026-03-03T00:00:00.000Z',
  })
 );

 assert.equal(operations.length, 1);
 assert.equal(operations[0].type, 'create');
 assert.equal(operations[0].subscription?.amount, 18);
});

test('mergePendingOperation drops a create when the subscription is deleted before sync', () => {
 const operations = mergePendingOperation(
  [createOperation({ type: 'create', subscription: createSubscription() })],
  createOperation({ type: 'delete' })
 );

 assert.deepEqual(operations, []);
});

test('applyPendingOperationsToSubscriptions overlays queued edits on top of cloud data', () => {
 const cloudSubscriptions = [
  createSubscription(),
  createSubscription({
   id: 'sub-2',
   name: 'Spotify',
   updatedAt: '2026-03-01T00:00:00.000Z',
  }),
 ];

 const operations = [
  createOperation({
   type: 'update',
   subscriptionId: 'sub-1',
   subscription: createSubscription({
    amount: 20,
    updatedAt: '2026-03-04T00:00:00.000Z',
   }),
   queuedAt: '2026-03-04T00:00:00.000Z',
  }),
  createOperation({
   type: 'delete',
   subscriptionId: 'sub-2',
   queuedAt: '2026-03-05T00:00:00.000Z',
  }),
  createOperation({
   type: 'create',
   subscriptionId: 'sub-3',
   subscription: createSubscription({
    id: 'sub-3',
    name: 'YouTube Premium',
    updatedAt: '2026-03-06T00:00:00.000Z',
   }),
   queuedAt: '2026-03-06T00:00:00.000Z',
  }),
 ];

 const resolvedSubscriptions = applyPendingOperationsToSubscriptions(cloudSubscriptions, operations);

 assert.equal(resolvedSubscriptions.length, 2);
 assert.equal(resolvedSubscriptions[0].id, 'sub-3');
 assert.equal(resolvedSubscriptions[1].amount, 20);
 assert.equal(resolvedSubscriptions.some(subscription => subscription.id === 'sub-2'), false);
});

test('chooseConflictWinner prefers the newer timestamp', () => {
 assert.equal(
  chooseConflictWinner('2026-03-03T00:00:00.000Z', '2026-03-02T00:00:00.000Z'),
  'local'
 );
 assert.equal(
  chooseConflictWinner('2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z'),
  'cloud'
 );
});
