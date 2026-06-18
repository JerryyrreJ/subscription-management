import { Download, Upload, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '../../hooks/useAppLanguage';
import { LANGUAGE_LABELS, SUPPORTED_LOCALES } from '../../i18n/types';

interface GeneralSettingsContentProps {
  onExportData: () => void;
  onImportData: () => void;
}

export function GeneralSettingsContent({ onExportData, onImportData }: GeneralSettingsContentProps) {
  const { t } = useTranslation(['userMenu', 'app']);
  const { language, setLanguage } = useAppLanguage();

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
          {t('app:generalSettings', 'General Settings')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('app:generalSettingsSubtitle', 'Manage language preferences and local data.')}
        </p>
      </div>

      <div className="space-y-6">
        {/* Language Selection */}
        <section className="bg-white dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('userMenu:languageSectionTitle', 'Language')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Choose your preferred display language.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {SUPPORTED_LOCALES.map(locale => {
              const isActive = language === locale;
              return (
                <button
                  key={locale}
                  type="button"
                  onClick={() => void setLanguage(locale)}
                  className={`px-4 py-4 rounded-xl border text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-[#1a1c1e] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {LANGUAGE_LABELS[locale]}
                </button>
              );
            })}
          </div>
        </section>

        {/* Data Management */}
        <section className="bg-white dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
              <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('app:dataManagement', 'Data Management')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Export or import your local data backups.</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={onExportData}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors"
            >
              <Download className="w-4 h-4"/>
              {t('userMenu:exportData')}
            </button>
            <button
              onClick={onImportData}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors"
            >
              <Upload className="w-4 h-4"/>
              {t('userMenu:importData')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
