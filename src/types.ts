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
}

export type ViewMode = 'monthly' | 'yearly';

export interface ExchangeRates {
  [key: string]: number;
}

export interface CurrencyInfo {
  code: Currency;
  symbol: string;
  name: string;
}