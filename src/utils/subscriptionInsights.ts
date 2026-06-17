// Server-side subscription analytics for the public API.
//
// Deliberately independent from src/utils/reportAnalytics.ts: that module depends
// on i18next translation functions and live FX conversion, neither of which exist
// in a serverless API request. These functions are pure, take plain data, and never
// invent an exchange rate — money is always reported in the subscription's own
// currency so an agent can present accurate figures.

export type InsightPeriod = 'monthly' | 'yearly' | 'custom';
export type InsightStatus = 'active' | 'paused' | 'cancelled';

export interface InsightSubscription {
  id: string;
  name: string;
  category: string;
  amount: number;
  currency: string;
  period: InsightPeriod;
  customDate?: string;
  nextPaymentDate: string;
  status: InsightStatus;
}

export interface CurrencyTotal {
  currency: string;
  activeSubscriptions: number;
  monthlyTotal: number;
  yearlyTotal: number;
}

export interface CategoryTotal {
  category: string;
  activeSubscriptions: number;
  monthlyTotalsByCurrency: Record<string, number>;
}

export interface UpcomingRenewal {
  id: string;
  name: string;
  category: string;
  amount: number;
  currency: string;
  period: InsightPeriod;
  nextPaymentDate: string;
  daysUntilRenewal: number;
}

export interface SpendSummary {
  asOf: string;
  horizonDays: number;
  counts: {
    total: number;
    active: number;
    paused: number;
    cancelled: number;
  };
  byCurrency: CurrencyTotal[];
  byCategory: CategoryTotal[];
  upcomingRenewals: UpcomingRenewal[];
}

export interface DuplicateGroup {
  normalizedName: string;
  subscriptions: Array<{
    id: string;
    name: string;
    category: string;
    amount: number;
    currency: string;
    period: InsightPeriod;
    status: InsightStatus;
  }>;
}

export interface AnnualSwitchCandidate {
  id: string;
  name: string;
  currency: string;
  monthlyAmount: number;
  yearlyAtCurrentRate: number;
}

export interface AboveAverageCandidate {
  id: string;
  name: string;
  currency: string;
  monthlyEquivalent: number;
  currencyMonthlyAverage: number;
}

