import { useTranslation } from 'react-i18next';
import { SupportedLocale } from '../i18n/types';
import { normalizeLocale } from '../utils/locale';

export const useAppLanguage = () => {
 const { i18n } = useTranslation();

 return {
  language: normalizeLocale(i18n.resolvedLanguage || i18n.language),
  setLanguage: (locale: SupportedLocale) => i18n.changeLanguage(locale),
 };
};
