import { PendingSyncOperation, Subscription } from '../types';
import { mergePendingOperation, normalizeSubscription } from './subscriptionSync';

const STORAGE_KEY = 'subscription-tracker-data';
const PENDING_SYNC_OPERATIONS_KEY = 'subscription-tracker-pending-sync-operations';

export const loadSubscriptions = (): Subscription[] => {
 try {
 const data = localStorage.getItem(STORAGE_KEY);
 if (!data) return [];

 const subscriptions = JSON.parse(data);

 return subscriptions.map((subscription: Partial<Subscription>) => normalizeSubscription(subscription));
 } catch (error) {
 console.error('Error loading subscriptions:', error);
 return [];
 }
};

export const saveSubscriptions = (subscriptions: Subscription[]): void => {
 try {
 localStorage.setItem(
  STORAGE_KEY,
  JSON.stringify(subscriptions.map(subscription => normalizeSubscription(subscription)))
 );
 } catch (error) {
 console.error('Error saving subscriptions:', error);
 }
};

export const loadPendingSyncOperations = (): PendingSyncOperation[] => {
 try {
  const data = localStorage.getItem(PENDING_SYNC_OPERATIONS_KEY);
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

export const savePendingSyncOperations = (operations: PendingSyncOperation[]): void => {
 try {
  localStorage.setItem(PENDING_SYNC_OPERATIONS_KEY, JSON.stringify(operations));
 } catch (error) {
  console.error('Error saving pending sync operations:', error);
 }
};

export const enqueuePendingSyncOperation = (operation: PendingSyncOperation): PendingSyncOperation[] => {
 const mergedOperations = mergePendingOperation(loadPendingSyncOperations(), operation);
 savePendingSyncOperations(mergedOperations);
 return mergedOperations;
};

export const clearPendingSyncOperations = (): void => {
 try {
  localStorage.removeItem(PENDING_SYNC_OPERATIONS_KEY);
 } catch (error) {
  console.error('Error clearing pending sync operations:', error);
 }
};
