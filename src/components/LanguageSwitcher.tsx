import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '../hooks/useAppLanguage';
import { LANGUAGE_LABELS, SUPPORTED_LOCALES, SupportedLocale } from '../i18n/types';

export function LanguageSwitcher() {
  const { t } = useTranslation('settingsHub');
  const { language, setLanguage } = useAppLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[SUPPORTED_LOCALES.indexOf(language)]?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [isOpen, language]);

  const chooseLanguage = (locale: SupportedLocale) => {
    setIsOpen(false);
    triggerRef.current?.focus();
    void setLanguage(locale);
  };

  return (
    <div
      ref={rootRef}
      className="header-language"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      onKeyDown={event => {
        if (isOpen && (event.key === 'Escape' || event.key === 'Tab')) {
          setIsOpen(false);
          triggerRef.current?.focus();
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          if (!isOpen) { setIsOpen(true); return; }
          const current = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
          const count = SUPPORTED_LOCALES.length;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
          optionRefs.current[next]?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="header-language-trigger app-theme-chip"
        aria-label={`${t('languageTitle')}: ${LANGUAGE_LABELS[language]}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Languages size={16} aria-hidden="true" />
        <span lang={language}>{LANGUAGE_LABELS[language]}</span>
        <ChevronDown size={13} className="header-language-chevron" aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="header-language-menu">
          <p className="header-language-label">{t('languageTitle')}</p>
          <div id={listId} role="listbox" aria-label={t('languageTitle')}>
            {SUPPORTED_LOCALES.map((locale, index) => (
              <button
                key={locale}
                ref={element => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={language === locale}
                lang={locale}
                className="header-language-option"
                onClick={() => chooseLanguage(locale)}
              >
                <span>{LANGUAGE_LABELS[locale]}</span>
                {language === locale && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
