import test from 'node:test';
import assert from 'node:assert/strict';
import {
 GUEST_DATA_SCOPE,
 getUserDataScope,
 setActiveDataScope,
} from '../../src/utils/dataScope.ts';
import {
 clearLocalDataOwner,
 loadLastLocalDataOwnerUserId,
 loadPendingSyncOperations,
 loadLocalDataOwner,
 loadSubscriptions,
 saveLocalDataOwner,
 saveLastLocalDataOwnerUserId,
 savePendingSyncOperations,
 saveSubscriptions,
} from '../../src/utils/storage.ts';
import { loadCategories, saveCategories } from '../../src/utils/categories.ts';
import { loadNotificationSettings, saveNotificationSettings } from '../../src/utils/notificationChecker.ts';
import {
 migrateOwnedGuestDataToUserScope,
 migrateUnownedGuestDataToUserScope,
 resolveCurrentLocalDataScope,
 resolveLocalDataScope,
} from '../../src/utils/localDataOwnership.ts';
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
 timeZone: 'UTC',
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

const createCategory = (id: string, name: string) => ({
 id,
 name,
 order: 0,
 isBuiltIn: false,
 isHidden: false,
});

const withMockedLocalStorage = (callback: () => void) => {
 const localStorageMock = createLocalStorageMock();
 const originalLocalStorage = globalThis.localStorage;
 globalThis.localStorage = localStorageMock as Storage;

 try {
  callback();
 } finally {
  setActiveDataScope(GUEST_DATA_SCOPE);
  if (originalLocalStorage) {
   globalThis.localStorage = originalLocalStorage;
  } else {
   delete (globalThis as { localStorage?: Storage }).localStorage;
  }
 }
};

test('subscriptions are isolated between guest and authenticated user scopes', () => {
 withMockedLocalStorage(() => {
  setActiveDataScope(GUEST_DATA_SCOPE);
  saveSubscriptions([createSubscription('guest-sub', 'Guest Sub')]);

  setActiveDataScope(getUserDataScope('user-123'));
  saveSubscriptions([createSubscription('user-sub', 'User Sub')]);

  setActiveDataScope(GUEST_DATA_SCOPE);
  assert.deepEqual(loadSubscriptions().map(subscription => subscription.id), ['guest-sub']);

  setActiveDataScope(getUserDataScope('user-123'));
  assert.deepEqual(loadSubscriptions().map(subscription => subscription.id), ['user-sub']);
 });
});

test('pending sync operations are isolated per user scope', () => {
 withMockedLocalStorage(() => {
  setActiveDataScope(getUserDataScope('user-a'));
  savePendingSyncOperations([createPendingOperation('sub-a')]);

  setActiveDataScope(getUserDataScope('user-b'));
  savePendingSyncOperations([createPendingOperation('sub-b')]);

  setActiveDataScope(getUserDataScope('user-a'));
  assert.deepEqual(loadPendingSyncOperations().map(operation => operation.subscriptionId), ['sub-a']);

  setActiveDataScope(getUserDataScope('user-b'));
  assert.deepEqual(loadPendingSyncOperations().map(operation => operation.subscriptionId), ['sub-b']);
 });
});

test('notification settings are isolated between guest and authenticated scopes', () => {
 withMockedLocalStorage(() => {
  setActiveDataScope(GUEST_DATA_SCOPE);
  saveNotificationSettings(createSettings('guest-device'));

  setActiveDataScope(getUserDataScope('user-123'));
  saveNotificationSettings(createSettings('user-device'));

  setActiveDataScope(GUEST_DATA_SCOPE);
  assert.equal(loadNotificationSettings().barkPush.deviceKey, 'guest-device');

  setActiveDataScope(getUserDataScope('user-123'));
  assert.equal(loadNotificationSettings().barkPush.deviceKey, 'user-device');
 });
});

test('notification settings can be saved into an explicit scope without changing active scope', () => {
 withMockedLocalStorage(() => {
  setActiveDataScope(GUEST_DATA_SCOPE);
  saveNotificationSettings(createSettings('scoped-device'), getUserDataScope('user-456'));

  assert.equal(loadNotificationSettings().barkPush.deviceKey, '');
  assert.equal(loadNotificationSettings(getUserDataScope('user-456')).barkPush.deviceKey, 'scoped-device');
 });
});

test('local data owner is stored per scope', () => {
 withMockedLocalStorage(() => {
  saveLocalDataOwner(
   {
    userId: 'user-123',
    claimedAt: '2026-04-01T00:00:00.000Z',
    lastSeenAt: '2026-04-02T00:00:00.000Z',
   },
   GUEST_DATA_SCOPE,
  );
  saveLocalDataOwner(
   {
    userId: 'user-456',
    claimedAt: '2026-04-03T00:00:00.000Z',
    lastSeenAt: '2026-04-04T00:00:00.000Z',
   },
   getUserDataScope('user-456'),
  );

  assert.equal(loadLocalDataOwner(GUEST_DATA_SCOPE)?.userId, 'user-123');
  assert.equal(loadLocalDataOwner(getUserDataScope('user-456'))?.userId, 'user-456');
 });
});

test('last local owner user id is persisted outside data scopes', () => {
 withMockedLocalStorage(() => {
  saveLastLocalDataOwnerUserId('user-123');
  setActiveDataScope(getUserDataScope('user-456'));

  assert.equal(loadLastLocalDataOwnerUserId(), 'user-123');
 });
});

