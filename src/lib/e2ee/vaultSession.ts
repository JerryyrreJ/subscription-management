import { supabase } from '../supabase';
import type { ReminderSettings, Subscription } from '../../types';
import type { Category } from '../../utils/categories';
import { DEFAULT_CATEGORIES } from '../../utils/categories';
import { getUserDataScope, type DataScope } from '../../utils/dataScope';
import { normalizeSubscriptionRecord } from '../../utils/subscriptionDomain';
import { loadNotificationSettings } from '../../utils/notificationChecker';
import { isRememberMeEnabled } from '../../utils/rememberMe';
import {
  extractUserIdFromScope,
  getOrCreateShadowBucket,
  isScopeProtectedByE2ee,
  readEncryptedShadowCategories,
  readEncryptedShadowPendingCategories,
  readEncryptedShadowPendingOps,
  readEncryptedShadowSubscriptions,
  registerShadowFlushListener,
  resetAllShadowStores,
  setShadowAccountActive,
  setShadowAccountUnlocked,
  writeEncryptedShadowCategories,
  writeEncryptedShadowPendingCategories,
  writeEncryptedShadowPendingOps,
  writeEncryptedShadowSubscriptions,
} from './shadowStore';
import {
  type BarkE2eeMode,
  computeSubscriptionPushHash,
  decryptCategoryPayload,
  decryptSubscriptionPayload,
  deriveMnemonicKek,
  derivePrfKek,
  encodeVaultKeyToken,
  encryptCategoryPayload,
  encryptSubscriptionPayload,
  type EncryptedCategoryContent,
  type EncryptedSubscriptionContent,
  type Envelope,
  importDek,
  isValidBarkEncryptionKey,
  isValidEnvelope,
  type KeySlotType,
  unwrapDek,
  verifyDekCheck,
  wrapDek,
} from './crypto';
import {
  executeEnableVaultMigration,
  type EnableVaultOptions,
} from './vaultEnable';
import {
  executeDisableVaultMigration,
  executeRotateVaultDek,
} from './vaultLifecycle';
import {
  clearEncryptedOfflineSnapshot,
  clearLocalAccountEncryptedFlag,
  clearTrustedDeviceVaultMaterial,
  isLocalAccountMarkedEncrypted,
  loadEncryptedOfflineSnapshot,
  markLocalAccountEncrypted,
  persistTrustedDeviceVaultMaterial,
  restoreTrustedDeviceVaultMaterial,
  saveEncryptedOfflineSnapshot,
  scrubPlaintextUserLocalStorage,
} from './deviceKeyStore';
import {
  evaluatePasskeyForVaultSlots,
  type PasskeyPrfKdfParams,
  type PasskeySlotCandidate,
  registerPasskeyForVault,
} from './passkeyPrf';
import {
  buildPushSchedulesForAllSubscriptions,
  buildPushSchedulesForSubscription,
  type PushScheduleContext,
} from './pushScheduleBuilder';

export interface E2eeAccountRow {
  user_id: string;
  key_epoch: number;
  dek_check: Envelope;
  bark_mode: BarkE2eeMode;
  created_at: string;
  updated_at: string;
}

export interface E2eeKeySlotRow {
  id: string;
  user_id: string;
  slot_type: KeySlotType;
  label: string;
  credential_id: string | null;
  kdf_params: Record<string, unknown>;
  wrapped_dek: Envelope;
  created_at: string;
  last_used_at: string | null;
}

export type VaultStatus = 'disabled' | 'locked' | 'unlocked' | 'downgrade_blocked';
export type VaultDowngradeReason = 'account_missing' | 'table_unavailable' | null;

export interface VaultStateSnapshot {
  userId: string | null;
  status: VaultStatus;
  downgradeReason: VaultDowngradeReason;
  account: E2eeAccountRow | null;
  keySlots: E2eeKeySlotRow[];
  hasPasskeySlot: boolean;
  barkMode: BarkE2eeMode;
  hasBarkEncryptionKey: boolean;
  barkEncryptionKey: string | null;
}

interface ActiveUnlockedSession {
  userId: string;
  keyEpoch: number;
  dekBytes: Uint8Array;
  dek: CryptoKey;
  barkEncryptionKey: string | null;
  rememberDevice: boolean;
}

let activeUserId: string | null = null;
let currentAccount: E2eeAccountRow | null = null;
let currentKeySlots: E2eeKeySlotRow[] = [];
let unlockedSession: ActiveUnlockedSession | null = null;
let downgradeBlockedReason: VaultDowngradeReason = null;

export const E2EE_STATE_CHANGED_EVENT = 'steadyrenew:e2ee-state-changed';

function emitVaultStateChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(E2EE_STATE_CHANGED_EVENT));
  }
}

function scheduleEncryptedLocalFlush(userId: string): void {
  if (!unlockedSession || unlockedSession.userId !== userId || !unlockedSession.rememberDevice) {
    return;
  }
  const sessionRef = unlockedSession;
  const store = getOrCreateShadowBucket(userId, DEFAULT_CATEGORIES);
  void saveEncryptedOfflineSnapshot(
    sessionRef.dek,
    userId,
    {
      subscriptions: store.subscriptions,
      pendingOperations: store.pendingOperations,
      categories: store.categories,
      pendingCategories: store.pendingCategories,
    },
    sessionRef.keyEpoch
  );
}

registerShadowFlushListener(scheduleEncryptedLocalFlush);

export {
  extractUserIdFromScope,
  isScopeProtectedByE2ee,
  readEncryptedShadowCategories,
  readEncryptedShadowPendingCategories,
  readEncryptedShadowPendingOps,
  readEncryptedShadowSubscriptions,
  writeEncryptedShadowCategories,
  writeEncryptedShadowPendingCategories,
  writeEncryptedShadowPendingOps,
  writeEncryptedShadowSubscriptions,
};
export type { DataScope };

export function isVaultActiveForUser(userId: string): boolean {
  return currentAccount?.user_id === userId || isLocalAccountMarkedEncrypted(userId);
}

export function isVaultUnlockedForUser(userId: string): boolean {
  return unlockedSession?.userId === userId;
}

export function getVaultSnapshot(): VaultStateSnapshot {
  if (activeUserId && downgradeBlockedReason) {
    return {
      userId: activeUserId,
      status: 'downgrade_blocked',
      downgradeReason: downgradeBlockedReason,
      account: null,
      keySlots: [],
      hasPasskeySlot: false,
      barkMode: 'generic',
      hasBarkEncryptionKey: false,
      barkEncryptionKey: null,
    };
  }

  if (!activeUserId || !currentAccount) {
    return {
      userId: activeUserId,
      status: 'disabled',
      downgradeReason: null,
      account: null,
      keySlots: [],
      hasPasskeySlot: false,
      barkMode: 'generic',
      hasBarkEncryptionKey: false,
      barkEncryptionKey: null,
    };
  }

  const isUnlocked = unlockedSession?.userId === activeUserId;
  const barkKey = isUnlocked ? unlockedSession?.barkEncryptionKey ?? null : null;

  return {
    userId: activeUserId,
    status: isUnlocked ? 'unlocked' : 'locked',
    downgradeReason: null,
    account: currentAccount,
    keySlots: [...currentKeySlots],
    hasPasskeySlot: currentKeySlots.some(slot => slot.slot_type === 'passkey_prf'),
    barkMode: currentAccount.bark_mode,
    hasBarkEncryptionKey: Boolean(barkKey && isValidBarkEncryptionKey(barkKey)),
    barkEncryptionKey: barkKey,
  };
}

export function getUnlockedVaultKeyToken(userId: string): string | null {
  if (!unlockedSession || unlockedSession.userId !== userId) {
    return null;
  }
  return encodeVaultKeyToken(unlockedSession.dekBytes);
}

function clearInMemorySession(): void {
  if (unlockedSession) {
    setShadowAccountUnlocked(unlockedSession.userId, false);
    unlockedSession.dekBytes.fill(0);
    unlockedSession = null;
  }
}

export async function resetVaultOnSignOut(userId?: string | null): Promise<void> {
  const targetUserId = userId ?? activeUserId ?? unlockedSession?.userId ?? null;
  clearInMemorySession();
  activeUserId = null;
  currentAccount = null;
  currentKeySlots = [];
  downgradeBlockedReason = null;
  resetAllShadowStores();
  if (targetUserId) {
    clearEncryptedOfflineSnapshot(targetUserId);
  }
  emitVaultStateChanged();
  if (targetUserId) {
    await clearTrustedDeviceVaultMaterial(targetUserId);
  }
}

/**
 * Explicit user-confirmed escape hatch when a locally pinned E2EE account was intentionally
 * disabled on another device. Clears local E2EE pins so standard cloud sync can resume.
 */
export async function acknowledgeVaultDowngrade(userId: string): Promise<VaultStateSnapshot> {
  clearInMemorySession();
  currentAccount = null;
  currentKeySlots = [];
  downgradeBlockedReason = null;
  setShadowAccountActive(userId, false);
  clearLocalAccountEncryptedFlag(userId);
  await clearTrustedDeviceVaultMaterial(userId);
  emitVaultStateChanged();
  return getVaultSnapshot();
}

