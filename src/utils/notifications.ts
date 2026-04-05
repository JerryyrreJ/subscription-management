import { Subscription } from '../types';
import { buildSubscriptionReminderContent } from './notificationContent';

/**
 * 请求浏览器通知权限
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
 if (!('Notification' in window)) {
 console.warn('Browser does not support notifications');
 return 'denied';
 }

 if (Notification.permission === 'granted') {
 return 'granted';
 }

 if (Notification.permission === 'denied') {
 return 'denied';
 }

 // 请求权限
 const permission = await Notification.requestPermission();
 return permission;
}

/**
 * 发送浏览器通知
 */
export function sendBrowserNotification(
 subscription: Subscription,
 daysUntil: number,
 locale?: string
): void {
 if (!('Notification' in window)) {
 console.warn('Browser does not support notifications');
 return;
 }

 if (Notification.permission !== 'granted') {
 console.warn('Notification permission not granted');
 return;
 }

 const { title, body } = buildSubscriptionReminderContent(subscription, daysUntil, locale);

 try {
 const notification = new Notification(title, {
 body,
 icon: '/icon.png', // 需要在 public 目录添加图标
 tag: subscription.id, // 避免重复通知
 requireInteraction: false
 });

 // 点击通知时的行为（可选）
 notification.onclick = () => {
 window.focus();
 notification.close();
 };
 } catch (error) {
 console.error('Failed to send browser notification:', error);
 }
}

/**
 * 检查浏览器通知支持情况
 */
export function isNotificationSupported(): boolean {
 return 'Notification' in window;
}

/**
 * 获取当前通知权限状态
 */
export function getNotificationPermission(): NotificationPermission {
 if (!isNotificationSupported()) {
 return 'denied';
 }
 return Notification.permission;
}
