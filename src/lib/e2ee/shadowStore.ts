import type { PendingSyncOperation, Subscription } from '../../types';
import type { DataScope } from '../../utils/dataScope';
import { isLocalAccountMarkedEncrypted } from './deviceKeyStore';

export interface ShadowCategoryItem {
  id: string;
  name: string;
  order: number;
  isBuiltIn: boolean;
  isHidden: boolean;
}

interface ShadowBucket {
  subscriptions: Subscription[];
  pendingOperations: PendingSyncOperation[];
  categories: ShadowCategoryItem[];
  pendingCategories: ShadowCategoryItem[] | null;
}

const activeAccountUsers = new Set<string>();
const unlockedUsers = new Set<string>();
const shadowBuckets = new Map<string, ShadowBucket>();
let flushListener: ((userId: string) => void) | null = null;

export function registerShadowFlushListener(listener: ((userId: string) => void) | null): void {
  flushListener = listener;
}

export function setShadowAccountActive(userId: string, active: boolean): void {
  if (active) {
    activeAccountUsers.add(userId);
  } else {
    activeAccountUsers.delete(userId);
    unlockedUsers.delete(userId);
    shadowBuckets.delete(userId);
  }
}

export function setShadowAccountUnlocked(userId: string, unlocked: boolean): void {
  if (unlocked) {
    unlockedUsers.add(userId);
  } else {
    unlockedUsers.delete(userId);
    shadowBuckets.delete(userId);
  }
}

export function resetAllShadowStores(): void {
  activeAccountUsers.clear();
  unlockedUsers.clear();
  shadowBuckets.clear();
}

export function getOrCreateShadowBucket(
  userId: string,
  fallbackCategories: readonly ShadowCategoryItem[] = []
): ShadowBucket {
  let bucket = shadowBuckets.get(userId);
  if (!bucket) {
    bucket = {
      subscriptions: [],
      pendingOperations: [],
      categories: fallbackCategories.map(item => ({ ...item })),
      pendingCategories: null,
    };
    shadowBuckets.set(userId, bucket);
  }
  return bucket;
}

export function extractUserIdFromScope(scope?: DataScope): string | null {
  if (!scope || scope === 'guest') {
    return null;
  }
  return scope.startsWith('user:') ? scope.slice('user:'.length) : null;
}

export function isScopeProtectedByE2ee(scope?: DataScope): boolean {
  const userId = extractUserIdFromScope(scope);
  if (!userId) return false;
  return activeAccountUsers.has(userId) || isLocalAccountMarkedEncrypted(userId);
}

export function isShadowUserUnlocked(userId: string): boolean {
  return unlockedUsers.has(userId);
}

function notifyFlush(userId: string): void {
  flushListener?.(userId);
}

export function readEncryptedShadowSubscriptions(userId: string): Subscription[] {
  if (!unlockedUsers.has(userId)) return [];
  return structuredClone(getOrCreateShadowBucket(userId).subscriptions);
}

export function writeEncryptedShadowSubscriptions(userId: string, subscriptions: Subscription[]): void {
  if (!unlockedUsers.has(userId)) return;
  getOrCreateShadowBucket(userId).subscriptions = structuredClone(subscriptions);
  notifyFlush(userId);
}

export function readEncryptedShadowPendingOps(userId: string): PendingSyncOperation[] {
  if (!unlockedUsers.has(userId)) return [];
  return structuredClone(getOrCreateShadowBucket(userId).pendingOperations);
}

export function writeEncryptedShadowPendingOps(userId: string, ops: PendingSyncOperation[]): void {
  if (!unlockedUsers.has(userId)) return;
  getOrCreateShadowBucket(userId).pendingOperations = structuredClone(ops);
  notifyFlush(userId);
}

export function readEncryptedShadowCategories(
  userId: string,
  fallbackCategories: readonly ShadowCategoryItem[] = []
): ShadowCategoryItem[] {
  if (!unlockedUsers.has(userId)) {
    return fallbackCategories.map(item => ({ ...item }));
  }
  const bucket = getOrCreateShadowBucket(userId, fallbackCategories);
  if (bucket.categories.length === 0 && fallbackCategories.length > 0) {
    bucket.categories = fallbackCategories.map(item => ({ ...item }));
  }
  return structuredClone(bucket.categories);
}

export function writeEncryptedShadowCategories(
  userId: string,
  categories: ShadowCategoryItem[]
): void {
  if (!unlockedUsers.has(userId)) return;
  getOrCreateShadowBucket(userId).categories = structuredClone(categories);
  notifyFlush(userId);
}

export function readEncryptedShadowPendingCategories(userId: string): ShadowCategoryItem[] | null {
  if (!unlockedUsers.has(userId)) return null;
  const pending = getOrCreateShadowBucket(userId).pendingCategories;
  return pending ? structuredClone(pending) : null;
}

export function writeEncryptedShadowPendingCategories(
  userId: string,
  categories: ShadowCategoryItem[] | null
): void {
  if (!unlockedUsers.has(userId)) return;
  getOrCreateShadowBucket(userId).pendingCategories = categories ? structuredClone(categories) : null;
  notifyFlush(userId);
}
