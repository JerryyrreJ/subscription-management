import { PendingSyncOperation, Subscription } from '../types';
import { mergePendingOperation, normalizeSubscription } from './subscriptionSync';
import { DataScope, resolveScopedStorageKey } from './dataScope';

const STORAGE_KEY = 'subscription-tracker-data';
const PENDING_SYNC_OPERATIONS_KEY = 'subscription-tracker-pending-sync-operations';

export const loadSubscriptions = (scope?: DataScope): Subscription[] => {
 try {
 const data = localStorage.getItem(resolveScopedStorageKey(STORAGE_KEY, scope));
 if (!data) return [];

 const subscriptions = JSON.parse(data);

 return subscriptions.map((subscription: Partial<Subscription>) => normalizeSubscription(subscription));
 } catch (error) {
 console.error('Error loading subscriptions:', error);
 return [];
 }
};

export const saveSubscriptions = (subscriptions: Subscription[], scope?: DataScope): void => {
 try {
  localStorage.setItem(
  resolveScopedStorageKey(STORAGE_KEY, scope),
  JSON.stringify(subscriptions.map(subscription => normalizeSubscription(subscription)))
 );
 } catch (error) {
 console.error('Error saving subscriptions:', error);
 }
};

export const loadPendingSyncOperations = (scope?: DataScope): PendingSyncOperation[] => {
 try {
  const data = localStorage.getItem(resolveScopedStorageKey(PENDING_SYNC_OPERATIONS_KEY, scope));
  if (!data) {
   return [];
  }

  const operations = JSON.parse(data) as PendingSyncOperation[];
  return operations
   .filter(operation => operation?.id && operation?.type && operation?.subscriptionId && operation?.queuedAt)
   .map(operation => ({
    ...operation,
    subscription: operation.subscription ? normalizeSubscription(operation.subscription) : undefined,
   }));
 } catch (error) {
  console.error('Error loading pending sync operations:', error);
  return [];
 }
};

export const savePendingSyncOperations = (operations: PendingSyncOperation[], scope?: DataScope): void => {
 try {
  localStorage.setItem(resolveScopedStorageKey(PENDING_SYNC_OPERATIONS_KEY, scope), JSON.stringify(operations));
 } catch (error) {
  console.error('Error saving pending sync operations:', error);
 }
};

export const enqueuePendingSyncOperation = (operation: PendingSyncOperation, scope?: DataScope): PendingSyncOperation[] => {
 const mergedOperations = mergePendingOperation(loadPendingSyncOperations(scope), operation);
 savePendingSyncOperations(mergedOperations, scope);
 return mergedOperations;
};

export const clearPendingSyncOperations = (scope?: DataScope): void => {
 try {
  localStorage.removeItem(resolveScopedStorageKey(PENDING_SYNC_OPERATIONS_KEY, scope));
 } catch (error) {
  console.error('Error clearing pending sync operations:', error);
 }
};