export interface OptimizationCandidates {
  monthlyToAnnual: AnnualSwitchCandidate[];
  aboveAverageInCurrency: AboveAverageCandidate[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dateOnlyToUtc = (value: string): number => {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

const normalizeName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Monthly-equivalent cost in the subscription's own currency. */
export const monthlyEquivalent = (subscription: InsightSubscription): number => {
  switch (subscription.period) {
    case 'monthly':
      return subscription.amount;
    case 'yearly':
      return subscription.amount / 12;
    case 'custom': {
      const days = Number.parseInt(subscription.customDate ?? '', 10);
      if (Number.isFinite(days) && days > 0) {
        return (subscription.amount / days) * 30;
      }
      return subscription.amount;
    }
    default:
      return subscription.amount;
  }
};

export const summarizeSpend = (
  subscriptions: InsightSubscription[],
  asOf: Date,
  horizonDays = 30
): SpendSummary => {
  const active = subscriptions.filter(sub => sub.status === 'active');

  const counts = {
    total: subscriptions.length,
    active: active.length,
    paused: subscriptions.filter(sub => sub.status === 'paused').length,
    cancelled: subscriptions.filter(sub => sub.status === 'cancelled').length,
  };

  const currencyMap = new Map<string, { count: number; monthly: number }>();
  const categoryMap = new Map<string, { count: number; byCurrency: Map<string, number> }>();

  for (const sub of active) {
    const monthly = monthlyEquivalent(sub);

    const currencyEntry = currencyMap.get(sub.currency) ?? { count: 0, monthly: 0 };
    currencyEntry.count += 1;
    currencyEntry.monthly += monthly;
    currencyMap.set(sub.currency, currencyEntry);

    const categoryKey = sub.category.trim() || 'Uncategorized';
    const categoryEntry = categoryMap.get(categoryKey) ?? { count: 0, byCurrency: new Map() };
    categoryEntry.count += 1;
    categoryEntry.byCurrency.set(
      sub.currency,
      (categoryEntry.byCurrency.get(sub.currency) ?? 0) + monthly
    );
    categoryMap.set(categoryKey, categoryEntry);
  }

  const byCurrency: CurrencyTotal[] = Array.from(currencyMap.entries())
    .map(([currency, entry]) => ({
      currency,
      activeSubscriptions: entry.count,
      monthlyTotal: round2(entry.monthly),
      yearlyTotal: round2(entry.monthly * 12),
    }))
    .sort((a, b) => b.monthlyTotal - a.monthlyTotal);

  const byCategory: CategoryTotal[] = Array.from(categoryMap.entries())
    .map(([category, entry]) => ({
      category,
      activeSubscriptions: entry.count,
      monthlyTotalsByCurrency: Object.fromEntries(
        Array.from(entry.byCurrency.entries()).map(([currency, total]) => [currency, round2(total)])
      ),
    }))
    .sort((a, b) => b.activeSubscriptions - a.activeSubscriptions);

  const asOfUtc = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const horizonUtc = asOfUtc + horizonDays * MS_PER_DAY;

  const upcomingRenewals: UpcomingRenewal[] = active
    .map(sub => ({
      sub,
      renewalUtc: dateOnlyToUtc(sub.nextPaymentDate),
    }))
    .filter(({ renewalUtc }) => renewalUtc >= asOfUtc && renewalUtc <= horizonUtc)
    .sort((a, b) => a.renewalUtc - b.renewalUtc)
    .map(({ sub, renewalUtc }) => ({
      id: sub.id,
      name: sub.name,
      category: sub.category,
      amount: sub.amount,
      currency: sub.currency,
      period: sub.period,
      nextPaymentDate: sub.nextPaymentDate,
      daysUntilRenewal: Math.round((renewalUtc - asOfUtc) / MS_PER_DAY),
    }));

  return {
    asOf: asOf.toISOString(),
    horizonDays,
    counts,
    byCurrency,
    byCategory,
    upcomingRenewals,
  };
};

/** Active subscriptions whose normalized name collides — likely duplicate tracking. */
export const findDuplicates = (subscriptions: InsightSubscription[]): DuplicateGroup[] => {
  const groups = new Map<string, InsightSubscription[]>();

  for (const sub of subscriptions) {
    if (sub.status === 'cancelled') {
      continue;
    }
    const key = normalizeName(sub.name);
    const bucket = groups.get(key) ?? [];
    bucket.push(sub);
    groups.set(key, bucket);
  }

  return Array.from(groups.entries())
    .filter(([, bucket]) => bucket.length > 1)
    .map(([normalizedName, bucket]) => ({
      normalizedName,
      subscriptions: bucket.map(sub => ({
        id: sub.id,
        name: sub.name,
        category: sub.category,
        amount: sub.amount,
        currency: sub.currency,
        period: sub.period,
        status: sub.status,
      })),
    }))
    .sort((a, b) => b.subscriptions.length - a.subscriptions.length);
};

/**
 * Factual optimization candidates. No fabricated discount rates: monthly→annual
 * reports the current annualized cost, and "above average" is relative to the
 * per-currency mean so figures are never mixed across currencies.
 */
export const optimizationCandidates = (
  subscriptions: InsightSubscription[]
): OptimizationCandidates => {
  const active = subscriptions.filter(sub => sub.status === 'active');

  const monthlyToAnnual: AnnualSwitchCandidate[] = active
    .filter(sub => sub.period === 'monthly')
    .map(sub => ({
      id: sub.id,
      name: sub.name,
      currency: sub.currency,
      monthlyAmount: round2(sub.amount),
      yearlyAtCurrentRate: round2(sub.amount * 12),
    }));

  const currencyAverages = new Map<string, number>();
  const currencyTotals = new Map<string, { sum: number; count: number }>();
  for (const sub of active) {
    const entry = currencyTotals.get(sub.currency) ?? { sum: 0, count: 0 };
    entry.sum += monthlyEquivalent(sub);
    entry.count += 1;
    currencyTotals.set(sub.currency, entry);
  }
  for (const [currency, { sum, count }] of currencyTotals.entries()) {
    currencyAverages.set(currency, count > 0 ? sum / count : 0);
  }

  const aboveAverageInCurrency: AboveAverageCandidate[] = active
    .map(sub => ({ sub, monthly: monthlyEquivalent(sub) }))
    .filter(({ sub, monthly }) => monthly > (currencyAverages.get(sub.currency) ?? 0) * 2)
    .map(({ sub, monthly }) => ({
      id: sub.id,
      name: sub.name,
      currency: sub.currency,
      monthlyEquivalent: round2(monthly),
      currencyMonthlyAverage: round2(currencyAverages.get(sub.currency) ?? 0),
    }))
    .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

  return { monthlyToAnnual, aboveAverageInCurrency };
};
