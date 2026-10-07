import { Check, Download, Upload, Globe, Moon, Sun, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '../../hooks/useAppLanguage';
import { LANGUAGE_LABELS, SUPPORTED_LOCALES } from '../../i18n/types';
import { Theme } from '../../types';

interface GeneralSettingsContentProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onExportData: () => void;
  onImportData: () => void;
}

export function GeneralSettingsContent({ theme, onThemeChange, onExportData, onImportData }: GeneralSettingsContentProps) {
  const { t } = useTranslation(['userMenu', 'settingsHub']);
  const { language, setLanguage } = useAppLanguage();
  return (
    <div className="settings-page">
      <div className="settings-page-heading">
        <h2>{t('settingsHub:generalTitle')}</h2>
        <p>{t('settingsHub:generalSubtitle')}</p>
      </div>
      <section className="settings-card">
        <div className="settings-section-heading">
          <div className="settings-section-icon"><Globe size={18} aria-hidden="true" /></div>
          <div><h3>{t('settingsHub:languageTitle')}</h3><p>{t('settingsHub:languageDescription')}</p></div>
        </div>
        <div className="settings-options" role="group" aria-label={t('settingsHub:languageTitle')}>
          {SUPPORTED_LOCALES.map(locale => (
            <button key={locale} type="button" lang={locale} aria-pressed={language === locale} onClick={() => void setLanguage(locale)} className="settings-option">
              {LANGUAGE_LABELS[locale]}<Check size={16} aria-hidden="true" className={language === locale ? '' : 'invisible'} />
            </button>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-section-heading">
          <div className="settings-section-icon"><Monitor size={18} aria-hidden="true" /></div>
          <div><h3>{t('settingsHub:appearanceTitle')}</h3><p>{t('settingsHub:appearanceDescription')}</p></div>
        </div>
        <div className="settings-options" role="group" aria-label={t('settingsHub:appearanceTitle')}>
          {(['light', 'dark'] as const).map(value => (
            <button key={value} type="button" aria-pressed={theme === value} onClick={() => onThemeChange(value)} className="settings-option">
              <span className="flex items-center gap-2">{value === 'light' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}{t(`settingsHub:${value}Theme`)}</span>
              <Check size={16} aria-hidden="true" className={theme === value ? '' : 'invisible'} />
            </button>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-section-heading">
          <div className="settings-section-icon"><Download size={18} aria-hidden="true" /></div>
          <div><h3>{t('settingsHub:dataManagementTitle')}</h3><p>{t('settingsHub:dataManagementDescription')}</p></div>
        </div>
        <div className="settings-data-actions">
          <button type="button" onClick={onExportData} className="settings-button"><Download size={16} aria-hidden="true" />{t('userMenu:exportData')}</button>
          <button type="button" onClick={onImportData} className="settings-button"><Upload size={16} aria-hidden="true" />{t('userMenu:importData')}</button>
        </div>
      </section>
      <p className="settings-footnote"><Check size={13} aria-hidden="true" />{t('settingsHub:preferencesSaved')}</p>
    </div>
  );
}