export async function clearDeletedAccountVaultData(userId: string): Promise<void> {
  await resetVaultOnSignOut(userId);
  clearLocalAccountEncryptedFlag(userId);
  scrubPlaintextUserLocalStorage(userId);
}

async function hydrateShadowFromLocalCache(
  dek: CryptoKey,
  userId: string,
  keyEpoch: number
): Promise<void> {
  const cached = await loadEncryptedOfflineSnapshot(dek, userId, keyEpoch);
  if (!cached) return;
  const store = getOrCreateShadowBucket(userId, DEFAULT_CATEGORIES);
  store.subscriptions = Array.isArray(cached.subscriptions) ? cached.subscriptions : [];
  store.pendingOperations = Array.isArray(cached.pendingOperations) ? cached.pendingOperations : [];
  store.categories = Array.isArray(cached.categories) && cached.categories.length > 0
    ? cached.categories
    : DEFAULT_CATEGORIES.map(cat => ({ ...cat }));
  store.pendingCategories = Array.isArray(cached.pendingCategories) ? cached.pendingCategories : null;
}

/**
 * Synchronizes the in-memory vault state with Supabase for `userId`, automatically
 * restoring an unlocked session from IndexedDB if this browser was previously unlocked.
 */
export async function syncVaultAccountState(userId: string | null): Promise<VaultStateSnapshot> {
  if (!userId || !supabase) {
    await resetVaultOnSignOut();
    return getVaultSnapshot();
  }

  if (activeUserId !== userId) {
    clearInMemorySession();
    activeUserId = userId;
    currentAccount = null;
    currentKeySlots = [];
    downgradeBlockedReason = null;
  }

  const wasLocallyPinned = isLocalAccountMarkedEncrypted(userId);

  const { data: accountData, error: accountError } = await supabase
    .from('e2ee_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  // Fail closed if this browser previously pinned this account as E2EE-enabled;
  // only tolerate missing E2EE tables when the account was never locally pinned.
  if (accountError) {
    const code = (accountError as { code?: string }).code ?? '';
    const msg = accountError.message ?? '';
    if (code === '42P01' || code === 'PGRST205' || msg.includes('e2ee_accounts')) {
      clearInMemorySession();
      currentAccount = null;
      currentKeySlots = [];
      if (wasLocallyPinned) {
        downgradeBlockedReason = 'table_unavailable';
        setShadowAccountActive(userId, true);
        setShadowAccountUnlocked(userId, false);
      } else {
        downgradeBlockedReason = null;
        clearLocalAccountEncryptedFlag(userId);
      }
      emitVaultStateChanged();
      return getVaultSnapshot();
    }
    throw accountError;
  }

  if (!accountData) {
    clearInMemorySession();
    currentAccount = null;
    currentKeySlots = [];
    if (wasLocallyPinned) {
      // Never silently clear the local E2EE pin or fall back to plaintext sync without
      // explicit user confirmation.
      downgradeBlockedReason = 'account_missing';
      setShadowAccountActive(userId, true);
      setShadowAccountUnlocked(userId, false);
      emitVaultStateChanged();
      return getVaultSnapshot();
    }
    downgradeBlockedReason = null;
    setShadowAccountActive(userId, false);
    clearLocalAccountEncryptedFlag(userId);
    await clearTrustedDeviceVaultMaterial(userId);
    emitVaultStateChanged();
    return getVaultSnapshot();
  }

  downgradeBlockedReason = null;
  const account = accountData as E2eeAccountRow;
  currentAccount = account;
  setShadowAccountActive(userId, true);
  markLocalAccountEncrypted(userId);

  const { data: slotsData, error: slotsError } = await supabase
    .from('e2ee_key_slots')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (slotsError) {
    throw slotsError;
  }
  currentKeySlots = (slotsData ?? []) as E2eeKeySlotRow[];

  if (!unlockedSession || unlockedSession.userId !== userId || unlockedSession.keyEpoch !== account.key_epoch) {
    const restored = await restoreTrustedDeviceVaultMaterial(userId, account.key_epoch);
    if (restored) {
      const dek = await importDek(restored.dekBytes);
      const valid = await verifyDekCheck(dek, account.dek_check, userId, account.key_epoch);
      if (valid) {
        unlockedSession = {
          userId,
          keyEpoch: account.key_epoch,
          dekBytes: restored.dekBytes,
          dek,
          barkEncryptionKey: restored.barkEncryptionKey,
          rememberDevice: true,
        };
        setShadowAccountUnlocked(userId, true);
        await hydrateShadowFromLocalCache(dek, userId, account.key_epoch);
      } else {
        restored.dekBytes.fill(0);
        await clearTrustedDeviceVaultMaterial(userId);
      }
    }
  }

  emitVaultStateChanged();
  return getVaultSnapshot();
}

async function activateUnlockedSession(
  userId: string,
  account: E2eeAccountRow,
  dekBytes: Uint8Array,
  rememberDevice: boolean,
  barkEncryptionKey?: string | null,
  usedSlotId?: string
): Promise<void> {
  const dek = await importDek(dekBytes);
  const ok = await verifyDekCheck(dek, account.dek_check, userId, account.key_epoch);
  if (!ok) {
    dekBytes.fill(0);
    throw new Error('Decryption verification failed. The provided key does not match this vault.');
  }

  const preservedBarkKey = barkEncryptionKey ?? unlockedSession?.barkEncryptionKey ?? null;
  clearInMemorySession();
  unlockedSession = {
    userId,
    keyEpoch: account.key_epoch,
    dekBytes,
    dek,
    barkEncryptionKey: preservedBarkKey,
    rememberDevice,
  };
  setShadowAccountUnlocked(userId, true);

  if (rememberDevice) {
    await hydrateShadowFromLocalCache(dek, userId, account.key_epoch);
    await persistTrustedDeviceVaultMaterial(
      userId,
      dekBytes,
      account.key_epoch,
      preservedBarkKey
    );
  } else {
    clearEncryptedOfflineSnapshot(userId);
    await clearTrustedDeviceVaultMaterial(userId);
  }

  if (usedSlotId && supabase) {
    void supabase
      .from('e2ee_key_slots')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', usedSlotId)
      .eq('user_id', userId)
      .then(({ error }) => {
        if (error) {
          console.warn('Failed to update E2EE key slot last_used_at:', error.message);
        }
      });
  }

  emitVaultStateChanged();
}

export async function unlockVaultWithMnemonic(
  userId: string,
  mnemonicPhrase: string,
  rememberDevice: boolean = true
): Promise<void> {
  if (!currentAccount || currentAccount.user_id !== userId) {
    await syncVaultAccountState(userId);
  }
  if (!currentAccount || currentAccount.user_id !== userId) {
    throw new Error('End-to-end encryption is not enabled on this account.');
  }

  const mnemonicSlots = currentKeySlots.filter(slot => slot.slot_type === 'recovery_mnemonic');
  if (mnemonicSlots.length === 0) {
    throw new Error('No recovery phrase slot found on this account.');
  }

  let lastError: unknown = null;
  for (const slot of mnemonicSlots) {
    const salt = typeof slot.kdf_params?.salt === 'string' ? slot.kdf_params.salt : '';
    if (!salt) continue;
    try {
      const kek = await deriveMnemonicKek(mnemonicPhrase, salt);
      const dekBytes = await unwrapDek(
        kek,
        slot.wrapped_dek,
        userId,
        'recovery_mnemonic',
        currentAccount.key_epoch
      );
      await activateUnlockedSession(userId, currentAccount, dekBytes, rememberDevice, undefined, slot.id);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error && lastError.name === 'MnemonicValidationError') {
    throw lastError;
  }
  throw new Error('Incorrect recovery phrase. Check the 16 words and their order.');
}

export async function unlockVaultWithPasskey(
  userId: string,
  rememberDevice: boolean = true
): Promise<void> {
  if (!currentAccount || currentAccount.user_id !== userId) {
    await syncVaultAccountState(userId);
  }
  if (!currentAccount || currentAccount.user_id !== userId) {
    throw new Error('End-to-end encryption is not enabled on this account.');
  }

  const candidates: PasskeySlotCandidate[] = currentKeySlots
    .filter(slot => slot.slot_type === 'passkey_prf' && Boolean(slot.credential_id))
    .map(slot => ({
      id: slot.id,
      credentialId: slot.credential_id!,
      kdfParams: slot.kdf_params as unknown as PasskeyPrfKdfParams,
    }))
    .filter(item => Boolean(item.kdfParams?.prfSalt && item.kdfParams?.hkdfSalt));

  if (candidates.length === 0) {
    throw new Error('No Passkey unlock slot is configured for this account.');
  }

  const evaluated = await evaluatePasskeyForVaultSlots(candidates);
  try {
    const targetSlot = currentKeySlots.find(slot => slot.id === evaluated.slotId);
    if (!targetSlot) {
      throw new Error('Matching Passkey slot no longer exists.');
    }
    const kek = await derivePrfKek(evaluated.prfBytes, evaluated.kdfParams.hkdfSalt);
    const dekBytes = await unwrapDek(
      kek,
      targetSlot.wrapped_dek,
      userId,
      'passkey_prf',
      currentAccount.key_epoch
    );
    await activateUnlockedSession(userId, currentAccount, dekBytes, rememberDevice, undefined, targetSlot.id);
  } finally {
    evaluated.prfBytes.fill(0);
  }
}

export async function lockVaultOnThisDevice(userId: string): Promise<void> {
  clearInMemorySession();
  setShadowAccountUnlocked(userId, false);
  await clearTrustedDeviceVaultMaterial(userId);
  emitVaultStateChanged();
}

function requireUnlockedSession(expectedUserId?: string): ActiveUnlockedSession {
  if (!unlockedSession) {
    throw new Error('Encrypted vault is locked. Unlock your vault first.');
  }
  if (expectedUserId && unlockedSession.userId !== expectedUserId) {
    throw new Error('Authenticated user changed during encrypted vault operation.');
  }
  return unlockedSession;
}

function subscriptionToEncryptedContent(sub: Subscription | Omit<Subscription, 'id'>): EncryptedSubscriptionContent {
  return {
    name: sub.name,
    category: sub.category,
    amount: sub.amount,
    currency: sub.currency,
    period: sub.period,
    lastPaymentDate: sub.lastPaymentDate,
    nextPaymentDate: sub.nextPaymentDate,
    billingAnchorDay: sub.billingAnchorDay ?? null,
    customDate: sub.customDate,
    notificationEnabled: sub.notificationEnabled !== false,
    isTrial: Boolean(sub.isTrial),
    trialEndsOn: sub.trialEndsOn,
    status: sub.status ?? 'active',
  };
}

function encryptedContentToSubscription(
  id: string,
  content: EncryptedSubscriptionContent,
  createdAt?: string,
  updatedAt?: string
): Subscription {
  return normalizeSubscriptionRecord({
    id,
    name: content.name,
    category: content.category,
    amount: Number(content.amount),
    currency: content.currency as Subscription['currency'],
    period: content.period,
    lastPaymentDate: content.lastPaymentDate,
    nextPaymentDate: content.nextPaymentDate,
    billingAnchorDay: content.billingAnchorDay ?? undefined,
    customDate: content.customDate || undefined,
    notificationEnabled: content.notificationEnabled,
    isTrial: Boolean(content.isTrial),
    trialEndsOn: content.trialEndsOn || undefined,
    status: content.status ?? 'active',
    createdAt,
    updatedAt,
  });
}

function resolvePushScheduleContext(userId: string): PushScheduleContext {
  const settings: ReminderSettings = loadNotificationSettings(getUserDataScope(userId));
  return {
    barkEnabled: Boolean(settings.barkPush.enabled && settings.barkPush.deviceKey),
    daysBefore: settings.barkPush.daysBefore,
    timeZone: settings.timeZone,
    locale: settings.locale,
    barkMode: currentAccount?.bark_mode ?? 'generic',
    barkEncryptionKey: unlockedSession?.barkEncryptionKey ?? null,
  };
}

export async function syncEncryptedPushScheduleForSubscription(
  userId: string,
  subscription: Subscription | null,
  deletedSubscriptionId?: string
): Promise<void> {
  if (!supabase || !isVaultUnlockedForUser(userId)) {
    return;
  }
  const sessionRef = requireUnlockedSession(userId);
  const subId = subscription?.id ?? deletedSubscriptionId;
  if (!subId) return;

  const subHash = await computeSubscriptionPushHash(sessionRef.dekBytes, subId);

  await supabase
    .from('encrypted_push_schedules')
    .delete()
    .eq('user_id', userId)
    .eq('subscription_hash', subHash)
    .is('dispatched_at', null);

  if (!subscription) {
    return;
  }

  const ctx = resolvePushScheduleContext(userId);
  const { rows } = await buildPushSchedulesForSubscription(subscription, sessionRef.dekBytes, ctx);
  if (rows.length > 0) {
    await supabase.from('encrypted_push_schedules').upsert(
      rows.map(row => ({
        user_id: userId,
        ...row,
      })),
      { onConflict: 'user_id,subscription_hash,trigger_date' }
    );
  }
}

export async function rebuildAllEncryptedPushSchedules(
  userId: string,
  subscriptions: readonly Subscription[]
): Promise<void> {
  if (!supabase || !isVaultUnlockedForUser(userId)) {
    return;
  }
  const sessionRef = requireUnlockedSession(userId);
  const ctx = resolvePushScheduleContext(userId);
  const rows = await buildPushSchedulesForAllSubscriptions(subscriptions, sessionRef.dekBytes, ctx);

  await supabase
    .from('encrypted_push_schedules')
    .delete()
    .eq('user_id', userId)
    .is('dispatched_at', null);

  if (rows.length > 0) {
    const { error } = await supabase.from('encrypted_push_schedules').upsert(
      rows.map(row => ({
        user_id: userId,
        ...row,
      })),
      { onConflict: 'user_id,subscription_hash,trigger_date' }
    );
    if (error) {
      console.error('Failed to rebuild encrypted push schedules:', error);
    }
  }
}

// Row-level Subscription CRUD for SubscriptionService -------------------------

export const EncryptedSubscriptionStore = {
  async list(userId: string): Promise<Subscription[]> {
    if (!supabase) throw new Error('Cloud sync not available');
    const sessionRef = requireUnlockedSession(userId);
    const { data, error } = await supabase
      .from('encrypted_subscriptions')
      .select('id, envelope, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const rows = (data ?? []) as Array<{
      id: string;
      envelope: Envelope;
      created_at: string;
      updated_at: string;
    }>;

    const decrypted: Subscription[] = [];
    for (const row of rows) {
      const content = await decryptSubscriptionPayload(
        sessionRef.dek,
        userId,
        row.id,
        row.envelope,
        sessionRef.keyEpoch
      );
      decrypted.push(
        encryptedContentToSubscription(row.id, content, row.created_at, row.updated_at)
      );
    }
    return decrypted;
  },

  async create(
    userId: string,
    subscription: Subscription | Omit<Subscription, 'id'>
  ): Promise<Subscription> {
    if (!supabase) throw new Error('Cloud sync not available');
    const sessionRef = requireUnlockedSession(userId);
    const id = 'id' in subscription && subscription.id ? subscription.id : globalThis.crypto.randomUUID();
    const content = subscriptionToEncryptedContent(subscription);
    const envelope = await encryptSubscriptionPayload(
      sessionRef.dek,
      userId,
      id,
      content,
      sessionRef.keyEpoch
    );
    const subscriptionHash = await computeSubscriptionPushHash(sessionRef.dekBytes, id);

    const { data, error } = await supabase
      .from('encrypted_subscriptions')
      .insert([{ id, user_id: userId, envelope, subscription_hash: subscriptionHash }])
      .select('id, created_at, updated_at')
      .single();

    if (error) throw error;
    const created = encryptedContentToSubscription(
      data.id,
      content,
      data.created_at,
      data.updated_at
    );
    void syncEncryptedPushScheduleForSubscription(userId, created);
    return created;
  },

  async update(userId: string, subscription: Subscription): Promise<Subscription> {
    if (!supabase) throw new Error('Cloud sync not available');
    const sessionRef = requireUnlockedSession(userId);
    const content = subscriptionToEncryptedContent(subscription);
    const envelope = await encryptSubscriptionPayload(
      sessionRef.dek,
      userId,
      subscription.id,
      content,
      sessionRef.keyEpoch
    );

    const { data, error } = await supabase
      .from('encrypted_subscriptions')
      .update({ envelope })
      .eq('user_id', userId)
      .eq('id', subscription.id)
      .select('id, created_at, updated_at')
      .single();

    if (error) throw error;
    const updated = encryptedContentToSubscription(
      data.id,
      content,
      data.created_at,
      data.updated_at
    );
    void syncEncryptedPushScheduleForSubscription(userId, updated);
    return updated;
  },

  async remove(userId: string, id: string): Promise<void> {
    if (!supabase) throw new Error('Cloud sync not available');
    requireUnlockedSession(userId);
    const { error } = await supabase
      .from('encrypted_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);

    if (error) throw error;
    void syncEncryptedPushScheduleForSubscription(userId, null, id);
  },
};

// Row-level Category CRUD for CategoryService ---------------------------------

export const EncryptedCategoryStore = {
  async list(userId: string): Promise<Category[]> {
    if (!supabase) throw new Error('Cloud sync not available');
    const sessionRef = requireUnlockedSession(userId);
    const { data, error } = await supabase
      .from('encrypted_categories')
      .select('category_id, envelope')
      .eq('user_id', userId);

    if (error) throw error;
    const rows = (data ?? []) as Array<{ category_id: string; envelope: Envelope }>;
    const categories: Category[] = [];
    for (const row of rows) {
      const content = await decryptCategoryPayload(
        sessionRef.dek,
        userId,
        row.category_id,
        row.envelope,
        sessionRef.keyEpoch
      );
      categories.push({
        id: row.category_id,
        name: content.name,
        order: content.order,
        isBuiltIn: content.isBuiltIn,
        isHidden: content.isHidden,
      });
    }
    return categories.sort((a, b) => a.order - b.order);
  },

  async create(userId: string, category: Category): Promise<Category> {
    if (!supabase) throw new Error('Cloud sync not available');
    const sessionRef = requireUnlockedSession(userId);
    const content: EncryptedCategoryContent = {
      id: category.id,
      name: category.name,
      order: category.order,
      isBuiltIn: category.isBuiltIn,
      isHidden: category.isHidden,
    };
    const envelope = await encryptCategoryPayload(
      sessionRef.dek,
      userId,
      category.id,
      content,
      sessionRef.keyEpoch
    );
    const { error } = await supabase
      .from('encrypted_categories')
      .upsert([{ category_id: category.id, user_id: userId, envelope }], {
        onConflict: 'user_id,category_id',
      });
    if (error) throw error;
    return { ...category };
  },

  async update(userId: string, category: Category): Promise<Category> {
    if (!supabase) throw new Error('Cloud sync not available');
    const sessionRef = requireUnlockedSession(userId);
    const content: EncryptedCategoryContent = {
      id: category.id,
      name: category.name,
      order: category.order,
      isBuiltIn: category.isBuiltIn,
      isHidden: category.isHidden,
    };
    const envelope = await encryptCategoryPayload(
      sessionRef.dek,
      userId,
      category.id,
      content,
      sessionRef.keyEpoch
    );
    const { error } = await supabase
      .from('encrypted_categories')
      .update({ envelope })
      .eq('user_id', userId)
      .eq('category_id', category.id);
    if (error) throw error;
    return { ...category };
  },

  async remove(userId: string, categoryId: string): Promise<void> {
    if (!supabase) throw new Error('Cloud sync not available');
    requireUnlockedSession(userId);
    const { error } = await supabase
      .from('encrypted_categories')
      .delete()
      .eq('user_id', userId)
      .eq('category_id', categoryId);
    if (error) throw error;
  },

  async updateOrder(userId: string, categories: Category[]): Promise<void> {
    for (let index = 0; index < categories.length; index += 1) {
      await this.create(userId, { ...categories[index], order: index });
    }
  },
};

// Vault Lifecycle: Enable, Add/Remove Key Slots, Bark E2EE, Disable -----------

export type { EnableVaultOptions };

export async function enableVaultForAccount(options: EnableVaultOptions): Promise<void> {
  if (!supabase) throw new Error('Cloud sync not available');

  const reminderSettings = loadNotificationSettings(getUserDataScope(options.userId));
  const completed = await executeEnableVaultMigration(supabase, options, reminderSettings);

  const rememberDevice = options.rememberDevice ?? isRememberMeEnabled();
  markLocalAccountEncrypted(options.userId);
  if (rememberDevice) {
    await persistTrustedDeviceVaultMaterial(options.userId, completed.dekBytes, 1, completed.barkKey);
  } else {
    clearEncryptedOfflineSnapshot(options.userId);
    await clearTrustedDeviceVaultMaterial(options.userId);
  }

  unlockedSession = {
    userId: options.userId,
    keyEpoch: 1,
    dekBytes: completed.dekBytes,
    dek: completed.dek,
    barkEncryptionKey: completed.barkKey,
    rememberDevice,
  };
  setShadowAccountActive(options.userId, true);
  setShadowAccountUnlocked(options.userId, true);

  const store = getOrCreateShadowBucket(options.userId, DEFAULT_CATEGORIES);
  store.subscriptions = structuredClone(completed.mergedSubscriptions);
  store.pendingOperations = [];
  store.categories = structuredClone(completed.categoriesToEncrypt);
  store.pendingCategories = null;
  if (rememberDevice) {
    scheduleEncryptedLocalFlush(options.userId);
  }

  await syncVaultAccountState(options.userId);
}

export async function addPasskeySlotToVault(
  userId: string,
  userEmail: string,
  label: string
): Promise<void> {
  if (!supabase) throw new Error('Cloud sync not available');
  const sessionRef = requireUnlockedSession(userId);
  const registered = await registerPasskeyForVault(userId, userEmail, label);
  try {
    const kek = await derivePrfKek(registered.prfBytes, registered.kdfParams.hkdfSalt);
    const wrappedDek = await wrapDek(
      kek,
      sessionRef.dekBytes,
      userId,
      'passkey_prf',
      sessionRef.keyEpoch
    );
    const { error } = await supabase.rpc('add_e2ee_key_slot', {
      p_slot_type: 'passkey_prf',
      p_label: label.trim() || 'Passkey',
      p_credential_id: registered.credentialId,
      p_kdf_params: registered.kdfParams,
      p_wrapped_dek: wrappedDek,
    });
    if (error) throw error;
    await syncVaultAccountState(userId);
  } finally {
    registered.prfBytes.fill(0);
  }
}

export async function regenerateRecoveryPhraseSlot(
  userId: string,
  newMnemonicPhrase: string
): Promise<void> {
  if (!supabase) throw new Error('Cloud sync not available');
  const sessionRef = requireUnlockedSession(userId);
  const reminderSettings = loadNotificationSettings(getUserDataScope(userId));
  const barkMode: BarkE2eeMode = currentAccount?.bark_mode ?? 'generic';
  const rememberDevice = sessionRef.rememberDevice;
  const preservedBarkKey = sessionRef.barkEncryptionKey;

  const rotated = await executeRotateVaultDek(
    supabase,
    {
      userId,
      currentDek: sessionRef.dek,
      currentDekBytes: sessionRef.dekBytes,
      currentKeyEpoch: sessionRef.keyEpoch,
      newMnemonicPhrase,
      barkMode,
      barkEncryptionKey: preservedBarkKey,
    },
    reminderSettings
  );

  // Swap active in-memory session to the rotated DEK + keyEpoch and zero old DEK bytes.
  clearInMemorySession();
  unlockedSession = {
    userId,
    keyEpoch: rotated.newKeyEpoch,
    dekBytes: rotated.newDekBytes,
    dek: rotated.newDek,
    barkEncryptionKey: preservedBarkKey,
    rememberDevice,
  };
  setShadowAccountActive(userId, true);
  setShadowAccountUnlocked(userId, true);

  const store = getOrCreateShadowBucket(userId, DEFAULT_CATEGORIES);
  store.subscriptions = structuredClone(rotated.subscriptions);
  store.pendingOperations = [];
  store.categories = structuredClone(rotated.categories);
  store.pendingCategories = null;

  if (rememberDevice) {
    await persistTrustedDeviceVaultMaterial(
      userId,
      rotated.newDekBytes,
      rotated.newKeyEpoch,
      preservedBarkKey
    );
    scheduleEncryptedLocalFlush(userId);
  } else {
    clearEncryptedOfflineSnapshot(userId);
    await clearTrustedDeviceVaultMaterial(userId);
  }

  await syncVaultAccountState(userId);
}

export async function removeKeySlotFromVault(userId: string, slotId: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync not available');
  requireUnlockedSession(userId);
  const { error } = await supabase.rpc('remove_e2ee_key_slot', {
    p_slot_id: slotId,
  });
  if (error) throw error;
  await syncVaultAccountState(userId);
}

export async function updateVaultBarkSettings(
  userId: string,
  barkMode: BarkE2eeMode,
  barkEncryptionKey: string | null,
  subscriptions: readonly Subscription[]
): Promise<void> {
  if (!supabase) throw new Error('Cloud sync not available');
  const sessionRef = requireUnlockedSession(userId);
  const normalizedKey =
    barkMode === 'bark_e2ee' && barkEncryptionKey && isValidBarkEncryptionKey(barkEncryptionKey)
      ? barkEncryptionKey.trim()
      : null;

  if (barkMode === 'bark_e2ee' && !normalizedKey) {
    throw new Error('Provide a valid 16- or 32-character Bark encryption key.');
  }

  const { error } = await supabase
    .from('e2ee_accounts')
    .update({ bark_mode: barkMode })
    .eq('user_id', userId);
  if (error) throw error;

  sessionRef.barkEncryptionKey = normalizedKey;
  if (currentAccount && currentAccount.user_id === userId) {
    currentAccount = { ...currentAccount, bark_mode: barkMode };
  }

  if (sessionRef.rememberDevice) {
    await persistTrustedDeviceVaultMaterial(
      userId,
      sessionRef.dekBytes,
      sessionRef.keyEpoch,
      normalizedKey
    );
  }

  await rebuildAllEncryptedPushSchedules(userId, subscriptions);
  emitVaultStateChanged();
}

export async function disableVaultForAccount(userId: string): Promise<{
  subscriptions: Subscription[];
  categories: Category[];
}> {
  if (!supabase) throw new Error('Cloud sync not available');
  const sessionRef = requireUnlockedSession(userId);

  const { subscriptions, categories } = await executeDisableVaultMigration(supabase, {
    userId,
    currentDek: sessionRef.dek,
    currentDekBytes: sessionRef.dekBytes,
    currentKeyEpoch: sessionRef.keyEpoch,
  });

  downgradeBlockedReason = null;
  clearLocalAccountEncryptedFlag(userId);
  await clearTrustedDeviceVaultMaterial(userId);
  clearInMemorySession();
  currentAccount = null;
  currentKeySlots = [];
  setShadowAccountActive(userId, false);
  emitVaultStateChanged();

  return { subscriptions, categories };
}

export function isPlaintextGuardError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = String((error as { message?: string }).message ?? '');
  return msg.includes('E2EE is enabled for this account');
}

export { isValidEnvelope };
