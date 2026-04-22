import {
 clearCategories,
 clearPendingCategorySync,
 loadCategories,
 loadPendingCategorySync,
 saveCategories,
 savePendingCategorySync
} from './categories';
import { DataScope, GUEST_DATA_SCOPE, getUserDataScope } from './dataScope';
import {
 clearNotificationSettings,
 loadNotificationSettings,
 saveNotificationSettings
} from './notificationChecker';
import {
 clearLocalDataOwner,
 clearPendingSyncOperations,
 clearSubscriptions,
 loadLocalDataOwner,
 loadLastLocalDataOwnerUserId,
 loadPendingSyncOperations,
 loadSubscriptions,
 LocalDataOwner,
 saveLocalDataOwner,
 saveLastLocalDataOwnerUserId,
 savePendingSyncOperations,
 saveSubscriptions
} from './storage';

const createOwnerRecord = (userId: string, claimedAt: string = new Date().toISOString()): LocalDataOwner => ({
 userId,
 claimedAt,
 lastSeenAt: claimedAt,
});

export const claimLocalDataOwnership = (userId: string, scope: DataScope = GUEST_DATA_SCOPE): LocalDataOwner => {
 const existingOwner = loadLocalDataOwner(scope);
 const claimedAt = existingOwner?.userId === userId ? existingOwner.claimedAt : new Date().toISOString();
 const owner = createOwnerRecord(userId, claimedAt);
 saveLocalDataOwner(owner, scope);
 saveLastLocalDataOwnerUserId(userId);
 return owner;
};

export const refreshLocalDataOwnership = (userId: string, scope: DataScope = GUEST_DATA_SCOPE): LocalDataOwner => {
 const existingOwner = loadLocalDataOwner(scope);
 const owner = {
  userId,
  claimedAt: existingOwner?.userId === userId ? existingOwner.claimedAt : new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
 };
 saveLocalDataOwner(owner, scope);
 saveLastLocalDataOwnerUserId(userId);
 return owner;
};

export const getLastLocalDataOwnerUserId = (): string | null => loadLastLocalDataOwnerUserId();

export const isOwnedGuestDataForUser = (userId: string): boolean =>
 loadLocalDataOwner(GUEST_DATA_SCOPE)?.userId === userId;

export const resolveLocalDataScope = (userId: string | null | undefined): DataScope => {
 if (!userId) {
  return GUEST_DATA_SCOPE;
 }

 const guestOwner = loadLocalDataOwner(GUEST_DATA_SCOPE);
 if (guestOwner?.userId === userId) {
  return GUEST_DATA_SCOPE;
 }

 return getUserDataScope(userId);
};

export const resolveCurrentLocalDataScope = (userId: string | null | undefined): DataScope => {
 if (userId) {
  return resolveLocalDataScope(userId);
 }

 const lastOwnerUserId = getLastLocalDataOwnerUserId();
 return lastOwnerUserId ? resolveLocalDataScope(lastOwnerUserId) : GUEST_DATA_SCOPE;
};

export const migrateUnownedGuestDataToUserScope = (userId: string): boolean => {
 if (loadLocalDataOwner(GUEST_DATA_SCOPE) || getLastLocalDataOwnerUserId()) {
  return false;
 }

 const targetScope = getUserDataScope(userId);
 const guestSubscriptions = loadSubscriptions(GUEST_DATA_SCOPE);
 const guestPendingOperations = loadPendingSyncOperations(GUEST_DATA_SCOPE);
 const guestCategories = loadCategories(GUEST_DATA_SCOPE);
 const guestPendingCategories = loadPendingCategorySync(GUEST_DATA_SCOPE);
 const guestNotificationSettings = loadNotificationSettings(GUEST_DATA_SCOPE);

 saveSubscriptions(guestSubscriptions, targetScope);
 savePendingSyncOperations(guestPendingOperations, targetScope);
 saveCategories(guestCategories, targetScope);
 if (guestPendingCategories) {
  savePendingCategorySync(guestPendingCategories, targetScope);
 } else {
  clearPendingCategorySync(targetScope);
 }
 saveNotificationSettings(guestNotificationSettings, targetScope);
 claimLocalDataOwnership(userId, targetScope);

 clearSubscriptions(GUEST_DATA_SCOPE);
 clearPendingSyncOperations(GUEST_DATA_SCOPE);
 clearCategories(GUEST_DATA_SCOPE);
 clearPendingCategorySync(GUEST_DATA_SCOPE);
 clearNotificationSettings(GUEST_DATA_SCOPE);

 return true;
};

export const migrateOwnedGuestDataToUserScope = (userId: string): void => {
 const guestOwner = loadLocalDataOwner(GUEST_DATA_SCOPE);
 if (!guestOwner || guestOwner.userId !== userId) {
  return;
 }

 const targetScope = getUserDataScope(userId);
 const guestSubscriptions = loadSubscriptions(GUEST_DATA_SCOPE);
 const guestPendingOperations = loadPendingSyncOperations(GUEST_DATA_SCOPE);
 const guestCategories = loadCategories(GUEST_DATA_SCOPE);
 const guestPendingCategories = loadPendingCategorySync(GUEST_DATA_SCOPE);
 const guestNotificationSettings = loadNotificationSettings(GUEST_DATA_SCOPE);

 saveSubscriptions(guestSubscriptions, targetScope);
 savePendingSyncOperations(guestPendingOperations, targetScope);
 saveCategories(guestCategories, targetScope);
 if (guestPendingCategories) {
  savePendingCategorySync(guestPendingCategories, targetScope);
 } else {
  clearPendingCategorySync(targetScope);
 }
 saveNotificationSettings(guestNotificationSettings, targetScope);
 saveLocalDataOwner(
  {
   ...guestOwner,
   lastSeenAt: new Date().toISOString(),
  },
  targetScope
 );
 saveLastLocalDataOwnerUserId(userId);

 clearSubscriptions(GUEST_DATA_SCOPE);
 clearPendingSyncOperations(GUEST_DATA_SCOPE);
 clearCategories(GUEST_DATA_SCOPE);
 clearPendingCategorySync(GUEST_DATA_SCOPE);
 clearNotificationSettings(GUEST_DATA_SCOPE);
 clearLocalDataOwner(GUEST_DATA_SCOPE);
};