test('owned guest data migrates back into the matching user scope', () => {
 withMockedLocalStorage(() => {
  const guestOwner = {
   userId: 'user-123',
   claimedAt: '2026-04-01T00:00:00.000Z',
   lastSeenAt: '2026-04-02T00:00:00.000Z',
  };
  saveSubscriptions([createSubscription('guest-sub', 'Guest Sub')], GUEST_DATA_SCOPE);
  savePendingSyncOperations([createPendingOperation('guest-sub')], GUEST_DATA_SCOPE);
  saveCategories([createCategory('guest-cat', 'Guest Cat')], GUEST_DATA_SCOPE);
  saveNotificationSettings(createSettings('guest-owned-device'), GUEST_DATA_SCOPE);
  saveLocalDataOwner(guestOwner, GUEST_DATA_SCOPE);

  migrateOwnedGuestDataToUserScope('user-123');

  const userScope = getUserDataScope('user-123');
  assert.deepEqual(loadSubscriptions(userScope).map(subscription => subscription.id), ['guest-sub']);
  assert.deepEqual(loadPendingSyncOperations(userScope).map(operation => operation.subscriptionId), ['guest-sub']);
  assert.deepEqual(loadCategories(userScope).map(category => category.id), ['guest-cat']);
  assert.equal(loadNotificationSettings(userScope).barkPush.deviceKey, 'guest-owned-device');
  assert.equal(loadLocalDataOwner(userScope)?.userId, 'user-123');

  assert.deepEqual(loadSubscriptions(GUEST_DATA_SCOPE), []);
  assert.deepEqual(loadPendingSyncOperations(GUEST_DATA_SCOPE), []);
  assert.equal(loadLocalDataOwner(GUEST_DATA_SCOPE), null);
  assert.equal(loadNotificationSettings(GUEST_DATA_SCOPE).barkPush.deviceKey, '');
  assert.notDeepEqual(loadCategories(GUEST_DATA_SCOPE).map(category => category.id), ['guest-cat']);
 });
});

test('guest-owned data does not migrate for a different user', () => {
 withMockedLocalStorage(() => {
  saveSubscriptions([createSubscription('guest-sub', 'Guest Sub')], GUEST_DATA_SCOPE);
  saveLocalDataOwner(
   {
    userId: 'user-123',
    claimedAt: '2026-04-01T00:00:00.000Z',
    lastSeenAt: '2026-04-02T00:00:00.000Z',
   },
   GUEST_DATA_SCOPE,
  );

  migrateOwnedGuestDataToUserScope('user-456');

  assert.deepEqual(loadSubscriptions(GUEST_DATA_SCOPE).map(subscription => subscription.id), ['guest-sub']);
  assert.equal(loadLocalDataOwner(GUEST_DATA_SCOPE)?.userId, 'user-123');
  assert.deepEqual(loadSubscriptions(getUserDataScope('user-456')), []);
 });
});

test('current local scope stays on the last owner after session loss', () => {
 withMockedLocalStorage(() => {
  const userScope = getUserDataScope('user-123');
  saveSubscriptions([createSubscription('user-sub', 'User Sub')], userScope);
  saveLastLocalDataOwnerUserId('user-123');

  assert.equal(resolveCurrentLocalDataScope(null), userScope);
  assert.deepEqual(loadSubscriptions(resolveCurrentLocalDataScope(null)).map(subscription => subscription.id), ['user-sub']);
 });
});

test('first login migrates true guest data into the user scope once', () => {
 withMockedLocalStorage(() => {
  saveSubscriptions([createSubscription('guest-sub', 'Guest Sub')], GUEST_DATA_SCOPE);
  savePendingSyncOperations([createPendingOperation('guest-sub')], GUEST_DATA_SCOPE);
  saveCategories([createCategory('guest-cat', 'Guest Cat')], GUEST_DATA_SCOPE);
  saveNotificationSettings(createSettings('guest-device'), GUEST_DATA_SCOPE);

  assert.equal(migrateUnownedGuestDataToUserScope('user-123'), true);

  const userScope = getUserDataScope('user-123');
  assert.deepEqual(loadSubscriptions(userScope).map(subscription => subscription.id), ['guest-sub']);
  assert.deepEqual(loadPendingSyncOperations(userScope).map(operation => operation.subscriptionId), ['guest-sub']);
  assert.deepEqual(loadCategories(userScope).map(category => category.id), ['guest-cat']);
  assert.equal(loadNotificationSettings(userScope).barkPush.deviceKey, 'guest-device');
  assert.equal(loadLocalDataOwner(userScope)?.userId, 'user-123');
  assert.deepEqual(loadSubscriptions(GUEST_DATA_SCOPE), []);
 });
});

test('first login migration is skipped once local data already has an owner', () => {
 withMockedLocalStorage(() => {
  saveSubscriptions([createSubscription('guest-sub', 'Guest Sub')], GUEST_DATA_SCOPE);
  saveLastLocalDataOwnerUserId('user-previous');

  assert.equal(migrateUnownedGuestDataToUserScope('user-123'), false);
  assert.deepEqual(loadSubscriptions(GUEST_DATA_SCOPE).map(subscription => subscription.id), ['guest-sub']);
  assert.deepEqual(loadSubscriptions(getUserDataScope('user-123')), []);
 });
});

test('resolveLocalDataScope falls back to user scope for a different owner', () => {
 withMockedLocalStorage(() => {
  saveLocalDataOwner(
   {
    userId: 'user-abc',
    claimedAt: '2026-04-01T00:00:00.000Z',
    lastSeenAt: '2026-04-02T00:00:00.000Z',
   },
   GUEST_DATA_SCOPE,
  );

  assert.equal(resolveLocalDataScope('user-123'), getUserDataScope('user-123'));
  assert.equal(resolveLocalDataScope(null), GUEST_DATA_SCOPE);
 });
});
