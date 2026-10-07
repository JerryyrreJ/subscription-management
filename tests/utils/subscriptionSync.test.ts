import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingSyncOperation, Subscription } from '../../src/types.ts';
import {
 buildPendingCreateOperations,
 applyPendingOperationsToSubscriptions,
 chooseConflictWinner,
 mergePendingOperation,
 normalizeSubscription,
 reconcileSubscriptionSync,
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

test('normalizeSubscription migrates a legacy monthly record to an anchored next-renewal schedule', () => {
 const migrated = normalizeSubscription({
  id: 'legacy-31',
  name: 'Legacy monthly',
  category: 'Software',
  amount: 10,
  currency: 'USD',
  period: 'monthly',
  lastPaymentDate: '2026-01-31',
  notificationEnabled: true,
 });

 assert.equal(migrated.nextPaymentDate, '2026-02-28');
 assert.equal(migrated.billingAnchorDay, 31);
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

test('buildPendingCreateOperations rebuilds retry queue for failed uploads', () => {
 const failedSubscriptions = [
  createSubscription({
   id: 'sub-failed-1',
   updatedAt: '2026-03-07T00:00:00.000Z',
  }),
  createSubscription({
   id: 'sub-failed-2',
   name: 'Spotify',
   updatedAt: '2026-03-08T00:00:00.000Z',
  }),
 ];

 const operations = buildPendingCreateOperations(failedSubscriptions);

 assert.equal(operations.length, 2);
 assert.deepEqual(
  operations.map(operation => operation.subscriptionId),
  ['sub-failed-1', 'sub-failed-2']
 );
 assert.equal(operations.every(operation => operation.type === 'create'), true);
 assert.equal(operations[1].subscription?.name, 'Spotify');
 assert.equal(operations[1].queuedAt, '2026-03-08T00:00:00.000Z');
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

// Requests may finish after local queue entries have been compacted or removed.
test('sync preserves a new offline create while acknowledging the submitted operations', () => {
 const original = createSubscription();
 const added = createSubscription({ id: 'sub-new', name: 'New subscription' });
 const oldOp = createOperation({ type: 'create', subscription: original });
 const newOp = createOperation({ id: 'op-new', type: 'create', subscriptionId: added.id, subscription: added });
 const result = reconcileSubscriptionSync(
  { subscriptions: [original], pendingOperations: [oldOp] },
  { subscriptions: [original, added], pendingOperations: [oldOp, newOp] },
  { subscriptions: [original], pendingOperations: [] }
 );
 assert.deepEqual(result.pendingOperations, [newOp]);
 assert.deepEqual(new Set(result.subscriptions.map(sub => sub.id)), new Set([original.id, added.id]));
});

test('sync preserves edits compacted into the same operation ID and rebases them on the acknowledged write', () => {
 const original = createSubscription();
 const edited = createSubscription({ amount: 29 });
 const oldOp = createOperation({ type: 'create', subscription: original });
 const newOp = { ...oldOp, subscription: edited };
 const cloud = { ...original, updatedAt: '2026-03-05T00:00:00.000Z' };
 const result = reconcileSubscriptionSync(
  { subscriptions: [original], pendingOperations: [oldOp] },
  { subscriptions: [edited], pendingOperations: [newOp] },
  { subscriptions: [cloud], pendingOperations: [] }
 );
 assert.equal(result.subscriptions[0].amount, 29);
 assert.equal(result.pendingOperations[0].id, oldOp.id);
 assert.equal(result.pendingOperations[0].baseUpdatedAt, cloud.updatedAt);
});

test('deleting a submitted create leaves a tombstone even if queue compaction removed both operations', () => {
 const original = createSubscription();
 const op = createOperation({ type: 'create', subscription: original });
 const result = reconcileSubscriptionSync(
  { subscriptions: [original], pendingOperations: [op] },
  { subscriptions: [], pendingOperations: [] },
  { subscriptions: [original], pendingOperations: [] }
 );
 assert.deepEqual(result.subscriptions, []);
 assert.equal(result.pendingOperations.length, 1);
 assert.equal(result.pendingOperations[0].type, 'delete');
 assert.equal(result.pendingOperations[0].subscriptionId, original.id);
});

test('an older cloud snapshot cannot undo a successful foreground edit or deletion', () => {
 const original = createSubscription();
 for (const latest of [[], [createSubscription({ amount: 42 })]]) {
  const result = reconcileSubscriptionSync(
   { subscriptions: [original], pendingOperations: [] },
   { subscriptions: latest, pendingOperations: [] },
   { subscriptions: [original], pendingOperations: [] }
  );
  assert.deepEqual(result.subscriptions, latest);
  assert.equal(result.pendingOperations.length, 1);
 }
});

test('unchanged data accepts cloud changes and retains failed operations for retry', () => {
 const original = createSubscription();
 const op = createOperation({ subscription: original });
 const snapshot = { subscriptions: [original], pendingOperations: [op] };
 const failed = reconcileSubscriptionSync(snapshot, snapshot, snapshot);
 assert.deepEqual(failed.pendingOperations, [op]);
 const success = reconcileSubscriptionSync(snapshot, snapshot, {
  subscriptions: [{ ...original, amount: 40 }], pendingOperations: []
 });
 assert.equal(success.subscriptions[0].amount, 40);
 assert.deepEqual(success.pendingOperations, []);
});

test('failed uploads retain newly generated retry operations', () => {
 const original = createSubscription();
 const retry = createOperation({ type: 'create', subscription: original });
 const snapshot = { subscriptions: [original], pendingOperations: [] };
 const result = reconcileSubscriptionSync(snapshot, snapshot, {
  subscriptions: [original], pendingOperations: [retry]
 });
 assert.deepEqual(result.pendingOperations, [retry]);
});
