import { PendingSyncOperation, Subscription } from '../types';
import { DEFAULT_CURRENCY } from './currency';

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

 return {
  ...subscription,
  currency: subscription.currency || DEFAULT_CURRENCY,
  createdAt,
  updatedAt,
  notificationEnabled: subscription.notificationEnabled ?? true,
 } as Subscription;
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

export const chooseConflictWinner = (
 localTimestamp?: string,
 cloudTimestamp?: string
): 'local' | 'cloud' => {
 return toTimestamp(localTimestamp) >= toTimestamp(cloudTimestamp) ? 'local' : 'cloud';
};
