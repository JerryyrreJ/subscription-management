import type { ReminderSettings, Subscription } from '../../types';
import type { Category } from '../../utils/categories';
import { normalizeSubscriptionRecord } from '../../utils/subscriptionDomain';
import {
  type BarkE2eeMode,
  computeDekControlProofHash,
  computeSubscriptionPushHash,
  createDekCheck,
  deriveDekControlProof,
  deriveMnemonicKek,
  derivePrfKek,
  encryptCategoryPayload,
  encryptSubscriptionPayload,
  type EncryptedSubscriptionContent,
  type Envelope,
  generateDekBytes,
  generateRandomSaltBase64,
  importDek,
  isValidBarkEncryptionKey,
  wrapDek,
} from './crypto';
import type { PasskeyPrfKdfParams } from './passkeyPrf';
import { buildPushSchedulesForAllSubscriptions } from './pushScheduleBuilder';

export interface VaultEnablePasskeyMaterial {
  label: string;
  credentialId: string;
  prfBytes: Uint8Array;
  kdfParams: PasskeyPrfKdfParams;
}

export interface EnableVaultOptions {
  userId: string;
  userEmail: string;
  mnemonicPhrase: string;
  passkeyMaterial?: VaultEnablePasskeyMaterial | null;
  barkMode?: BarkE2eeMode;
  barkEncryptionKey?: string | null;
  rememberDevice?: boolean;
  localSubscriptions: Subscription[];
  localCategories: Category[];
}

export interface VaultMigrationRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export interface CompletedVaultMigration {
  dekBytes: Uint8Array;
  dek: CryptoKey;
  barkKey: string | null;
  mergedSubscriptions: Subscription[];
  categoriesToEncrypt: Category[];
}

function subscriptionToEncryptedContent(
  sub: Subscription | Omit<Subscription, 'id'>
): EncryptedSubscriptionContent {
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

/**
 * Executes the atomic E2EE migration RPC (`prepare_e2ee_migration` -> `enable_e2ee_vault`).
 *
 * Operates on a local copy of `passkeyMaterial.prfBytes` so failed migration attempts
 * (e.g. concurrent-edit 40001 conflicts or network retries) never zeroize caller-held
 * PRF material in place. Caller PRF bytes are only zeroized after `enable_e2ee_vault` succeeds.
 */
export async function executeEnableVaultMigration(
  client: VaultMigrationRpcClient,
  options: EnableVaultOptions,
  reminderSettings: ReminderSettings
): Promise<CompletedVaultMigration> {
  const { data: prepData, error: prepError } = await client.rpc('prepare_e2ee_migration');
  if (prepError) throw prepError;

  const prepared = prepData as {
    token: string;
    snapshot: {
      subscriptions: Array<Record<string, unknown>>;
      categories: Array<Record<string, unknown>>;
    };
  };

  const dekBytes = generateDekBytes();
  let enabledSuccessfully = false;
  try {
    const initialKeyEpoch = 1;
    const dek = await importDek(dekBytes);
    const dekCheck = await createDekCheck(dek, options.userId, initialKeyEpoch);
    const controlProof = await deriveDekControlProof(dekBytes, options.userId, initialKeyEpoch);
    const dekVerifierHash = await computeDekControlProofHash(controlProof);

    // Slot 1: Mandatory 16-word recovery phrase slot
    const mnemonicSalt = generateRandomSaltBase64(32);
    const mnemonicKek = await deriveMnemonicKek(options.mnemonicPhrase, mnemonicSalt);
    const mnemonicWrappedDek = await wrapDek(
      mnemonicKek,
      dekBytes,
      options.userId,
      'recovery_mnemonic',
      initialKeyEpoch
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
      const prfBytesCopy = options.passkeyMaterial.prfBytes.slice();
      try {
        const prfKek = await derivePrfKek(
          prfBytesCopy,
          options.passkeyMaterial.kdfParams.hkdfSalt
        );
        const prfWrappedDek = await wrapDek(
          prfKek,
          dekBytes,
          options.userId,
          'passkey_prf',
          initialKeyEpoch
        );
        keySlotsPayload.push({
          slot_type: 'passkey_prf',
          label: options.passkeyMaterial.label,
          credential_id: options.passkeyMaterial.credentialId,
          kdf_params: options.passkeyMaterial.kdfParams,
          wrapped_dek: prfWrappedDek,
        });
      } finally {
        prfBytesCopy.fill(0);
      }
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

    const encryptedSubscriptionsPayload: Array<{
      id: string;
      envelope: Envelope;
      subscription_hash: string;
    }> = [];
    for (const sub of mergedSubscriptions) {
      const envelope = await encryptSubscriptionPayload(
        dek,
        options.userId,
        sub.id,
        subscriptionToEncryptedContent(sub),
        initialKeyEpoch
      );
      const subscriptionHash = await computeSubscriptionPushHash(dekBytes, sub.id);
      encryptedSubscriptionsPayload.push({
        id: sub.id,
        envelope,
        subscription_hash: subscriptionHash,
      });
    }

    const encryptedCategoriesPayload: Array<{ category_id: string; envelope: Envelope }> = [];
    for (const cat of categoriesToEncrypt) {
      const envelope = await encryptCategoryPayload(
        dek,
        options.userId,
        cat.id,
        {
          id: cat.id,
          name: cat.name,
          order: cat.order,
          isBuiltIn: cat.isBuiltIn,
          isHidden: cat.isHidden,
        },
        initialKeyEpoch
      );
      encryptedCategoriesPayload.push({ category_id: cat.id, envelope });
    }

    const barkMode: BarkE2eeMode = options.barkMode ?? 'generic';
    const barkKey =
      barkMode === 'bark_e2ee' && options.barkEncryptionKey && isValidBarkEncryptionKey(options.barkEncryptionKey)
        ? options.barkEncryptionKey.trim()
        : null;

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

    const { error: enableError } = await client.rpc('enable_e2ee_vault', {
      p_snapshot_token: prepared.token,
      p_dek_check: dekCheck,
      p_dek_verifier_hash: dekVerifierHash,
      p_bark_mode: barkMode,
      p_key_slots: keySlotsPayload,
      p_subscriptions: encryptedSubscriptionsPayload,
      p_categories: encryptedCategoriesPayload,
      p_push_schedules: pushScheduleRows,
    });
    if (enableError) throw enableError;
    enabledSuccessfully = true;

    return {
      dekBytes: dekBytes.slice(),
      dek,
      barkKey,
      mergedSubscriptions,
      categoriesToEncrypt,
    };
  } finally {
    dekBytes.fill(0);
    if (enabledSuccessfully && options.passkeyMaterial) {
      options.passkeyMaterial.prfBytes.fill(0);
    }
  }
}
