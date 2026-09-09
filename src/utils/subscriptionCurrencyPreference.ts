import type { Currency } from '../types';
import { CURRENCIES } from './currency';
import { getCurrentLocale } from './locale';

const STORAGE_KEY = 'last_subscription_currency';

export function getNewSubscriptionCurrency(): Currency {
 try {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (CURRENCIES.some(currency => currency.code === saved)) return saved as Currency;
 } catch {
  // Storage may be unavailable; language defaults still work.
 }
 return getCurrentLocale() === 'zh-CN' ? 'CNY' : 'USD';
}

export function rememberSubscriptionCurrency(currency: Currency): void {
 try {
  window.localStorage.setItem(STORAGE_KEY, currency);
 } catch {
  // Persistence is optional and must not prevent editing the form.
 }
}
