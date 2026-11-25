import type { ReminderSettings, Subscription } from '../../types';
import type { Category } from '../../utils/categories';
import { normalizeSubscriptionRecord } from '../../utils/subscriptionDomain';
import {
  type BarkE2eeMode,
  computeDekControlProofHash,
  computeSubscriptionPushHash,
  createDekCheck,
  decryptCategoryPayload,
  decryptSubscriptionPayload,
  deriveDekControlProof,
  deriveMnemonicKek,
  encryptCategoryPayload,
  encryptSubscriptionPayload,
  type EncryptedCategoryContent,
  type EncryptedSubscriptionContent,
  type Envelope,
  generateDekBytes,
  generateRandomSaltBase64,
  importDek,
  isValidBarkEncryptionKey,
  wrapDek,
} from './crypto';
import { buildPushSchedulesForAllSubscriptions } from './pushScheduleBuilder';
import type { VaultMigrationRpcClient } from './vaultEnable';

interface PreparedEncryptedOperationSnapshot {
  token: string;
  key_epoch: number;
  snapshot: {
    subscriptions: Array<{
      id: string;
      envelope: Envelope;
      revision: number;
      created_at?: string;
      updated_at?: string;
    }>;
    categories: Array<{
      category_id: string;
      envelope: Envelope;
      revision: number;
    }>;
  };
}

export interface RotateVaultDekOptions {
  userId: string;
  currentDek: CryptoKey;
  currentDekBytes: Uint8Array;
  currentKeyEpoch: number;
  newMnemonicPhrase: string;
  barkMode: BarkE2eeMode;
  barkEncryptionKey?: string | null;
}

export interface CompletedVaultDekRotation {
  newDekBytes: Uint8Array;
  newDek: CryptoKey;
  newKeyEpoch: number;
  subscriptions: Subscription[];
  categories: Category[];
}

export interface DisableVaultMigrationOptions {
  userId: string;
  currentDek: CryptoKey;
  currentDekBytes: Uint8Array;
  currentKeyEpoch: number;
}

