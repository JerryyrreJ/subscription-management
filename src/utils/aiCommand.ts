import type { Currency, Period, Subscription } from '../types';
import { DEFAULT_CURRENCY } from './currency';
import { formatDateOnly, parseDateOnly, subtractBillingPeriodFromDate } from './dates';
import { normalizeDrafts, type DraftSubscription } from './subscriptionDraft';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS, subscriptionPatchInputSchema } from './subscriptionDomain';

export interface AiSubscriptionContextItem {
  id: string;
  name: string;
  category: string;
  amount: number;
  currency: Currency;
  period: Period;
  lastPaymentDate: string;
  nextPaymentDate: string;
  customDate?: string;
  notificationEnabled: boolean;
}

export interface AiCreateCommand {
  type: 'create';
  drafts: DraftSubscription[];
  message?: string;
}

export type AiUpdateMissingField = 'customDate';

export interface AiUpdateOperation {
  subscriptionId: string;
  patch: Partial<Pick<
    Subscription,
    'name' | 'category' | 'amount' | 'currency' | 'period' | 'lastPaymentDate' | 'customDate' | 'notificationEnabled'
  >>;
  missingFields?: AiUpdateMissingField[];
  message?: string;
}

export interface AiUpdateCommand extends AiUpdateOperation {
  type: 'update';
}

export interface AiBatchUpdateCommand {
  type: 'batchUpdate';
  updates: AiUpdateOperation[];
  message?: string;
}

export interface AiDeleteCommand {
  type: 'delete';
  subscriptionId: string;
  message?: string;
}

export interface AiNoneCommand {
  type: 'none';
  reason?: string;
}

export type AiCommand = AiCreateCommand | AiUpdateCommand | AiBatchUpdateCommand | AiDeleteCommand | AiNoneCommand;

export interface NormalizeAiCommandResult {
  command: AiCommand;
  dropped: number;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const isValidDateOnly = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  try {
    return formatDateOnly(parseDateOnly(value)) === value;
  } catch {
    return false;
  }
};

const normalizeAction = (value: unknown): AiCommand['type'] => {
  const action = asString(value).toLowerCase();
  if (action === 'create' || action === 'add') return 'create';
  if (action === 'update' || action === 'edit' || action === 'modify') return 'update';
  if (action === 'batchupdate' || action === 'batch_update' || action === 'updates') return 'batchUpdate';
  if (action === 'delete' || action === 'remove' || action === 'cancel') return 'delete';
  return 'none';
};

const extractPayload = (raw: unknown): Record<string, unknown> => {
  const root = asRecord(raw);
  if (!root) {
    return {};
  }

  const nestedCommand = asRecord(root.command);
  return nestedCommand ? { ...root, ...nestedCommand } : root;
};

const normalizeNameForMatch = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/[🐟🐠]/gu, '鱼')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

const normalizeSubscriptionId = (
  value: unknown,
  subscriptions: readonly AiSubscriptionContextItem[]
): string | null => {
  const id = asString(value);
  return subscriptions.some(subscription => subscription.id === id) ? id : null;
};

const findSubscriptionTarget = (
  payload: Record<string, unknown>,
  subscriptions: readonly AiSubscriptionContextItem[]
): AiSubscriptionContextItem | null => {
  const subscriptionId = normalizeSubscriptionId(
    payload.subscriptionId ?? payload.id ?? payload.targetId,
    subscriptions
  );
  if (subscriptionId) {
    return subscriptions.find(subscription => subscription.id === subscriptionId) ?? null;
  }

  const targetName = asString(
    payload.subscriptionName ?? payload.targetName ?? payload.name ?? payload.target
  );
  if (!targetName) {
    return null;
  }

  const normalizedTargetName = normalizeNameForMatch(targetName);
  if (!normalizedTargetName) {
    return null;
  }
  const matches = subscriptions.filter(subscription => {
    const normalizedSubscriptionName = normalizeNameForMatch(subscription.name);
    return normalizedSubscriptionName === normalizedTargetName ||
      normalizedSubscriptionName.includes(normalizedTargetName) ||
      normalizedTargetName.includes(normalizedSubscriptionName);
  });

  return matches.length === 1 ? matches[0] : null;
};

const firstDateString = (record: Record<string, unknown>, keys: readonly string[]): string => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) {
      return value;
    }
  }
  return '';
};

const normalizePatch = (
  rawPatch: unknown,
  today: string,
  target?: AiSubscriptionContextItem | null
): AiUpdateCommand['patch'] | null => {
  const record = asRecord(rawPatch);
  if (!record) {
    return null;
  }

  const patch: Record<string, unknown> = {};
  const name = asString(record.name).slice(0, 120);
  if (name) patch.name = name;

  const category = asString(record.category).slice(0, 80);
  if (category) patch.category = category;

  if (record.amount !== undefined) {
    const amount = Number(record.amount);
    if (Number.isFinite(amount) && amount >= 0) {
      patch.amount = Math.round(amount * 100) / 100;
    }
  }

  const currency = asString(record.currency).toUpperCase();
  if ((SUBSCRIPTION_CURRENCIES as readonly string[]).includes(currency)) {
    patch.currency = currency || DEFAULT_CURRENCY;
  }

  const period = asString(record.period).toLowerCase();
  if ((SUBSCRIPTION_PERIODS as readonly string[]).includes(period)) {
    patch.period = period;
  }

  const lastPaymentDate = asString(record.lastPaymentDate);
  if (isValidDateOnly(lastPaymentDate) && lastPaymentDate <= today) {
    patch.lastPaymentDate = lastPaymentDate;
  }

  if (record.customDate !== undefined) {
    const customDate = asString(record.customDate);
    if (/^[1-9]\d*$/.test(customDate)) {
      patch.customDate = customDate;
    }
  }

  const nextPaymentDate = firstDateString(record, [
    'nextPaymentDate',
    'renewalDate',
    'nextRenewalDate',
    'dueDate',
  ]);
  const targetPeriod = (patch.period as Period | undefined) ?? target?.period;
  const targetCustomDate = (patch.customDate as string | undefined) ?? target?.customDate;
  if (
    !patch.lastPaymentDate &&
    targetPeriod &&
    isValidDateOnly(nextPaymentDate)
  ) {
    const derivedLastPaymentDate = subtractBillingPeriodFromDate(nextPaymentDate, targetPeriod, targetCustomDate);
    if (isValidDateOnly(derivedLastPaymentDate) && derivedLastPaymentDate <= today) {
      patch.lastPaymentDate = derivedLastPaymentDate;
    }
  }

  if (typeof record.notificationEnabled === 'boolean') {
    patch.notificationEnabled = record.notificationEnabled;
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }

  const parsed = subscriptionPatchInputSchema.safeParse(patch);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return null;
  }

  return Object.fromEntries(
    Object.keys(patch).map(key => [key, parsed.data[key as keyof typeof parsed.data]])
  ) as AiUpdateCommand['patch'];
};

