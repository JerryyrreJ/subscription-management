import { formatDateOnly, formatInstantToDateOnly, getTodayDateOnly } from './dates';

export const NOTIFICATION_HISTORY_RETENTION_DAYS = 30;

export function cleanupNotificationHistoryEntries(
 history: Record<string, string>,
 timeZone?: string
): Record<string, string> {
 const retentionStart = getTodayDateOnly(timeZone);
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
 updates: Record<string, string>,
 timeZone?: string
): Record<string, string> {
 return cleanupNotificationHistoryEntries({
  ...baseHistory,
  ...updates,
 }, timeZone);
}

export function wasNotifiedOnDate(
 subscriptionId: string,
 notificationHistory: Record<string, string>,
 targetDate: Date,
 timeZone?: string
): boolean {
 const lastNotificationDate = notificationHistory[subscriptionId];
 if (!lastNotificationDate) {
  return false;
 }

 try {
  return formatInstantToDateOnly(new Date(lastNotificationDate), timeZone) === formatDateOnly(targetDate);
 } catch {
  return false;
 }
}

export function wasNotifiedToday(
 subscriptionId: string,
 notificationHistory: Record<string, string>,
 timeZone?: string
): boolean {
 return wasNotifiedOnDate(subscriptionId, notificationHistory, getTodayDateOnly(timeZone), timeZone);
}
