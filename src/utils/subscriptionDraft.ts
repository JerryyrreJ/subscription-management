import type { Currency, Period } from '../types';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS } from './subscriptionDomain';
import { DEFAULT_CURRENCY } from './currency';
import { MAX_SUBSCRIPTION_AMOUNT } from './subscriptionValidation';
import { calculateNextPaymentDate, formatDateOnly, getDateOnlyDay, parseDateOnly } from './dates';

// A subscription the AI proposed from messy input. It is never written directly:
// the user confirms/edits it first. `warnings` are machine-readable codes for
// fields the model guessed or could not fill, so the UI can flag them for review
// (copy lives in i18n, not here).
export interface DraftSubscription {
  name: string;
  category: string;
  amount: number;
  currency: Currency;
  period: Period;
  nextPaymentDate: string;
  customDate?: string;
  notificationEnabled: boolean;
  warnings: string[];
}

export interface NormalizeDraftsResult {
  drafts: DraftSubscription[];
  dropped: number;
}

const MAX_DRAFTS = 50;

const round2 = (value: number): number => Math.round(value * 100) / 100;

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

const asString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const extractItems = (raw: unknown): unknown[] => {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).subscriptions)) {
    return (raw as Record<string, unknown>).subscriptions as unknown[];
  }
  return [];
};

const normalizeOne = (item: unknown, today: string): DraftSubscription | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const record = item as Record<string, unknown>;
  const warnings: string[] = [];

  const name = asString(record.name).slice(0, 120);
  if (!name) {
    return null; // not a subscription without a name
  }

  const category = asString(record.category).slice(0, 80);
  if (!category) {
    warnings.push('category_missing');
  }

  let amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    amount = 0;
    warnings.push('amount_missing');
  } else if (amount > MAX_SUBSCRIPTION_AMOUNT) {
    amount = MAX_SUBSCRIPTION_AMOUNT;
    warnings.push('amount_capped');
  }
  amount = round2(amount);

  let currency = asString(record.currency).toUpperCase() as Currency;
  if (!(SUBSCRIPTION_CURRENCIES as readonly string[]).includes(currency)) {
    currency = DEFAULT_CURRENCY;
    warnings.push('currency_defaulted');
  }

  let period = asString(record.period).toLowerCase() as Period;
  if (!(SUBSCRIPTION_PERIODS as readonly string[]).includes(period)) {
    period = 'monthly';
    warnings.push('period_defaulted');
  }

  let customDate: string | undefined;
  if (period === 'custom') {
    const raw = asString(record.customDate);
    if (/^[1-9]\d*$/.test(raw)) {
      customDate = raw;
    } else {
      warnings.push('customDate_missing');
    }
  }

  let nextPaymentDate = asString(record.nextPaymentDate);
  if (!isValidDateOnly(nextPaymentDate)) {
    const legacyLastPaymentDate = asString(record.lastPaymentDate);
    const canMigrateLegacyDate = isValidDateOnly(legacyLastPaymentDate) &&
      legacyLastPaymentDate <= today &&
      (period !== 'custom' || Boolean(customDate));

    if (canMigrateLegacyDate) {
      nextPaymentDate = calculateNextPaymentDate(
        legacyLastPaymentDate,
        period,
        customDate,
        period === 'monthly' ? getDateOnlyDay(legacyLastPaymentDate) : undefined
      );
    } else {
      nextPaymentDate = today;
      warnings.push('nextPaymentDate_guessed');
    }
  }

  let notificationEnabled = true;
  if (record.notificationEnabled !== undefined) {
    if (typeof record.notificationEnabled === 'boolean') {
      notificationEnabled = record.notificationEnabled;
    } else {
      warnings.push('notificationEnabled_invalid');
    }
  }

  return { name, category, amount, currency, period, nextPaymentDate, customDate, notificationEnabled, warnings };
};

/**
 * Validate and coerce raw model output into reviewable drafts. Pure — the caller
 * supplies `today` (YYYY-MM-DD) so the function never reads the clock itself.
 */
export const normalizeDrafts = (raw: unknown, today: string): NormalizeDraftsResult => {
  const items = extractItems(raw);
  const drafts: DraftSubscription[] = [];
  let dropped = 0;

  for (const item of items.slice(0, MAX_DRAFTS)) {
    const draft = normalizeOne(item, today);
    if (draft) {
      drafts.push(draft);
    } else {
      dropped += 1;
    }
  }

  return { drafts, dropped };
};
