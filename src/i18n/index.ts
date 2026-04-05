import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';
import { DEFAULT_LOCALE, SupportedLocale, SUPPORTED_LOCALES } from './types';
import { detectInitialLocale, normalizeLocale, setStoredLocale } from '../utils/locale';

const applyDocumentLanguage = (locale: SupportedLocale) => {
 if (typeof document === 'undefined') {
  return;
 }

 document.documentElement.lang = locale;
};

const initialLocale = detectInitialLocale();

if (!i18n.isInitialized) {
 void i18n
  .use(initReactI18next)
  .init({
   resources,
   lng: initialLocale,
   fallbackLng: DEFAULT_LOCALE,
   supportedLngs: [...SUPPORTED_LOCALES],
   ns: ['common', 'app', 'userMenu', 'addSubscription', 'auth', 'notificationSettings', 'dashboard', 'editSubscription', 'subscriptionDetails', 'categorySettings', 'importData', 'accountModals', 'pricing', 'subscriptionCard', 'footer', 'theme', 'analytics'],
   defaultNS: 'common',
   interpolation: {
    escapeValue: false,
   },
   react: {
    useSuspense: false,
   },
  });
}

applyDocumentLanguage(initialLocale);
setStoredLocale(initialLocale);

i18n.on('languageChanged', language => {
 const locale = normalizeLocale(language);
 applyDocumentLanguage(locale);
 setStoredLocale(locale);
});

export default i18n;
