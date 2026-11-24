import { supabase } from '../supabase';
import type { ReminderSettings, Subscription } from '../../types';
import type { Category } from '../../utils/categories';
import { DEFAULT_CATEGORIES } from '../../utils/categories';
import { getUserDataScope, type DataScope } from '../../utils/dataScope';
import { normalizeSubscriptionRecord } from '../../utils/subscriptionDomain';
import { loadNotificationSettings } from '../../utils/notificationChecker';
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
  createDekCheck,
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
  generateDekBytes,
  generateRandomSaltBase64,
  importDek,
  isValidBarkEncryptionKey,
  isValidEnvelope,
  type KeySlotType,
  unwrapDek,
  verifyDekCheck,
  wrapDek,
} from './crypto';
import {
  clearLocalAccountEncryptedFlag,
  clearTrustedDeviceVaultMaterial,
  isLocalAccountMarkedEncrypted,
  loadEncryptedOfflineSnapshot,
  markLocalAccountEncrypted,
  persistTrustedDeviceVaultMaterial,
  restoreTrustedDeviceVaultMaterial,
  saveEncryptedOfflineSnapshot,
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

export type VaultStatus = 'disabled' | 'locked' | 'unlocked';

export interface VaultStateSnapshot {
  userId: string | null;
  status: VaultStatus;
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
}

let activeUserId: string | null = null;
let currentAccount: E2eeAccountRow | null = null;
let currentKeySlots: E2eeKeySlotRow[] = [];
let unlockedSession: ActiveUnlockedSession | null = null;

export const E2EE_STATE_CHANGED_EVENT = 'steadyrenew:e2ee-state-changed';

function emitVaultStateChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(E2EE_STATE_CHANGED_EVENT));
  }
}

