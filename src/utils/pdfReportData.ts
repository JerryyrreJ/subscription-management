import type { TFunction } from 'i18next';
import { Currency, ExchangeRates, Subscription } from '../types';
import { convertCurrency, formatCurrency } from './currency';
import { getCategoryDisplayName } from './categories';
import {
 compareDateOnly,
 formatDateByLocale,
 formatDateOnly,
 getCurrentTimeZone,
 getTodayDateOnly,
 parseDateOnly,
} from './dates';
import { resolveSubscriptionRenewal } from './subscriptionRenewal';
import { calculateMonthlyCost, type ReportData } from './reportAnalytics';

// ===== Type Definitions =====

export interface PdfKpi {
 label: string;
 value: string;
 note: string;
 /** 用强调色渲染数值（每页只用一次，留给最有时效性的那个指标） */
 accent?: boolean;
}

export interface PdfCategoryRow {
 label: string;
 amount: string;
 percentage: number;
 percentageLabel: string;
}

export interface PdfSubscriptionRow {
 name: string;
 category: string;
 /** 原始货币金额，未折算 */
 price: string;
 cycle: string;
 monthly: string;
 yearly: string;
 next: string;
}

export interface PdfRenewalEntry {
 date: string;
 name: string;
 /** 原始货币金额 —— 这是实际会被扣的数字 */
 amount: string;
 isNext: boolean;
}

export interface PdfTrendPoint {
 label: string;
 valueLabel: string;
 heightPercentage: number;
 isCurrent: boolean;
}

export interface PdfCategoryGroup {
 label: string;
 monthly: string;
 yearly: string;
 rows: PdfSubscriptionRow[];
}

export interface PdfReportMeta {
 asOf: string;
 baseCurrencyLine: string;
 scopeLine: string;
 fxNote: string;
 generatedBy: string;
}

export interface PdfReportData {
 meta: PdfReportMeta;
 snapshotKpis: PdfKpi[];
 annualKpis: PdfKpi[];
 categoryRows: PdfCategoryRow[];
 categoryHeaderNote: string;
 subscriptionRows: PdfSubscriptionRow[];
 totalMonthly: string;
 totalYearly: string;
 next30Days: PdfRenewalEntry[];
 next30Summary: string;
 trend: PdfTrendPoint[];
 trendNote: string;
 topSubscriptions: { rank: number; name: string; amount: string; percentageLabel: string }[];
 categoryGroups: PdfCategoryGroup[];
}

export interface PdfReportSource {
 subscriptions: Subscription[];
 reportData: ReportData;
 baseCurrency: Currency;
 exchangeRates: ExchangeRates;
 exchangeRatesUpdatedAt?: number | null;
 t: TFunction;
 locale: string;
 timeZone?: string;
}

const RENEWAL_WINDOW_DAYS = 30;

// ===== Helpers =====

const getCategoryLabel = (category: string | undefined, t: TFunction): string =>
 getCategoryDisplayName(category?.trim() || 'Uncategorized', t);

const getCycleLabel = (subscription: Subscription, t: TFunction): string => {
 if (subscription.period === 'monthly') {
  return t('analytics:periodMonthly');
 }

 if (subscription.period === 'yearly') {
  return t('analytics:periodYearly');
 }

 const customDays = Number.parseInt(subscription.customDate || '', 10);
 if (Number.isFinite(customDays) && customDays > 0) {
  return t(
   customDays === 1 ? 'analytics:customPeriodDaysOne' : 'analytics:customPeriodDaysOther',
   { count: customDays }
  );
 }

 return t('analytics:periodCustom');
};

/**
 * 续费日期：同年只显示月/日，跨年补上年份，避免明细表里出现一堆冗余年份。
 */
const formatRenewalDate = (dateString: string, locale: string, currentYear: number): string => {
 const date = parseDateOnly(dateString);
 const sameYear = date.getUTCFullYear() === currentYear;

 return formatDateByLocale(date, locale, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
  ...(sameYear ? {} : { year: 'numeric' }),
 });
};

const addDaysToDateOnly = (date: Date, days: number): Date => {
 const next = new Date(date.getTime());
 next.setUTCDate(next.getUTCDate() + days);
 return next;
};

const toMonthlyInBaseCurrency = (
 subscription: Subscription,
 baseCurrency: Currency,
 exchangeRates: ExchangeRates
): number =>
 convertCurrency(
  calculateMonthlyCost(subscription),
  subscription.currency,
  baseCurrency,
  exchangeRates,
  baseCurrency
 );

/**
 * 汇率脚注。只列实际用到的外币，最多 3 对，避免页脚被十种货币撑爆。
 */
