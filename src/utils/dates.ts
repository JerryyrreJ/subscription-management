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

export const getTodayDateOnly = (timeZone: string = getCurrentTimeZone()): Date =>
 parseDateOnly(formatInstantToDateOnly(new Date(), timeZone));

const addMonthsClamped = (date: Date, months: number): Date => {
 const day = date.getUTCDate();
 const targetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
 return clampUtcDate(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), day);
};

const addYearsClamped = (date: Date, years: number): Date =>
 clampUtcDate(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate());

const addDaysUtc = (date: Date, days: number): Date => {
 const nextDate = new Date(date.getTime());
 nextDate.setUTCDate(nextDate.getUTCDate() + days);
 return nextDate;
};

export const addBillingPeriodToDate = (
 dateString: string,
 period: string,
 customDate?: string
): string => {
 const date = parseDateOnly(dateString);

 switch (period) {
 case 'monthly':
 return formatDateOnly(addMonthsClamped(date, 1));
 case 'yearly':
 return formatDateOnly(addYearsClamped(date, 1));
 case 'custom': {
 const customDays = parseCustomDays(customDate);
 return customDays ? formatDateOnly(addDaysUtc(date, customDays)) : dateString;
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
 customDate?: string
): string => addBillingPeriodToDate(lastPaymentDate, period, customDate);

export const getDaysUntil = (
 dateString: string,
 timeZone: string = getCurrentTimeZone()
): number => {
 const today = getTodayDateOnly(timeZone);
 const date = parseDateOnly(dateString);
 const diffTime = date.getTime() - today.getTime();
 return Math.ceil(diffTime / MS_PER_DAY);
};

export const getAutoRenewedDates = (
 lastPaymentDate: string,
 nextPaymentDate: string,
 period: string,
 customDate?: string,
 timeZone: string = getCurrentTimeZone()
): { lastPaymentDate: string; nextPaymentDate: string } => {
 const today = formatDateOnly(getTodayDateOnly(timeZone));

 // 如果还没到期，返回原始日期
 if (compareDateOnly(nextPaymentDate, today) >= 0) {
 return { lastPaymentDate, nextPaymentDate };
 }

 let newLastPaymentDate = lastPaymentDate;
 let newNextPaymentDate = nextPaymentDate;

 while (compareDateOnly(newNextPaymentDate, today) < 0) {
 const advancedDate = addBillingPeriodToDate(newNextPaymentDate, period, customDate);

 if (advancedDate === newNextPaymentDate) {
 break;
 }

 newLastPaymentDate = newNextPaymentDate;
 newNextPaymentDate = advancedDate;
 }

 return {
 lastPaymentDate: newLastPaymentDate,
 nextPaymentDate: newNextPaymentDate,
 };
};
