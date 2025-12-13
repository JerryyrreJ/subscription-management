import { ReminderSettings } from '../types';

const NOTIFICATION_STORAGE_KEY = 'notification_settings';

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

    const settings = JSON.parse(stored) as any;

    // 数据迁移：移除旧的 browserNotification 字段
    if (settings.browserNotification) {
      delete settings.browserNotification;
    }

    // 确保 barkPush 字段存在
    if (!settings.barkPush) {
      settings.barkPush = getDefaultNotificationSettings().barkPush;
    }

    // 确保 notificationHistory 字段存在
    if (!settings.barkPush.notificationHistory) {
      settings.barkPush.notificationHistory = {};
    }

    return settings as ReminderSettings;
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
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save notification settings:', error);
  }
}

/**
 * 计算距离下次付款的天数
 */
export function getDaysUntilPayment(nextPaymentDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const paymentDate = new Date(nextPaymentDate);
  paymentDate.setHours(0, 0, 0, 0);

  const diffTime = paymentDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * 清理过期的通知历史（超过30天的记录）
 */
export function cleanupNotificationHistory(settings: ReminderSettings): void {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 清理 Bark 推送历史
  const cleanedBarkHistory: { [key: string]: string } = {};
  Object.entries(settings.barkPush.notificationHistory).forEach(([id, dateStr]) => {
    const date = new Date(dateStr);
    if (date >= thirtyDaysAgo) {
      cleanedBarkHistory[id] = dateStr;
    }
  });
  settings.barkPush.notificationHistory = cleanedBarkHistory;

  saveNotificationSettings(settings);
}

