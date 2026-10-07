import { PendingSyncOperation, Subscription, SyncSubscriptionsResult } from '../types';
import { DEFAULT_CURRENCY } from './currency';
import { normalizeSubscriptionRecord } from './subscriptionDomain';

const toTimestamp = (value?: string): number => {
 if (!value) {
  return 0;
 }

 const parsed = Date.parse(value);
 return Number.isNaN(parsed) ? 0 : parsed;
};

export const normalizeSubscription = (subscription: Partial<Subscription>): Subscription => {
 const createdAt = subscription.createdAt || new Date().toISOString();
 const updatedAt = subscription.updatedAt || createdAt;

 try {
  return normalizeSubscriptionRecord({
   ...subscription,
   currency: subscription.currency || DEFAULT_CURRENCY,
   createdAt,
   updatedAt,
   notificationEnabled: subscription.notificationEnabled ?? true,
  });
 } catch {
  return {
   ...subscription,
   currency: subscription.currency || DEFAULT_CURRENCY,
   createdAt,
   updatedAt,
   notificationEnabled: subscription.notificationEnabled ?? true,
  } as Subscription;
 }
};

export const sortSubscriptionsByRecency = (subscriptions: Subscription[]): Subscription[] => {
 return [...subscriptions].sort((left, right) => {
  const rightTimestamp = Math.max(
   toTimestamp(right.updatedAt),
   toTimestamp(right.createdAt)
  );
  const leftTimestamp = Math.max(
   toTimestamp(left.updatedAt),
   toTimestamp(left.createdAt)
  );

  return rightTimestamp - leftTimestamp;
 });
};

export const sortPendingOperations = (operations: PendingSyncOperation[]): PendingSyncOperation[] => {
 return [...operations].sort((left, right) => toTimestamp(left.queuedAt) - toTimestamp(right.queuedAt));
};

export const mergePendingOperation = (
 operations: PendingSyncOperation[],
 nextOperation: PendingSyncOperation
): PendingSyncOperation[] => {
 const currentOperations = [...operations];
 const existingIndex = currentOperations.findIndex(
  operation => operation.subscriptionId === nextOperation.subscriptionId
 );

 if (existingIndex === -1) {
  return sortPendingOperations([...currentOperations, nextOperation]);
 }

 const existingOperation = currentOperations[existingIndex];
 let mergedOperation: PendingSyncOperation | null = nextOperation;

 switch (nextOperation.type) {
 case 'create':
  mergedOperation = nextOperation;
  break;
 case 'update':
  if (existingOperation.type === 'create') {
   mergedOperation = {
    ...existingOperation,
    subscription: nextOperation.subscription || existingOperation.subscription,
    queuedAt: nextOperation.queuedAt,
   };
  } else if (existingOperation.type === 'update') {
   mergedOperation = {
    ...existingOperation,
    subscription: nextOperation.subscription || existingOperation.subscription,
    baseUpdatedAt: existingOperation.baseUpdatedAt || nextOperation.baseUpdatedAt,
    queuedAt: nextOperation.queuedAt,
   };
  } else {
   mergedOperation = existingOperation;
  }
  break;
 case 'delete':
  if (existingOperation.type === 'create') {
   mergedOperation = null;
  } else if (existingOperation.type === 'update') {
   mergedOperation = {
    ...nextOperation,
    baseUpdatedAt: existingOperation.baseUpdatedAt || nextOperation.baseUpdatedAt,
   };
  }
  break;
 default:
  break;
 }

 const remainingOperations = currentOperations.filter(
  operation => operation.subscriptionId !== nextOperation.subscriptionId
 );

 if (!mergedOperation) {
  return sortPendingOperations(remainingOperations);
 }

 return sortPendingOperations([...remainingOperations, mergedOperation]);
};

