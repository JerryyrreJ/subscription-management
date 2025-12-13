export type Period = 'monthly' | 'yearly' | 'custom';

export type Currency = 'CNY' | 'USD' | 'EUR' | 'JPY' | 'GBP' | 'AUD' | 'CAD' | 'CHF' | 'HKD' | 'SGD';

export interface Subscription {
  id: string;
  name: string;
  category: string;
  amount: number;
  currency: Currency;
  period: Period;
  lastPaymentDate: string;
  nextPaymentDate: string;
  customDate?: string;
  createdAt?: string;
  notificationEnabled?: boolean; // 是否启用通知提醒（默认 true）
}

export type ViewMode = 'monthly' | 'yearly';

export type SortBy = 'name' | 'amount' | 'nextPaymentDate' | 'category' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface SortConfig {
  sortBy: SortBy;
  sortOrder: SortOrder;
}

export type Theme = 'light' | 'dark';

export interface ExchangeRates {
  [key: string]: number;
}

export interface CurrencyInfo {
  code: Currency;
  symbol: string;
  name: string;
}

export interface ReminderSettings {
  // Bark 推送（移除浏览器通知，只保留 Bark）
  barkPush: {
    enabled: boolean;
    serverUrl: string;
    deviceKey: string;
    daysBefore: number;
    notificationHistory: {
      [subscriptionId: string]: string; // 上次通知日期（由后端管理）
    };
  };
}