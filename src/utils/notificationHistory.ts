import { formatDateOnly, getTodayDateOnly, parseDateOnly } from './dates';

export const NOTIFICATION_HISTORY_RETENTION_DAYS = 30;

export function cleanupNotificationHistoryEntries(
 history: Record<string, string>
): Record<string, string> {
 const retentionStart = getTodayDateOnly();
 retentionStart.setUTCDate(retentionStart.getUTCDate() - NOTIFICATION_HISTORY_RETENTION_DAYS);

 const cleanedHistory: Record<string, string> = {};

 Object.entries(history || {}).forEach(([id, dateStr]) => {
  const date = new Date(dateStr);
  if (!Number.isNaN(date.getTime()) && date >= retentionStart) {
   cleanedHistory[id] = dateStr;
  }
 });

 return cleanedHistory;
}

export function mergeNotificationHistoryEntries(
 baseHistory: Record<string, string>,
 updates: Record<string, string>
): Record<string, string> {
 return cleanupNotificationHistoryEntries({
  ...baseHistory,
  ...updates,
 });
}

export function wasNotifiedOnDate(
 subscriptionId: string,
 notificationHistory: Record<string, string>,
 targetDate: Date
): boolean {
 const lastNotificationDate = notificationHistory[subscriptionId];
 if (!lastNotificationDate) {
  return false;
 }

 try {
  return formatDateOnly(parseDateOnly(lastNotificationDate)) === formatDateOnly(targetDate);
 } catch {
  return false;
 }
}

export function wasNotifiedToday(
 subscriptionId: string,
 notificationHistory: Record<string, string>
): boolean {
 return wasNotifiedOnDate(subscriptionId, notificationHistory, getTodayDateOnly());
}
