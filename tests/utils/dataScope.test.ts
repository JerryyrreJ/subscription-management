import test from 'node:test';
import assert from 'node:assert/strict';
import {
 GUEST_DATA_SCOPE,
 getUserDataScope,
 setActiveDataScope,
} from '../../src/utils/dataScope.ts';
import {
 loadPendingSyncOperations,
 loadSubscriptions,
 savePendingSyncOperations,
 saveSubscriptions,
} from '../../src/utils/storage.ts';
import { loadNotificationSettings, saveNotificationSettings } from '../../src/utils/notificationChecker.ts';
import type { PendingSyncOperation, ReminderSettings, Subscription } from '../../src/types.ts';

const createLocalStorageMock = () => {
 const storage = new Map<string, string>();

 return {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
   storage.set(key, value);
  },
  removeItem: (key: string) => {
   storage.delete(key);
  },
  clear: () => {
   storage.clear();
  }
 };
};

const createSubscription = (id: string, name: string): Subscription => ({
 id,
 name,
 category: 'Software',
 amount: 9.99,
 currency: 'USD',
 period: 'monthly',
 lastPaymentDate: '2026-04-01',
 nextPaymentDate: '2026-05-01',
 notificationEnabled: true,
});

const createSettings = (deviceKey: string): ReminderSettings => ({
 barkPush: {
  enabled: true,
  serverUrl: 'https://api.day.app',
  deviceKey,
  daysBefore: 3,
  notificationHistory: {},
 }
});

const createPendingOperation = (subscriptionId: string): PendingSyncOperation => ({
 id: `pending-${subscriptionId}`,
 type: 'create',
 subscriptionId,
 subscription: createSubscription(subscriptionId, `Sub ${subscriptionId}`),
 queuedAt: '2026-04-01T00:00:00.000Z',
});

test('subscriptions are isolated between guest and authenticated user scopes', () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 globalThis.localStorage = localStorageMock as Storage;

 try {
  setActiveDataScope(GUEST_DATA_SCOPE);
  saveSubscriptions([createSubscription('guest-sub', 'Guest Sub')]);

  setActiveDataScope(getUserDataScope('user-123'));
  saveSubscriptions([createSubscription('user-sub', 'User Sub')]);

  setActiveDataScope(GUEST_DATA_SCOPE);
  assert.deepEqual(loadSubscriptions().map(subscription => subscription.id), ['guest-sub']);

  setActiveDataScope(getUserDataScope('user-123'));
  assert.deepEqual(loadSubscriptions().map(subscription => subscription.id), ['user-sub']);
 } finally {
  setActiveDataScope(GUEST_DATA_SCOPE);
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});

test('pending sync operations are isolated per user scope', () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 globalThis.localStorage = localStorageMock as Storage;

 try {
  setActiveDataScope(getUserDataScope('user-a'));
  savePendingSyncOperations([createPendingOperation('sub-a')]);

  setActiveDataScope(getUserDataScope('user-b'));
  savePendingSyncOperations([createPendingOperation('sub-b')]);

  setActiveDataScope(getUserDataScope('user-a'));
  assert.deepEqual(loadPendingSyncOperations().map(operation => operation.subscriptionId), ['sub-a']);

  setActiveDataScope(getUserDataScope('user-b'));
  assert.deepEqual(loadPendingSyncOperations().map(operation => operation.subscriptionId), ['sub-b']);
 } finally {
  setActiveDataScope(GUEST_DATA_SCOPE);
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});

test('notification settings are isolated between guest and authenticated scopes', () => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 globalThis.localStorage = localStorageMock as Storage;

 try {
  setActiveDataScope(GUEST_DATA_SCOPE);
  saveNotificationSettings(createSettings('guest-device'));

  setActiveDataScope(getUserDataScope('user-123'));
  saveNotificationSettings(createSettings('user-device'));

  setActiveDataScope(GUEST_DATA_SCOPE);
  assert.equal(loadNotificationSettings().barkPush.deviceKey, 'guest-device');

  setActiveDataScope(getUserDataScope('user-123'));
  assert.equal(loadNotificationSettings().barkPush.deviceKey, 'user-device');
 } finally {
  setActiveDataScope(GUEST_DATA_SCOPE);
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
});
