import { Subscription } from '../types';
import { DEFAULT_CURRENCY } from './currency';

const STORAGE_KEY = 'subscription-tracker-data';

export const loadSubscriptions = (): Subscription[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const subscriptions = JSON.parse(data);

    // 为旧数据添加默认字段以保证向后兼容
    return subscriptions.map((subscription: Partial<Subscription>) => ({
      ...subscription,
      currency: subscription.currency || DEFAULT_CURRENCY,
      createdAt: subscription.createdAt || new Date().toISOString(),
      notificationEnabled: subscription.notificationEnabled ?? true, // 默认启用通知
    })) as Subscription[];
  } catch (error) {
    console.error('Error loading subscriptions:', error);
    return [];
  }
};

export const saveSubscriptions = (subscriptions: Subscription[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
  } catch (error) {
    console.error('Error saving subscriptions:', error);
  }
};