const buildFxNote = (
 subscriptions: Subscription[],
 baseCurrency: Currency,
 exchangeRates: ExchangeRates,
 exchangeRatesUpdatedAt: number | null | undefined,
 t: TFunction,
 locale: string
): string => {
 const foreignCurrencies = [...new Set(subscriptions.map(subscription => subscription.currency))]
  .filter(currency => currency !== baseCurrency)
  .sort();

 if (foreignCurrencies.length === 0) {
  return t('analytics:pdfFxNoneNote');
 }

 const shown = foreignCurrencies.slice(0, 3);
 const pairs = shown
  .map(currency => {
   const rate = exchangeRates[currency];
   return Number.isFinite(rate)
    ? `${baseCurrency}/${currency} ${rate.toFixed(4)}`
    : `${baseCurrency}/${currency} —`;
  })
  .join(' · ');

 const overflow = foreignCurrencies.length - shown.length;
 const pairsLine = overflow > 0 ? t('analytics:pdfFxMore', { pairs, count: overflow }) : pairs;

 if (!exchangeRatesUpdatedAt) {
  return t('analytics:pdfFxNote', { pairs: pairsLine });
 }

 return t('analytics:pdfFxNoteWithDate', {
  date: formatDateByLocale(new Date(exchangeRatesUpdatedAt), locale, {
   year: 'numeric',
   month: 'short',
   day: 'numeric',
  }),
  pairs: pairsLine,
 });
};

/**
 * 环比：拿 spendingTrend 的最后两个月比。上月为 0 时不显示百分比。
 */
const buildMonthOverMonthNote = (reportData: ReportData, t: TFunction): string => {
 const trend = reportData.spendingTrend;

 if (trend.length < 2) {
  return t('analytics:pdfNoPriorMonth');
 }

 const current = trend[trend.length - 1].totalSpend;
 const previous = trend[trend.length - 2].totalSpend;

 if (previous <= 0) {
  return t('analytics:pdfNoPriorMonth');
 }

 const delta = ((current - previous) / previous) * 100;
 const sign = delta >= 0 ? '+' : '−';

 return t('analytics:pdfVsLastMonth', { change: `${sign}${Math.abs(delta).toFixed(1)}%` });
};

// ===== Builder =====