function subscriptionToEncryptedContent(sub: Subscription): EncryptedSubscriptionContent {
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

async function prepareAndDecryptSnapshot(
  client: VaultMigrationRpcClient,
  userId: string,
  currentDek: CryptoKey,
  expectedKeyEpoch: number
): Promise<{
  token: string;
  keyEpoch: number;
  subscriptions: Subscription[];
  categories: Category[];
}> {
  const { data: prepData, error: prepError } = await client.rpc('prepare_e2ee_encrypted_operation');
  if (prepError) throw prepError;

  const prepared = prepData as PreparedEncryptedOperationSnapshot;
  const keyEpoch = prepared.key_epoch;
  if (keyEpoch !== expectedKeyEpoch) {
    throw new Error('Encryption key epoch changed on another device. Refresh and try again.');
  }

  const subscriptions: Subscription[] = [];
  for (const row of prepared.snapshot.subscriptions ?? []) {
    const content = await decryptSubscriptionPayload(
      currentDek,
      userId,
      row.id,
      row.envelope,
      keyEpoch
    );
    subscriptions.push(
      encryptedContentToSubscription(row.id, content, row.created_at, row.updated_at)
    );
  }

  const categories: Category[] = [];
  for (const row of prepared.snapshot.categories ?? []) {
    const content = await decryptCategoryPayload(
      currentDek,
      userId,
      row.category_id,
      row.envelope,
      keyEpoch
    );
    categories.push({
      id: row.category_id,
      name: content.name,
      order: content.order,
      isBuiltIn: content.isBuiltIn,
      isHidden: content.isHidden,
    });
  }
  categories.sort((a, b) => a.order - b.order);

  return {
    token: prepared.token,
    keyEpoch,
    subscriptions,
    categories,
  };
}

/**
 * Rotates the master DEK (`key_epoch + 1`), re-encrypting every subscription, category,
 * and push schedule atomically under the new DEK and new 16-word recovery phrase slot.
 * Previous recovery phrases, Passkey slots, and `vk1_` MCP/Bridge tokens become invalid.
 */
export async function executeRotateVaultDek(
  client: VaultMigrationRpcClient,
  options: RotateVaultDekOptions,
  reminderSettings: ReminderSettings
): Promise<CompletedVaultDekRotation> {
  const { token, keyEpoch, subscriptions, categories } = await prepareAndDecryptSnapshot(
    client,
    options.userId,
    options.currentDek,
    options.currentKeyEpoch
  );

  const currentControlProof = await deriveDekControlProof(
    options.currentDekBytes,
    options.userId,
    keyEpoch
  );

  const newKeyEpoch = keyEpoch + 1;
  const newDekBytes = generateDekBytes();

  try {
    const newDek = await importDek(newDekBytes);
    const newDekCheck = await createDekCheck(newDek, options.userId, newKeyEpoch);
    const newControlProof = await deriveDekControlProof(newDekBytes, options.userId, newKeyEpoch);
    const newDekVerifierHash = await computeDekControlProofHash(newControlProof);

    const recoverySalt = generateRandomSaltBase64(32);
    const recoveryKek = await deriveMnemonicKek(options.newMnemonicPhrase, recoverySalt);
    const recoveryWrappedDek = await wrapDek(
      recoveryKek,
      newDekBytes,
      options.userId,
      'recovery_mnemonic',
      newKeyEpoch
    );

    const encryptedSubscriptionsPayload: Array<{
      id: string;
      envelope: Envelope;
      subscription_hash: string;
    }> = [];
    for (const sub of subscriptions) {
      const envelope = await encryptSubscriptionPayload(
        newDek,
        options.userId,
        sub.id,
        subscriptionToEncryptedContent(sub),
        newKeyEpoch
      );
      const subscriptionHash = await computeSubscriptionPushHash(newDekBytes, sub.id);
      encryptedSubscriptionsPayload.push({
        id: sub.id,
        envelope,
        subscription_hash: subscriptionHash,
      });
    }

    const encryptedCategoriesPayload: Array<{ category_id: string; envelope: Envelope }> = [];
    for (const cat of categories) {
      const content: EncryptedCategoryContent = {
        id: cat.id,
        name: cat.name,
        order: cat.order,
        isBuiltIn: cat.isBuiltIn,
        isHidden: cat.isHidden,
      };
      const envelope = await encryptCategoryPayload(
        newDek,
        options.userId,
        cat.id,
        content,
        newKeyEpoch
      );
      encryptedCategoriesPayload.push({ category_id: cat.id, envelope });
    }

    const barkKey =
      options.barkMode === 'bark_e2ee'
      && options.barkEncryptionKey
      && isValidBarkEncryptionKey(options.barkEncryptionKey)
        ? options.barkEncryptionKey.trim()
        : null;

    const pushScheduleRows = await buildPushSchedulesForAllSubscriptions(
      subscriptions,
      newDekBytes,
      {
        barkEnabled: Boolean(reminderSettings.barkPush.enabled && reminderSettings.barkPush.deviceKey),
        daysBefore: reminderSettings.barkPush.daysBefore,
        timeZone: reminderSettings.timeZone,
        locale: reminderSettings.locale,
        barkMode: options.barkMode,
        barkEncryptionKey: barkKey,
      }
    );

    const { data: returnedEpoch, error } = await client.rpc('rotate_e2ee_dek', {
      p_snapshot_token: token,
      p_current_control_proof: currentControlProof,
      p_new_dek_check: newDekCheck,
      p_new_dek_verifier_hash: newDekVerifierHash,
      p_recovery_label: '16-Word Recovery Phrase',
      p_recovery_kdf_params: {
        alg: 'HKDF-SHA256',
        salt: recoverySalt,
        info: 'steadyrenew-e2ee-mnemonic-kek-v1',
      },
      p_recovery_wrapped_dek: recoveryWrappedDek,
      p_subscriptions: encryptedSubscriptionsPayload,
      p_categories: encryptedCategoriesPayload,
      p_push_schedules: pushScheduleRows,
    });
    if (error) throw error;

    const confirmedEpoch = typeof returnedEpoch === 'number' ? returnedEpoch : newKeyEpoch;
    return {
      newDekBytes: newDekBytes.slice(),
      newDek,
      newKeyEpoch: confirmedEpoch,
      subscriptions,
      categories,
    };
  } finally {
    newDekBytes.fill(0);
  }
}

/**
 * Atomically disables E2EE using a server snapshot token (preventing concurrent write loss)
 * and a one-way DEK control proof (preventing blind downgrade without DEK possession).
 */
export async function executeDisableVaultMigration(
  client: VaultMigrationRpcClient,
  options: DisableVaultMigrationOptions
): Promise<{ subscriptions: Subscription[]; categories: Category[] }> {
  const { token, keyEpoch, subscriptions, categories } = await prepareAndDecryptSnapshot(
    client,
    options.userId,
    options.currentDek,
    options.currentKeyEpoch
  );

  const controlProof = await deriveDekControlProof(
    options.currentDekBytes,
    options.userId,
    keyEpoch
  );

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

  const { error } = await client.rpc('disable_e2ee_vault', {
    p_snapshot_token: token,
    p_control_proof: controlProof,
    p_subscriptions: plaintextSubscriptionsPayload,
    p_categories: plaintextCategoriesPayload,
  });
  if (error) throw error;

  return { subscriptions, categories };
}
