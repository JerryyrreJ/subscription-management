import { ReminderSettings } from '../types';
import { getDaysUntil } from './dates';
import { cleanupNotificationHistoryEntries } from './notificationHistory';

const NOTIFICATION_STORAGE_KEY = 'notification_settings';

const normalizeNotificationSettings = (settings: Partial<ReminderSettings> & { browserNotification?: unknown }): ReminderSettings => {
 const defaultSettings = getDefaultNotificationSettings();

 return {
  barkPush: {
   enabled: settings.barkPush?.enabled ?? defaultSettings.barkPush.enabled,
   serverUrl: settings.barkPush?.serverUrl || defaultSettings.barkPush.serverUrl,
   deviceKey: settings.barkPush?.deviceKey || defaultSettings.barkPush.deviceKey,
   daysBefore: settings.barkPush?.daysBefore ?? defaultSettings.barkPush.daysBefore,
   notificationHistory: settings.barkPush?.notificationHistory || {}
  }
 };
};

/**
 * 获取默认通知设置（简化版 - 只保留 Bark）
 */
export function getDefaultNotificationSettings(): ReminderSettings {
 return {
 barkPush: {
 enabled: false,
 serverUrl: 'https://api.day.app',
 deviceKey: '',
 daysBefore: 3,
 notificationHistory: {}
 }
 };
}

/**
 * 加载通知设置（从 localStorage）
 */
export function loadNotificationSettings(): ReminderSettings {
 try {
 const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
 if (!stored) {
 return getDefaultNotificationSettings();
 }

 const parsedSettings = JSON.parse(stored) as Partial<ReminderSettings> & { browserNotification?: unknown };
 const cleanedSettings = cleanupNotificationHistory(normalizeNotificationSettings(parsedSettings));

 if (JSON.stringify(parsedSettings) !== JSON.stringify(cleanedSettings)) {
  localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(cleanedSettings));
 }

 return cleanedSettings;
 } catch (error) {
 console.error('Failed to load notification settings:', error);
 return getDefaultNotificationSettings();
 }
}

/**
 * 保存通知设置（到 localStorage）
 */
export function saveNotificationSettings(settings: ReminderSettings): void {
 try {
 const cleanedSettings = cleanupNotificationHistory(normalizeNotificationSettings(settings));
 localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(cleanedSettings));
 } catch (error) {
 console.error('Failed to save notification settings:', error);
 }
}

/**
 * 计算距离下次付款的天数
 */
export function getDaysUntilPayment(nextPaymentDate: string): number {
 return getDaysUntil(nextPaymentDate);
}

/**
 * 清理过期的通知历史（超过30天的记录）
 */
export function cleanupNotificationHistory(settings: ReminderSettings): ReminderSettings {
 const cleanedBarkHistory = cleanupNotificationHistoryEntries(settings.barkPush.notificationHistory);

 return {
  ...settings,
  barkPush: {
   ...settings.barkPush,
   notificationHistory: cleanedBarkHistory
  }
 };
}