export const buildPdfReportData = ({
 subscriptions,
 reportData,
 baseCurrency,
 exchangeRates,
 exchangeRatesUpdatedAt,
 t,
 locale,
 timeZone = getCurrentTimeZone(),
}: PdfReportSource): PdfReportData => {
 const today = getTodayDateOnly(timeZone);
 const currentYear = today.getUTCFullYear();
 const { overview, spendingTrend, categoryAnalysis, topSubscriptions } = reportData;

 const money = (amount: number) => formatCurrency(amount, baseCurrency, locale);

 // — 明细行，按月均折算降序 —
 const decorated = subscriptions
  .map(subscription => {
   const monthly = toMonthlyInBaseCurrency(subscription, baseCurrency, exchangeRates);
   const nextPaymentDate = resolveSubscriptionRenewal(subscription, timeZone)
    .effectiveNextPaymentDate;

   return {
    subscription,
    monthly,
    nextPaymentDate,
    row: {
     name: subscription.name,
     category: getCategoryLabel(subscription.category, t),
     price: formatCurrency(subscription.amount, subscription.currency, locale),
     cycle: getCycleLabel(subscription, t),
     monthly: money(monthly),
     yearly: money(monthly * 12),
     next: formatRenewalDate(nextPaymentDate, locale, currentYear),
    } satisfies PdfSubscriptionRow,
   };
  })
  .sort((left, right) => right.monthly - left.monthly);

 // — 未来 30 天续费 —
 const windowEnd = formatDateOnly(addDaysToDateOnly(today, RENEWAL_WINDOW_DAYS));
 const todayString = formatDateOnly(today);

 const upcoming = decorated
  .filter(
   ({ nextPaymentDate }) =>
    compareDateOnly(nextPaymentDate, todayString) >= 0 &&
    compareDateOnly(nextPaymentDate, windowEnd) <= 0
  )
  .sort((left, right) => compareDateOnly(left.nextPaymentDate, right.nextPaymentDate));

 const upcomingTotal = upcoming.reduce(
  (sum, { subscription }) =>
   sum +
   convertCurrency(
    subscription.amount,
    subscription.currency,
    baseCurrency,
    exchangeRates,
    baseCurrency
   ),
  0
 );

 const next30Days: PdfRenewalEntry[] = upcoming.map(({ subscription, nextPaymentDate }, index) => ({
  date: formatRenewalDate(nextPaymentDate, locale, currentYear),
  name: subscription.name,
  amount: formatCurrency(subscription.amount, subscription.currency, locale),
  isNext: index === 0,
 }));

 // — 分类构成 —
 const categoryRows: PdfCategoryRow[] = overview.categoryBreakdown.map(entry => ({
  label: entry.category,
  amount: money(entry.amount),
  percentage: entry.percentage,
  percentageLabel: `${entry.percentage.toFixed(1)}%`,
 }));

 // — 12 个月走势。calculateSpendingTrend 是按当前订阅回溯（不是历史账单），
 //   所以这里只做相对高度，并在 trendNote 里如实说明口径。 —
 const peakSpend = Math.max(...spendingTrend.map(point => point.totalSpend), 0);
 const trend: PdfTrendPoint[] = spendingTrend.map((point, index) => ({
  label: point.monthLabel,
  valueLabel: Math.round(point.totalSpend).toLocaleString(locale),
  heightPercentage: peakSpend > 0 ? (point.totalSpend / peakSpend) * 100 : 0,
  isCurrent: index === spendingTrend.length - 1,
 }));

 // — Top 5 —
 const topFive = topSubscriptions.map((subscription, index) => ({
  rank: index + 1,
  name: subscription.name,
  amount: money(subscription.monthlyCost),
  percentageLabel:
   overview.totalMonthlySpend > 0
    ? `${((subscription.monthlyCost / overview.totalMonthlySpend) * 100).toFixed(1)}%`
    : '—',
 }));

 // — 按分类分组的明细（年度报告第 2 页）。分类标签两边都走
 //   getCategoryDisplayName，所以可以直接按标签归组。 —
 const categoryGroups: PdfCategoryGroup[] = categoryAnalysis.map(category => ({
  label: category.category,
  monthly: money(category.totalSpend),
  yearly: money(category.totalSpend * 12),
  rows: decorated.filter(({ row }) => row.category === category.category).map(({ row }) => row),
 }));

 const currencyCount = new Set(subscriptions.map(subscription => subscription.currency)).size;
 const largest = topSubscriptions[0];
 const nextRenewal = upcoming[0];
 const largestCategory = overview.categoryBreakdown[0];

 const snapshotKpis: PdfKpi[] = [
  {
   label: t('analytics:pdfKpiMonthly'),
   value: money(overview.totalMonthlySpend),
   note: buildMonthOverMonthNote(reportData, t),
  },
  {
   label: t('analytics:pdfKpiAnnualized'),
   value: money(overview.totalYearlySpend),
   note: t('analytics:pdfKpiAnnualizedNote'),
  },
  {
   label: t('analytics:pdfKpiLargestItem'),
   value: largest ? money(largest.monthlyCost) : t('analytics:notAvailable'),
   note: largest ? `${largest.name} · ${largest.billingCycle}` : '—',
  },
  {
   label: t('analytics:pdfKpiNextRenewal'),
   value: nextRenewal
    ? formatRenewalDate(nextRenewal.nextPaymentDate, locale, currentYear)
    : t('analytics:notAvailable'),
   note: nextRenewal
    ? `${nextRenewal.subscription.name} · ${formatCurrency(
       nextRenewal.subscription.amount,
       nextRenewal.subscription.currency,
       locale
      )}`
    : t('analytics:pdfNoUpcomingRenewal'),
   accent: true,
  },
 ];

 // 年度报告的 KPI —— 全部可由当前订阅快照算出，不含任何需要历史账单的指标。
 const annualKpis: PdfKpi[] = [
  {
   label: t('analytics:pdfKpiAnnualized'),
   value: money(overview.totalYearlySpend),
   note: t('analytics:pdfKpiAnnualizedNote'),
  },
  {
   label: t('analytics:pdfKpiMonthly'),
   value: money(overview.totalMonthlySpend),
   note: buildMonthOverMonthNote(reportData, t),
  },
  {
   label: t('analytics:pdfKpiAvgPerItem'),
   value: money(overview.avgSubscriptionCost),
   note: t(
    overview.activeSubscriptions === 1
     ? 'analytics:subscriptionsCountOne'
     : 'analytics:subscriptionsCountOther',
    { count: overview.activeSubscriptions }
   ),
  },
  {
   label: t('analytics:pdfKpiLargestCategory'),
   value: largestCategory ? largestCategory.category : t('analytics:notAvailable'),
   note: largestCategory
    ? t('analytics:pdfKpiLargestCategoryNote', {
       percentage: `${largestCategory.percentage.toFixed(1)}%`,
       amount: money(largestCategory.amount),
      })
    : '—',
   accent: true,
  },
 ];

 return {
  meta: {
   asOf: t('analytics:pdfAsOf', {
    date: formatDateByLocale(today, locale, {
     year: 'numeric',
     month: 'short',
     day: 'numeric',
     timeZone: 'UTC',
    }),
   }),
   baseCurrencyLine: t('analytics:pdfBaseCurrency', { currency: baseCurrency }),
   scopeLine: t('analytics:pdfScope', {
    subscriptions: overview.activeSubscriptions,
    currencies: currencyCount,
   }),
   fxNote: buildFxNote(
    subscriptions,
    baseCurrency,
    exchangeRates,
    exchangeRatesUpdatedAt,
    t,
    locale
   ),
   generatedBy: t('analytics:pdfGeneratedBy'),
  },
  snapshotKpis,
  annualKpis,
  categoryRows,
  categoryHeaderNote: t('analytics:pdfCategoryHeaderNote', {
   count: overview.categoryBreakdown.length,
  }),
  subscriptionRows: decorated.map(({ row }) => row),
  totalMonthly: money(overview.totalMonthlySpend),
  totalYearly: money(overview.totalYearlySpend),
  next30Days,
  next30Summary: t('analytics:pdfNext30Summary', {
   count: next30Days.length,
   amount: money(upcomingTotal),
  }),
  trend,
  trendNote: t('analytics:pdfTrendNote'),
  topSubscriptions: topFive,
  categoryGroups,
 };
};