export const applyPendingOperationsToSubscriptions = (
 subscriptions: Subscription[],
 operations: PendingSyncOperation[]
): Subscription[] => {
 const subscriptionMap = new Map(
  subscriptions.map(subscription => [subscription.id, normalizeSubscription(subscription)])
 );

 for (const operation of sortPendingOperations(operations)) {
  if (operation.type === 'delete') {
   subscriptionMap.delete(operation.subscriptionId);
   continue;
  }

  if (operation.subscription) {
   subscriptionMap.set(
    operation.subscriptionId,
    normalizeSubscription(operation.subscription)
   );
  }
 }

 return sortSubscriptionsByRecency(Array.from(subscriptionMap.values()));
};

export const buildPendingCreateOperations = (
 subscriptions: Subscription[]
): PendingSyncOperation[] => {
 return sortPendingOperations(
  subscriptions.map(subscription => {
   const normalizedSubscription = normalizeSubscription(subscription);

   return {
    id: crypto.randomUUID(),
    type: 'create' as const,
    subscriptionId: normalizedSubscription.id,
    subscription: normalizedSubscription,
    queuedAt: normalizedSubscription.updatedAt || normalizedSubscription.createdAt || new Date().toISOString(),
   };
  })
 );
};

export const chooseConflictWinner = (
 localTimestamp?: string,
 cloudTimestamp?: string
): 'local' | 'cloud' => {
 return toTimestamp(localTimestamp) >= toTimestamp(cloudTimestamp) ? 'local' : 'cloud';
};

// A request acknowledges only the exact operations it read. Queue compaction can
// keep an operation ID while replacing its contents, so ID equality is insufficient.
export const reconcileSubscriptionSync = (
 snapshot: SyncSubscriptionsResult,
 current: SyncSubscriptionsResult,
 result: SyncSubscriptionsResult
): SyncSubscriptionsResult => {
 const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
 const submitted = new Map(snapshot.pendingOperations.map(op => [op.id, op]));
 const remaining = new Set(result.pendingOperations.map(op => op.id));
 const cloud = new Map(result.subscriptions.map(sub => [sub.id, sub]));
 const pendingOperations = current.pendingOperations.filter(op =>
  !same(submitted.get(op.id), op) || remaining.has(op.id)
 ).map(op => {
  // A newer local edit follows the write just acknowledged by this request.
  const previous = snapshot.pendingOperations.find(old => old.subscriptionId === op.subscriptionId);
  if (previous && !remaining.has(previous.id) && !same(previous, op)) {
   return { ...op, baseUpdatedAt: cloud.get(op.subscriptionId)?.updatedAt };
  }
  return op;
 });

 const before = new Map(snapshot.subscriptions.map(sub => [sub.id, sub]));
 const after = new Map(current.subscriptions.map(sub => [sub.id, sub]));
 const pendingIds = new Set(pendingOperations.map(op => op.subscriptionId));
 for (const op of result.pendingOperations) {
  if (!submitted.has(op.id) && !pendingIds.has(op.subscriptionId)
   && same(before.get(op.subscriptionId), after.get(op.subscriptionId))) {
   pendingOperations.push(op);
   pendingIds.add(op.subscriptionId);
  }
 }
 for (const id of new Set([...before.keys(), ...after.keys()])) {
  const latest = after.get(id);
  if (same(before.get(id), latest) || pendingIds.has(id) || same(cloud.get(id), latest)) continue;
  // Includes successful foreground writes missing from an older cloud snapshot,
  // and deletion of a queued create that may already have reached the server.
  pendingOperations.push({
   id: crypto.randomUUID(),
   type: latest ? (cloud.has(id) ? 'update' : 'create') : 'delete',
   subscriptionId: id,
   subscription: latest,
   baseUpdatedAt: cloud.get(id)?.updatedAt,
   queuedAt: latest?.updatedAt || new Date().toISOString(),
  });
 }

 return {
  subscriptions: applyPendingOperationsToSubscriptions(result.subscriptions, pendingOperations),
  pendingOperations: sortPendingOperations(pendingOperations),
 };
};