function scheduleEncryptedLocalFlush(userId: string): void {
  if (!unlockedSession || unlockedSession.userId !== userId) {
    return;
  }
  const sessionRef = unlockedSession;
  const store = getOrCreateShadowBucket(userId, DEFAULT_CATEGORIES);
  void saveEncryptedOfflineSnapshot(sessionRef.dek, userId, {
    subscriptions: store.subscriptions,
    pendingOperations: store.pendingOperations,
    categories: store.categories,
    pendingCategories: store.pendingCategories,
  });
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
  if (!activeUserId || !currentAccount) {
    return {
      userId: activeUserId,
      status: 'disabled',
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

export function resetVaultOnSignOut(): void {
  clearInMemorySession();
  activeUserId = null;
  currentAccount = null;
  currentKeySlots = [];
  resetAllShadowStores();
  emitVaultStateChanged();
}

async function hydrateShadowFromLocalCache(dek: CryptoKey, userId: string): Promise<void> {
  const cached = await loadEncryptedOfflineSnapshot(dek, userId);
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
    resetVaultOnSignOut();
    return getVaultSnapshot();
  }

  if (activeUserId !== userId) {
    clearInMemorySession();
    activeUserId = userId;
    currentAccount = null;
    currentKeySlots = [];
  }

  const { data: accountData, error: accountError } = await supabase
    .from('e2ee_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  // Gracefully tolerate environments where the E2EE v2 migration has not been applied yet
  if (accountError) {
    const code = (accountError as { code?: string }).code ?? '';
    const msg = accountError.message ?? '';
    if (code === '42P01' || code === 'PGRST205' || msg.includes('e2ee_accounts')) {
      currentAccount = null;
      currentKeySlots = [];
      clearLocalAccountEncryptedFlag(userId);
      emitVaultStateChanged();
      return getVaultSnapshot();
    }
    throw accountError;
  }

  if (!accountData) {
    clearInMemorySession();
    currentAccount = null;
    currentKeySlots = [];
    setShadowAccountActive(userId, false);
    clearLocalAccountEncryptedFlag(userId);
    await clearTrustedDeviceVaultMaterial(userId);
    emitVaultStateChanged();
    return getVaultSnapshot();
  }

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
        };
        setShadowAccountUnlocked(userId, true);
        await hydrateShadowFromLocalCache(dek, userId);
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
  };
  setShadowAccountUnlocked(userId, true);

  await hydrateShadowFromLocalCache(dek, userId);

  if (rememberDevice) {
    await persistTrustedDeviceVaultMaterial(
      userId,
      dekBytes,
      account.key_epoch,
      preservedBarkKey
    );
  }

  if (usedSlotId && supabase) {
    void supabase
      .from('e2ee_key_slots')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', usedSlotId)
      .eq('user_id', userId);
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
      const dekBytes = await unwrapDek(kek, slot.wrapped_dek, userId, 'recovery_mnemonic');
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
    const dekBytes = await unwrapDek(kek, targetSlot.wrapped_dek, userId, 'passkey_prf');
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
        row.envelope
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
    const envelope = await encryptSubscriptionPayload(sessionRef.dek, userId, id, content);

    const { data, error } = await supabase
      .from('encrypted_subscriptions')
      .insert([{ id, user_id: userId, envelope }])
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
      content
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
        row.envelope
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
    const envelope = await encryptCategoryPayload(sessionRef.dek, userId, category.id, content);
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
    const envelope = await encryptCategoryPayload(sessionRef.dek, userId, category.id, content);
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

export interface EnableVaultOptions {
  userId: string;
  userEmail: string;
  mnemonicPhrase: string;
  passkeyMaterial?: {
    label: string;
    credentialId: string;
    prfBytes: Uint8Array;
    kdfParams: PasskeyPrfKdfParams;
  } | null;
  barkMode?: BarkE2eeMode;
  barkEncryptionKey?: string | null;
  localSubscriptions: Subscription[];
  localCategories: Category[];
}

export async function enableVaultForAccount(options: EnableVaultOptions): Promise<void> {
  if (!supabase) throw new Error('Cloud sync not available');

  const { data: prepData, error: prepError } = await supabase.rpc('prepare_e2ee_migration');
  if (prepError) throw prepError;

  const prepared = prepData as {
    token: string;
    snapshot: {
      subscriptions: Array<Record<string, unknown>>;
      categories: Array<Record<string, unknown>>;
    };
  };

  const dekBytes = generateDekBytes();
  try {
    const dek = await importDek(dekBytes);
    const dekCheck = await createDekCheck(dek, options.userId, 1);

    // Slot 1: Mandatory 16-word recovery phrase slot
    const mnemonicSalt = generateRandomSaltBase64(32);
    const mnemonicKek = await deriveMnemonicKek(options.mnemonicPhrase, mnemonicSalt);
    const mnemonicWrappedDek = await wrapDek(
      mnemonicKek,
      dekBytes,
      options.userId,
      'recovery_mnemonic'
    );

    const keySlotsPayload: Array<Record<string, unknown>> = [
      {
        slot_type: 'recovery_mnemonic',
        label: '16-Word Recovery Phrase',
        credential_id: null,
        kdf_params: {
          alg: 'HKDF-SHA256',
          salt: mnemonicSalt,
          info: 'steadyrenew-e2ee-mnemonic-kek-v1',
        },
        wrapped_dek: mnemonicWrappedDek,
      },
    ];

    // Slot 2 (Optional): WebAuthn Passkey PRF slot registered during wizard
    if (options.passkeyMaterial) {
      const prfKek = await derivePrfKek(
        options.passkeyMaterial.prfBytes,
        options.passkeyMaterial.kdfParams.hkdfSalt
      );
      const prfWrappedDek = await wrapDek(prfKek, dekBytes, options.userId, 'passkey_prf');
      keySlotsPayload.push({
        slot_type: 'passkey_prf',
        label: options.passkeyMaterial.label,
        credential_id: options.passkeyMaterial.credentialId,
        kdf_params: options.passkeyMaterial.kdfParams,
        wrapped_dek: prfWrappedDek,
      });
    }

    // Merge server snapshot with local state so nothing is dropped
    const serverSubById = new Map<string, Subscription>();
    for (const raw of prepared.snapshot.subscriptions ?? []) {
      const id = String(raw.id);
      serverSubById.set(
        id,
        normalizeSubscriptionRecord({
          id,
          name: String(raw.name ?? ''),
          category: String(raw.category ?? 'Other'),
          amount: Number(raw.amount ?? 0),
          currency: String(raw.currency ?? 'USD') as Subscription['currency'],
          period: String(raw.period ?? 'monthly') as Subscription['period'],
          lastPaymentDate: String(raw.last_payment_date ?? ''),
          nextPaymentDate: String(raw.next_payment_date ?? ''),
          billingAnchorDay:
            raw.billing_anchor_day !== null && raw.billing_anchor_day !== undefined
              ? Number(raw.billing_anchor_day)
              : undefined,
          customDate: raw.custom_date ? String(raw.custom_date) : undefined,
          notificationEnabled: raw.notification_enabled !== false,
          isTrial: Boolean(raw.is_trial),
          trialEndsOn: raw.trial_ends_on ? String(raw.trial_ends_on) : undefined,
          status: (raw.status as Subscription['status']) ?? 'active',
        })
      );
    }
    for (const localSub of options.localSubscriptions) {
      if (!serverSubById.has(localSub.id)) {
        serverSubById.set(localSub.id, localSub);
      }
    }
    const mergedSubscriptions = [...serverSubById.values()];

    const serverCategories: Category[] = (prepared.snapshot.categories ?? []).map((raw, idx) => ({
      id: String(raw.category_id ?? `cat-${idx}`),
      name: String(raw.name ?? 'Unnamed'),
      order: typeof raw.order === 'number' ? raw.order : idx,
      isBuiltIn: Boolean(raw.is_built_in),
      isHidden: Boolean(raw.is_hidden),
    }));
    const categoriesToEncrypt =
      serverCategories.length > 0 ? serverCategories : options.localCategories;

    const encryptedSubscriptionsPayload: Array<{ id: string; envelope: Envelope }> = [];
    for (const sub of mergedSubscriptions) {
      const envelope = await encryptSubscriptionPayload(
        dek,
        options.userId,
        sub.id,
        subscriptionToEncryptedContent(sub)
      );
      encryptedSubscriptionsPayload.push({ id: sub.id, envelope });
    }

    const encryptedCategoriesPayload: Array<{ category_id: string; envelope: Envelope }> = [];
    for (const cat of categoriesToEncrypt) {
      const envelope = await encryptCategoryPayload(dek, options.userId, cat.id, {
        id: cat.id,
        name: cat.name,
        order: cat.order,
        isBuiltIn: cat.isBuiltIn,
        isHidden: cat.isHidden,
      });
      encryptedCategoriesPayload.push({ category_id: cat.id, envelope });
    }

    const barkMode: BarkE2eeMode = options.barkMode ?? 'generic';
    const barkKey =
      barkMode === 'bark_e2ee' && options.barkEncryptionKey && isValidBarkEncryptionKey(options.barkEncryptionKey)
        ? options.barkEncryptionKey.trim()
        : null;

    const reminderSettings = loadNotificationSettings(getUserDataScope(options.userId));
    const pushScheduleRows = await buildPushSchedulesForAllSubscriptions(
      mergedSubscriptions,
      dekBytes,
      {
        barkEnabled: Boolean(reminderSettings.barkPush.enabled && reminderSettings.barkPush.deviceKey),
        daysBefore: reminderSettings.barkPush.daysBefore,
        timeZone: reminderSettings.timeZone,
        locale: reminderSettings.locale,
        barkMode,
        barkEncryptionKey: barkKey,
      }
    );

    const { error: enableError } = await supabase.rpc('enable_e2ee_vault', {
      p_snapshot_token: prepared.token,
      p_dek_check: dekCheck,
      p_bark_mode: barkMode,
      p_key_slots: keySlotsPayload,
      p_subscriptions: encryptedSubscriptionsPayload,
      p_categories: encryptedCategoriesPayload,
      p_push_schedules: pushScheduleRows,
    });
    if (enableError) throw enableError;

    markLocalAccountEncrypted(options.userId);
    const dekCopy = dekBytes.slice();
    await persistTrustedDeviceVaultMaterial(options.userId, dekCopy, 1, barkKey);

    unlockedSession = {
      userId: options.userId,
      keyEpoch: 1,
      dekBytes: dekCopy,
      dek,
      barkEncryptionKey: barkKey,
    };
    setShadowAccountActive(options.userId, true);
    setShadowAccountUnlocked(options.userId, true);

    const store = getOrCreateShadowBucket(options.userId, DEFAULT_CATEGORIES);
    store.subscriptions = structuredClone(mergedSubscriptions);
    store.pendingOperations = [];
    store.categories = structuredClone(categoriesToEncrypt);
    store.pendingCategories = null;
    scheduleEncryptedLocalFlush(options.userId);

    await syncVaultAccountState(options.userId);
  } finally {
    dekBytes.fill(0);
    if (options.passkeyMaterial) {
      options.passkeyMaterial.prfBytes.fill(0);
    }
  }
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
    const wrappedDek = await wrapDek(kek, sessionRef.dekBytes, userId, 'passkey_prf');
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
  const salt = generateRandomSaltBase64(32);
  const kek = await deriveMnemonicKek(newMnemonicPhrase, salt);
  const wrappedDek = await wrapDek(kek, sessionRef.dekBytes, userId, 'recovery_mnemonic');

  const { error } = await supabase.rpc('replace_e2ee_recovery_slot', {
    p_label: '16-Word Recovery Phrase',
    p_kdf_params: {
      alg: 'HKDF-SHA256',
      salt,
      info: 'steadyrenew-e2ee-mnemonic-kek-v1',
    },
    p_wrapped_dek: wrappedDek,
  });
  if (error) throw error;
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

  await persistTrustedDeviceVaultMaterial(
    userId,
    sessionRef.dekBytes,
    sessionRef.keyEpoch,
    normalizedKey
  );

  await rebuildAllEncryptedPushSchedules(userId, subscriptions);
  emitVaultStateChanged();
}

export async function disableVaultForAccount(userId: string): Promise<{
  subscriptions: Subscription[];
  categories: Category[];
}> {
  if (!supabase) throw new Error('Cloud sync not available');
  requireUnlockedSession(userId);

  const subscriptions = await EncryptedSubscriptionStore.list(userId);
  const categories = await EncryptedCategoryStore.list(userId);

  const plaintextSubscriptionsPayload = subscriptions.map(sub => ({
    id: sub.id,
    name: sub.name,
    category: sub.category,
    amount: sub.amount,
    currency: sub.currency,
    period: sub.period,
    last_payment_date: sub.lastPaymentDate,
    next_payment_date: sub.nextPaymentDate,
    billing_anchor_day:
      sub.period === 'monthly' ? (sub.billingAnchorDay ?? null) : null,
    custom_date: sub.period === 'custom' ? (sub.customDate ?? null) : null,
    notification_enabled: sub.notificationEnabled,
    is_trial: Boolean(sub.isTrial),
    trial_ends_on: sub.isTrial ? (sub.trialEndsOn ?? sub.nextPaymentDate) : null,
    status: sub.status ?? 'active',
  }));

  const plaintextCategoriesPayload = categories.map((cat, idx) => ({
    category_id: cat.id,
    name: cat.name,
    order: typeof cat.order === 'number' ? cat.order : idx,
    is_built_in: Boolean(cat.isBuiltIn),
    is_hidden: Boolean(cat.isHidden),
  }));

  const { error } = await supabase.rpc('disable_e2ee_vault', {
    p_subscriptions: plaintextSubscriptionsPayload,
    p_categories: plaintextCategoriesPayload,
  });
  if (error) throw error;

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
