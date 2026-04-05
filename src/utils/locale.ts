import {
 DEFAULT_LOCALE,
 LANGUAGE_STORAGE_KEY,
 SUPPORTED_LOCALES,
 SupportedLocale,
} from '../i18n/types';

const INTL_LOCALE_MAP: Record<SupportedLocale, string> = {
 en: 'en-US',
 'zh-CN': 'zh-CN',
};

export const isSupportedLocale = (locale: string): locale is SupportedLocale =>
 SUPPORTED_LOCALES.includes(locale as SupportedLocale);

export const normalizeLocale = (locale?: string | null): SupportedLocale => {
 if (!locale) {
  return DEFAULT_LOCALE;
 }

 const normalizedLocale = locale.trim().toLowerCase();

 if (normalizedLocale.startsWith('zh')) {
  return 'zh-CN';
 }

 if (normalizedLocale.startsWith('en')) {
  return 'en';
 }

 if (isSupportedLocale(locale)) {
  return locale;
 }

 return DEFAULT_LOCALE;
};

export const getStoredLocale = (): SupportedLocale | null => {
 if (typeof window === 'undefined') {
  return null;
 }

 try {
  const storedLocale = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return storedLocale ? normalizeLocale(storedLocale) : null;
 } catch (error) {
  console.error('Failed to read stored locale:', error);
  return null;
 }
};

export const setStoredLocale = (locale: SupportedLocale): void => {
 if (typeof window === 'undefined') {
  return;
 }

 try {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
 } catch (error) {
  console.error('Failed to persist locale:', error);
 }
};

export const detectBrowserLocale = (): SupportedLocale => {
 if (typeof navigator === 'undefined') {
  return DEFAULT_LOCALE;
 }

 const candidates = [
  ...(navigator.languages || []),
  navigator.language,
 ].filter(Boolean);

 for (const candidate of candidates) {
  const locale = normalizeLocale(candidate);
  if (isSupportedLocale(locale)) {
   return locale;
  }
 }

 return DEFAULT_LOCALE;
};

export const detectInitialLocale = (): SupportedLocale =>
 getStoredLocale() || detectBrowserLocale();

export const getCurrentLocale = (): SupportedLocale => {
 if (typeof document !== 'undefined') {
  const documentLocale = document.documentElement.lang;
  if (documentLocale) {
   return normalizeLocale(documentLocale);
  }
 }

 return detectInitialLocale();
};

export const getIntlLocale = (locale?: string | null): string =>
 INTL_LOCALE_MAP[normalizeLocale(locale)];
