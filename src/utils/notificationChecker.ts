import { Subscription, ReminderSettings } from '../types';
import { sendBrowserNotification } from './notifications';
import { sendSubscriptionReminder } from './barkPush';

const NOTIFICATION_STORAGE_KEY = 'notification_settings';

/**
 * 获取默认通知设置
 */
export function getDefaultNotificationSettings(): ReminderSettings {
  return {
    browserNotification: {
      enabled: false,
      daysBefore: 3,
      permission: 'default',
      notificationHistory: {}
    },
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
 * 加载通知设置
 */
export function loadNotificationSettings(): ReminderSettings {
  try {
    const stored = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!stored) {
      return getDefaultNotificationSettings();
    }

    const settings = JSON.parse(stored) as any;

    // 数据迁移：旧版本的notificationHistory迁移到新结构
    if (settings.notificationHistory && !settings.browserNotification?.notificationHistory) {
      const oldHistory = settings.notificationHistory;
      if (!settings.browserNotification) {
        settings.browserNotification = getDefaultNotificationSettings().browserNotification;
      }
      if (!settings.barkPush) {
        settings.barkPush = getDefaultNotificationSettings().barkPush;
      }
      settings.browserNotification.notificationHistory = oldHistory;
      settings.barkPush.notificationHistory = oldHistory;
      delete settings.notificationHistory;
    }

    // 确保新字段存在
    if (!settings.browserNotification?.notificationHistory) {
      settings.browserNotification.notificationHistory = {};
    }
    if (!settings.barkPush?.notificationHistory) {
      settings.barkPush.notificationHistory = {};
    }

    // 更新浏览器通知权限状态
    if ('Notification' in window) {
      settings.browserNotification.permission = Notification.permission;
    }

    return settings as ReminderSettings;
  } catch (error) {
    console.error('Failed to load notification settings:', error);
    return getDefaultNotificationSettings();
  }
}

/**
 * 保存通知设置
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
 * 检查今天是否已经通知过该订阅
 */
function wasNotifiedToday(
  subscriptionId: string,
  notificationHistory: { [key: string]: string }
): boolean {
  const lastNotificationDate = notificationHistory[subscriptionId];
  if (!lastNotificationDate) {
    return false;
  }

  const today = new Date().toDateString();
  const lastDate = new Date(lastNotificationDate).toDateString();

  return today === lastDate;
}

/**
 * 记录浏览器通知
 */
function recordBrowserNotification(
  subscriptionId: string,
  settings: ReminderSettings
): void {
  settings.browserNotification.notificationHistory[subscriptionId] = new Date().toISOString();
  saveNotificationSettings(settings);
}

/**
 * 记录Bark推送
 */
function recordBarkNotification(
  subscriptionId: string,
  settings: ReminderSettings
): void {
  settings.barkPush.notificationHistory[subscriptionId] = new Date().toISOString();
  saveNotificationSettings(settings);
}

/**
 * 检查并发送所有需要的通知
 */
export async function checkAndSendNotifications(
  subscriptions: Subscription[],
  settings: ReminderSettings
): Promise<void> {
  console.log('Checking for notifications...', new Date().toLocaleString());

  for (const subscription of subscriptions) {
    const daysUntil = getDaysUntilPayment(subscription.nextPaymentDate);

    // 跳过已过期或距离太远的订阅
    if (daysUntil < 0 || daysUntil > 14) {
      continue;
    }

    // 检查是否需要发送浏览器通知
    if (
      settings.browserNotification.enabled &&
      settings.browserNotification.permission === 'granted' &&
      daysUntil === settings.browserNotification.daysBefore &&
      !wasNotifiedToday(subscription.id, settings.browserNotification.notificationHistory)
    ) {
      console.log(`Sending browser notification for: ${subscription.name} (${daysUntil} days)`);
      sendBrowserNotification(subscription, daysUntil);
      recordBrowserNotification(subscription.id, settings);
    }

    // 检查是否需要发送 Bark 推送
    if (
      settings.barkPush.enabled &&
      settings.barkPush.serverUrl &&
      settings.barkPush.deviceKey &&
      daysUntil === settings.barkPush.daysBefore &&
      !wasNotifiedToday(subscription.id, settings.barkPush.notificationHistory)
    ) {
      console.log(`Sending Bark push for: ${subscription.name} (${daysUntil} days)`);
      const success = await sendSubscriptionReminder(
        settings.barkPush.serverUrl,
        settings.barkPush.deviceKey,
        subscription,
        daysUntil
      );

      if (success) {
        recordBarkNotification(subscription.id, settings);
      }
    }
  }
}

/**
 * 清理过期的通知历史（超过30天的记录）
 */
export function cleanupNotificationHistory(settings: ReminderSettings): void {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 清理浏览器通知历史
  const cleanedBrowserHistory: { [key: string]: string } = {};
  Object.entries(settings.browserNotification.notificationHistory).forEach(([id, dateStr]) => {
    const date = new Date(dateStr);
    if (date >= thirtyDaysAgo) {
      cleanedBrowserHistory[id] = dateStr;
    }
  });
  settings.browserNotification.notificationHistory = cleanedBrowserHistory;

  // 清理Bark推送历史
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
