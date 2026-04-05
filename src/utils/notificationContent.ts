import { Currency, Period, Subscription } from '../types';
import { DEFAULT_LOCALE, SupportedLocale } from '../i18n/types';
import { formatCurrency } from './currency';
import { normalizeLocale } from './locale';

interface NotificationLocaleCopy {
 appName: string;
 testTitle: string;
 testBody: string;
 reminderToday: string;
 reminderInDaysOne: string;
 reminderInDaysOther: string;
 periodMonthly: string;
 periodYearly: string;
 periodCustom: string;
 customDaysOne: string;
 customDaysOther: string;
}

const NOTIFICATION_COPY: Record<SupportedLocale, NotificationLocaleCopy> = {
 en: {
  appName: 'Subscription Manager',
  testTitle: 'Test Notification',
  testBody: 'This is a test push from Subscription Manager',
  reminderToday: '{{name}} renews today',
  reminderInDaysOne: '{{name}} renews in {{count}} day',
  reminderInDaysOther: '{{name}} renews in {{count}} days',
  periodMonthly: 'month',
  periodYearly: 'year',
  periodCustom: 'custom',
  customDaysOne: '{{count}} day',
  customDaysOther: '{{count}} days',
 },
 'zh-CN': {
  appName: '订阅管理器',
  testTitle: '测试通知',
  testBody: '这是一条来自订阅管理器的测试推送',
  reminderToday: '{{name}} 将于今天续费',
  reminderInDaysOne: '{{name}} 将于 {{count}} 天后续费',
  reminderInDaysOther: '{{name}} 将于 {{count}} 天后续费',
  periodMonthly: '月',
  periodYearly: '年',
  periodCustom: '自定义',
  customDaysOne: '{{count}} 天',
  customDaysOther: '{{count}} 天',
 },
};

const interpolate = (template: string, values: Record<string, string | number>): string =>
 template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''));

const resolveLocaleCopy = (locale?: string | null): NotificationLocaleCopy =>
 NOTIFICATION_COPY[normalizeLocale(locale)] || NOTIFICATION_COPY[DEFAULT_LOCALE];

const getPeriodLabel = (
 period: Period,
 locale: string | undefined,
 customDate?: string
): string => {
 const copy = resolveLocaleCopy(locale);

 if (period === 'monthly') {
  return copy.periodMonthly;
 }

 if (period === 'yearly') {
  return copy.periodYearly;
 }

 const customDays = Number.parseInt(customDate || '', 10);
 if (Number.isFinite(customDays) && customDays > 0) {
  return interpolate(
   customDays === 1 ? copy.customDaysOne : copy.customDaysOther,
   { count: customDays }
  );
 }

 return copy.periodCustom;
};

const buildReminderLine = (
 subscriptionName: string,
 daysUntil: number,
 locale?: string | null
): string => {
 const copy = resolveLocaleCopy(locale);

 if (daysUntil <= 0) {
  return interpolate(copy.reminderToday, { name: subscriptionName });
 }

 return interpolate(
  daysUntil === 1 ? copy.reminderInDaysOne : copy.reminderInDaysOther,
  { name: subscriptionName, count: daysUntil }
 );
};

export const buildSubscriptionReminderContent = (
 subscription: Subscription,
 daysUntil: number,
 locale?: string | null
): { title: string; body: string; group: string } => {
 const normalizedLocale = normalizeLocale(locale);
 const copy = resolveLocaleCopy(normalizedLocale);
 const periodLabel = getPeriodLabel(subscription.period, normalizedLocale, subscription.customDate);
 const amountLabel = formatCurrency(subscription.amount, subscription.currency as Currency, normalizedLocale);

 return {
  title: copy.appName,
  group: copy.appName,
  body: `${buildReminderLine(subscription.name, daysUntil, normalizedLocale)}\n${amountLabel}/${periodLabel}`,
 };
};

export const buildTestNotificationContent = (
 locale?: string | null
): { title: string; body: string; group: string } => {
 const copy = resolveLocaleCopy(locale);

 return {
  title: copy.testTitle,
  body: copy.testBody,
  group: copy.appName,
 };
};
