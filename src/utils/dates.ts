const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_TIME_ZONE = 'UTC';
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const localizedDateFormatterCache = new Map<string, Intl.DateTimeFormat>();
import { getCurrentLocale, getIntlLocale } from './locale';

const getDaysInUtcMonth = (year: number, monthIndex: number): number =>
 new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const clampUtcDate = (year: number, monthIndex: number, day: number): Date => {
 const maxDay = getDaysInUtcMonth(year, monthIndex);
 return new Date(Date.UTC(year, monthIndex, Math.min(day, maxDay)));
};

const parseCustomDays = (customDate?: string): number | null => {
 if (!customDate) {
 return null;
 }

 const customDays = parseInt(customDate, 10);
 return Number.isNaN(customDays) || customDays <= 0 ? null : customDays;
};

const isValidTimeZone = (timeZone: string): boolean => {
 try {
  new Intl.DateTimeFormat('en-US', { timeZone });
  return true;
 } catch {
  return false;
 }
};

const getDateFormatter = (timeZone: string): Intl.DateTimeFormat => {
 const cachedFormatter = dateFormatterCache.get(timeZone);
 if (cachedFormatter) {
  return cachedFormatter;
 }

 const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
 });
 dateFormatterCache.set(timeZone, formatter);
 return formatter;
};

const getLocalizedDateFormatter = (
 locale: string,
 options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat => {
 const intlLocale = getIntlLocale(locale);
 const cacheKey = `${intlLocale}:${JSON.stringify(options)}`;
 const cachedFormatter = localizedDateFormatterCache.get(cacheKey);

 if (cachedFormatter) {
  return cachedFormatter;
 }

 const formatter = new Intl.DateTimeFormat(intlLocale, options);
 localizedDateFormatterCache.set(cacheKey, formatter);
 return formatter;
};

const toDateObject = (date: Date | string): Date =>
 typeof date === 'string' ? parseDateOnly(date) : date;

export const getCurrentTimeZone = (): string => {
 try {
  const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return detectedTimeZone && isValidTimeZone(detectedTimeZone)
   ? detectedTimeZone
   : DEFAULT_TIME_ZONE;
 } catch {
  return DEFAULT_TIME_ZONE;
 }
};

export const normalizeTimeZone = (
 timeZone?: string | null,
 fallbackTimeZone: string = DEFAULT_TIME_ZONE
): string =>
 timeZone && isValidTimeZone(timeZone) ? timeZone : fallbackTimeZone;

export const formatInstantToDateOnly = (
 date: Date,
 timeZone: string = getCurrentTimeZone()
): string => {
 const normalizedTimeZone = normalizeTimeZone(timeZone, DEFAULT_TIME_ZONE);
 const parts = getDateFormatter(normalizedTimeZone).formatToParts(date);
 const year = parts.find(part => part.type === 'year')?.value;
 const month = parts.find(part => part.type === 'month')?.value;
 const day = parts.find(part => part.type === 'day')?.value;

 if (!year || !month || !day) {
  throw new Error(`Unable to format date for time zone: ${normalizedTimeZone}`);
 }

 return `${year}-${month}-${day}`;
};

export const parseDateOnly = (dateString: string): Date => {
 const match = DATE_ONLY_PATTERN.exec(dateString);

 if (match) {
 const [, yearStr, monthStr, dayStr] = match;
 const year = Number(yearStr);
 const monthIndex = Number(monthStr) - 1;
 const day = Number(dayStr);
 return clampUtcDate(year, monthIndex, day);
 }

 const parsed = new Date(dateString);
 if (Number.isNaN(parsed.getTime())) {
 throw new Error(`Invalid date string: ${dateString}`);
 }

 return parsed;
};

export const formatDateOnly = (date: Date): string => {
 const year = date.getUTCFullYear();
 const month = String(date.getUTCMonth() + 1).padStart(2, '0');
 const day = String(date.getUTCDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
};

export const getTodayDateOnly = (
 timeZone: string = getCurrentTimeZone(),
 now: Date = new Date()
): Date =>
 parseDateOnly(formatInstantToDateOnly(now, timeZone));

const addMonthsClamped = (date: Date, months: number, anchorDay: number = date.getUTCDate()): Date => {
 const targetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
 return clampUtcDate(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), anchorDay);
};

const addYearsClamped = (date: Date, years: number, anchorDay: number = date.getUTCDate()): Date =>
 clampUtcDate(date.getUTCFullYear() + years, date.getUTCMonth(), anchorDay);

const addDaysUtc = (date: Date, days: number): Date => {
 const nextDate = new Date(date.getTime());
 nextDate.setUTCDate(nextDate.getUTCDate() + days);
 return nextDate;
};

export const addBillingPeriodToDate = (
 dateString: string,
 period: string,
 customDate?: string,
 billingAnchorDay?: number
): string => {
 const date = parseDateOnly(dateString);

 switch (period) {
 case 'monthly':
 return formatDateOnly(addMonthsClamped(date, 1, billingAnchorDay));
 case 'yearly':
 return formatDateOnly(addYearsClamped(date, 1, billingAnchorDay));
 case 'custom': {
 const customDays = parseCustomDays(customDate);
 return customDays ? formatDateOnly(addDaysUtc(date, customDays)) : dateString;
 }
 default:
 return dateString;
 }
};

export const subtractBillingPeriodFromDate = (
 dateString: string,
 period: string,
 customDate?: string,
 billingAnchorDay?: number
): string => {
 const date = parseDateOnly(dateString);

 switch (period) {
 case 'monthly':
 return formatDateOnly(addMonthsClamped(date, -1, billingAnchorDay));
 case 'yearly':
 return formatDateOnly(addYearsClamped(date, -1, billingAnchorDay));
 case 'custom': {
 const customDays = parseCustomDays(customDate);
 return customDays ? formatDateOnly(addDaysUtc(date, -customDays)) : dateString;
 }
 default:
 return dateString;
 }
};

export const compareDateOnly = (left: string, right: string): number =>
 parseDateOnly(left).getTime() - parseDateOnly(right).getTime();

export const getDateOnlyDay = (dateString: string): number =>
 parseDateOnly(dateString).getUTCDate();

export const formatDateByLocale = (
 date: Date | string,
 locale: string = getCurrentLocale(),
 options: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
 }
): string => getLocalizedDateFormatter(locale, options).format(toDateObject(date));

