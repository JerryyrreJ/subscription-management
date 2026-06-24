import type { Currency, Period, Subscription } from '../types';
import { DEFAULT_CURRENCY } from './currency';
import { formatDateOnly, parseDateOnly } from './dates';
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
  customDate?: string;
  notificationEnabled: boolean;
}

export interface AiCreateCommand {
  type: 'create';
  drafts: DraftSubscription[];
  message?: string;
}

export type AiUpdateMissingField = 'customDate';

export interface AiUpdateCommand {
  type: 'update';
  subscriptionId: string;
  patch: Partial<Pick<
    Subscription,
    'name' | 'category' | 'amount' | 'currency' | 'period' | 'lastPaymentDate' | 'customDate' | 'notificationEnabled'
  >>;
  missingFields?: AiUpdateMissingField[];
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

export type AiCommand = AiCreateCommand | AiUpdateCommand | AiDeleteCommand | AiNoneCommand;

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

const normalizeSubscriptionId = (
  value: unknown,
  subscriptions: readonly AiSubscriptionContextItem[]
): string | null => {
  const id = asString(value);
  return subscriptions.some(subscription => subscription.id === id) ? id : null;
};

const normalizePatch = (rawPatch: unknown, today: string): AiUpdateCommand['patch'] | null => {
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

  if (action === 'update') {
    const subscriptionId = normalizeSubscriptionId(
      payload.subscriptionId ?? payload.id ?? payload.targetId,
      subscriptions
    );
    const target = subscriptionId
      ? subscriptions.find(subscription => subscription.id === subscriptionId) ?? null
      : null;
    const patch = normalizePatch(payload.patch ?? payload.updates ?? payload.fields, today);
    if (!subscriptionId || !target || !patch) {
      return { command: { type: 'none', reason: asString(payload.reason) || 'Could not identify a subscription update.' }, dropped: 0 };
    }
    const missingFields = requiredMissingFields(patch, target);

    return {
      command: {
        type: 'update',
        subscriptionId,
        patch,
        ...(missingFields.length > 0 ? { missingFields } : {}),
        ...(message ? { message } : {}),
      },
      dropped: 0,
    };
  }

  if (action === 'delete') {
    const subscriptionId = normalizeSubscriptionId(
      payload.subscriptionId ?? payload.id ?? payload.targetId,
      subscriptions
    );
    return subscriptionId
      ? { command: { type: 'delete', subscriptionId, ...(message ? { message } : {}) }, dropped: 0 }
      : { command: { type: 'none', reason: asString(payload.reason) || 'Could not identify a subscription to delete.' }, dropped: 0 };
  }

  return { command: { type: 'none', reason: asString(payload.reason) || 'No supported action was found.' }, dropped: 0 };
};
