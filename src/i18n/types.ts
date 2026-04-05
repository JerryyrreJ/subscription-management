export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const LANGUAGE_STORAGE_KEY = 'app_locale';

export const LANGUAGE_LABELS: Record<SupportedLocale, string> = {
 en: 'English',
 'zh-CN': '简体中文',
};