export const formatDate = (
 date: Date | string,
 locale: string = getCurrentLocale()
): string => formatDateByLocale(date, locale);

export const formatMonthYear = (
 date: Date | string,
 locale: string = getCurrentLocale()
): string =>
 formatDateByLocale(date, locale, {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
 });

export const formatWeekdayLabels = (
 locale: string = getCurrentLocale(),
 width: 'short' | 'narrow' = 'short'
): string[] =>
 Array.from({ length: 7 }, (_, index) =>
  formatDateByLocale(new Date(Date.UTC(2024, 0, 7 + index)), locale, {
   weekday: width,
   timeZone: 'UTC',
  })
 );

export const calculateNextPaymentDate = (
 lastPaymentDate: string,
 period: string,
 customDate?: string,
 billingAnchorDay?: number
): string => addBillingPeriodToDate(lastPaymentDate, period, customDate, billingAnchorDay);

export const calculatePreviousPaymentDate = (
 nextPaymentDate: string,
 period: string,
 customDate?: string,
 billingAnchorDay?: number
): string => subtractBillingPeriodFromDate(nextPaymentDate, period, customDate, billingAnchorDay);

export const diffDateOnlyDays = (from: Date | string, to: Date | string): number =>
 Math.round((toDateObject(to).getTime() - toDateObject(from).getTime()) / MS_PER_DAY);

export const getDaysUntil = (
 dateString: string,
 timeZone: string = getCurrentTimeZone(),
 now: Date = new Date()
): number => diffDateOnlyDays(getTodayDateOnly(timeZone, now), parseDateOnly(dateString));

export interface BillingCycleUsage {
 daysUsed: number;
 daysTotal: number;
 daysUntil: number;
 progress: number;
}

export const getBillingCycleUsage = (
 lastPaymentDate: string,
 nextPaymentDate: string,
 timeZone: string = getCurrentTimeZone(),
 now: Date = new Date()
): BillingCycleUsage => {
 const today = formatDateOnly(getTodayDateOnly(timeZone, now));
 const daysTotal = Math.max(0, diffDateOnlyDays(lastPaymentDate, nextPaymentDate));
 const daysUntil = diffDateOnlyDays(today, nextPaymentDate);
 // used = cycleLength - daysUntil. lastPayment is derived from nextPayment
 // (timezone-naive). If this timezone's calendar day is still before that
 // lastPayment, remaining is one day longer than last→next and used is -1.
 const daysUsed = daysTotal === 0 ? 0 : Math.min(daysTotal, Math.max(0, daysTotal - daysUntil));
 const progress = daysTotal === 0 ? 0 : (daysUsed / daysTotal) * 100;

 return { daysUsed, daysTotal, daysUntil, progress };
};

export const getAutoRenewedDates = (
 nextPaymentDate: string,
 period: string,
 customDate?: string,
 billingAnchorDay?: number,
 timeZone: string = getCurrentTimeZone(),
 now: Date = new Date()
): { lastPaymentDate: string; nextPaymentDate: string } => {
 const today = formatDateOnly(getTodayDateOnly(timeZone, now));
 const effectiveAnchorDay = (period === 'monthly' || period === 'yearly')
  ? (billingAnchorDay ?? getDateOnlyDay(nextPaymentDate))
  : undefined;

 // 如果还没到期，返回原始日期
 if (compareDateOnly(nextPaymentDate, today) >= 0) {
 return {
  lastPaymentDate: calculatePreviousPaymentDate(nextPaymentDate, period, customDate, effectiveAnchorDay),
  nextPaymentDate,
 };
 }

 let newNextPaymentDate = nextPaymentDate;

 while (compareDateOnly(newNextPaymentDate, today) < 0) {
 const advancedDate = addBillingPeriodToDate(newNextPaymentDate, period, customDate, effectiveAnchorDay);

 if (advancedDate === newNextPaymentDate) {
 break;
 }

 newNextPaymentDate = advancedDate;
 }

 return {
 lastPaymentDate: calculatePreviousPaymentDate(newNextPaymentDate, period, customDate, effectiveAnchorDay),
 nextPaymentDate: newNextPaymentDate,
 };
};
