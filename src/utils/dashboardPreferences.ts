import type { Currency, SortBy, SortConfig, SortOrder, ViewMode } from '../types';
import { CURRENCIES } from './currency';
import { getCurrentLocale } from './locale';

const BASE_CURRENCY_KEY = 'dashboard_base_currency';
const VIEW_MODE_KEY = 'dashboard_view_mode';
const SORT_CONFIG_KEY = 'dashboard_sort_config';

const VALID_VIEW_MODES: readonly ViewMode[] = ['monthly', 'yearly'];
const VALID_SORT_BY: readonly SortBy[] = ['amount', 'name', 'category', 'nextPaymentDate', 'createdAt'];
const VALID_SORT_ORDER: readonly SortOrder[] = ['asc', 'desc'];

const DEFAULT_SORT_CONFIG: SortConfig = {
 sortBy: 'nextPaymentDate',
 sortOrder: 'asc',
};

const isSupportedCurrency = (value: unknown): value is Currency =>
 typeof value === 'string' && CURRENCIES.some(currency => currency.code === value);

export function loadBaseCurrency(locale: string = getCurrentLocale()): Currency {
 try {
  const saved = localStorage.getItem(BASE_CURRENCY_KEY);
  if (isSupportedCurrency(saved)) {
   return saved;
  }
 } catch {
  // Ignore storage access errors and fall back to locale default.
 }

 return locale.toLowerCase().startsWith('zh') ? 'CNY' : 'USD';
}

export function saveBaseCurrency(currency: Currency): void {
 try {
  localStorage.setItem(BASE_CURRENCY_KEY, currency);
 } catch {
  // Persistence is best-effort.
 }
}

export function loadViewMode(): ViewMode {
 try {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  if (saved && VALID_VIEW_MODES.includes(saved as ViewMode)) {
   return saved as ViewMode;
  }
 } catch {
  // Ignore storage access errors.
 }

 return 'monthly';
}

export function saveViewMode(mode: ViewMode): void {
 try {
  localStorage.setItem(VIEW_MODE_KEY, mode);
 } catch {
  // Persistence is best-effort.
 }
}

export function loadSortConfig(): SortConfig {
 try {
  const raw = localStorage.getItem(SORT_CONFIG_KEY);
  if (!raw) {
   return DEFAULT_SORT_CONFIG;
  }
  const parsed = JSON.parse(raw) as Partial<SortConfig>;
  if (
   parsed &&
   VALID_SORT_BY.includes(parsed.sortBy as SortBy) &&
   VALID_SORT_ORDER.includes(parsed.sortOrder as SortOrder)
  ) {
   return {
    sortBy: parsed.sortBy as SortBy,
    sortOrder: parsed.sortOrder as SortOrder,
   };
  }
 } catch {
  // Ignore malformed JSON or storage errors.
 }

 return DEFAULT_SORT_CONFIG;
}

export function saveSortConfig(config: SortConfig): void {
 try {
  localStorage.setItem(SORT_CONFIG_KEY, JSON.stringify(config));
 } catch {
  // Persistence is best-effort.
 }
}