const requiredMissingFields = (
  patch: AiUpdateCommand['patch'],
  target: AiSubscriptionContextItem
): AiUpdateMissingField[] => {
  const mergedPeriod = patch.period ?? target.period;
  const mergedCustomDate = patch.customDate ?? target.customDate;

  return mergedPeriod === 'custom' && !mergedCustomDate ? ['customDate'] : [];
};

const normalizeUpdateOperation = (
  payload: Record<string, unknown>,
  today: string,
  subscriptions: readonly AiSubscriptionContextItem[]
): AiUpdateOperation | null => {
  const target = findSubscriptionTarget(payload, subscriptions);
  const patch = normalizePatch(payload.patch ?? payload.updates ?? payload.fields, today, target);
  if (!target || !patch) {
    return null;
  }

  const message = asString(payload.message);
  const missingFields = requiredMissingFields(patch, target);

  return {
    subscriptionId: target.id,
    patch,
    ...(missingFields.length > 0 ? { missingFields } : {}),
    ...(message ? { message } : {}),
  };
};

const rawUpdateOperations = (payload: Record<string, unknown>): unknown[] | null => {
  const candidates = [payload.updates, payload.operations, payload.commands];
  const found = candidates.find(Array.isArray);
  return found ? found as unknown[] : null;
};

export const buildAiSubscriptionContext = (
  subscriptions: readonly Subscription[]
): AiSubscriptionContextItem[] =>
  subscriptions.map(subscription => ({
    id: subscription.id,
    name: subscription.name,
    category: subscription.category,
    amount: subscription.amount,
    currency: subscription.currency || DEFAULT_CURRENCY,
    period: subscription.period,
    lastPaymentDate: subscription.lastPaymentDate,
    nextPaymentDate: subscription.nextPaymentDate,
    customDate: subscription.period === 'custom' ? subscription.customDate : undefined,
    notificationEnabled: subscription.notificationEnabled ?? true,
  }));

export const normalizeAiCommand = (
  raw: unknown,
  today: string,
  subscriptions: readonly AiSubscriptionContextItem[]
): NormalizeAiCommandResult => {
  const payload = extractPayload(raw);
  const action = normalizeAction(payload.type ?? payload.action);
  const message = asString(payload.message);

  if (action === 'create') {
    const rawSubscriptions = payload.subscriptions ?? payload.drafts ?? [];
    const { drafts, dropped } = normalizeDrafts({ subscriptions: rawSubscriptions }, today);
    return drafts.length > 0
      ? { command: { type: 'create', drafts, ...(message ? { message } : {}) }, dropped }
      : { command: { type: 'none', reason: asString(payload.reason) || 'No subscriptions found to create.' }, dropped };
  }

  if (action === 'update' || action === 'batchUpdate') {
    const rawOperations = rawUpdateOperations(payload);
    if (rawOperations) {
      const updates = rawOperations
        .map(item => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map(item => normalizeUpdateOperation(item, today, subscriptions))
        .filter((item): item is AiUpdateOperation => Boolean(item));

      if (updates.length === 0) {
        return { command: { type: 'none', reason: asString(payload.reason) || 'Could not identify a subscription update.' }, dropped: rawOperations.length };
      }

      return updates.length === 1
        ? { command: { type: 'update', ...updates[0], ...(message ? { message } : {}) }, dropped: rawOperations.length - 1 }
        : { command: { type: 'batchUpdate', updates, ...(message ? { message } : {}) }, dropped: rawOperations.length - updates.length };
    }

    const update = normalizeUpdateOperation(payload, today, subscriptions);
    if (!update) {
      return { command: { type: 'none', reason: asString(payload.reason) || 'Could not identify a subscription update.' }, dropped: 0 };
    }

    return {
      command: {
        type: 'update',
        ...update,
        ...(message ? { message } : {}),
      },
      dropped: 0,
    };
  }

  if (action === 'delete') {
    const target = findSubscriptionTarget(payload, subscriptions);
    return target
      ? { command: { type: 'delete', subscriptionId: target.id, ...(message ? { message } : {}) }, dropped: 0 }
      : { command: { type: 'none', reason: asString(payload.reason) || 'Could not identify a subscription to delete.' }, dropped: 0 };
  }

  return { command: { type: 'none', reason: asString(payload.reason) || 'No supported action was found.' }, dropped: 0 };
};
