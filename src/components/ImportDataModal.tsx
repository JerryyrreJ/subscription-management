import { useEffect } from 'react';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { X, AlertTriangle, Upload, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExportData } from '../utils/exportImport';
import { formatDateByLocale } from '../utils/dates';

interface ImportDataModalProps {
 isOpen: boolean;
 onClose: () => void;
 onConfirm: () => void | Promise<void>;
 previewData: ExportData | null;
 isImporting?: boolean;
}

export function ImportDataModal({
 isOpen,
 onClose,
 onConfirm,
 previewData,
 isImporting = false,
}: ImportDataModalProps) {
 useModalScrollLock(isOpen);
 const { t, i18n } = useTranslation(['importData', 'app', 'addSubscription']);

 useEffect(() => {
  if (!isOpen) return undefined;
  const handleKeyDown = (event: KeyboardEvent) => {
   if (event.key === 'Escape' && !isImporting) {
    onClose();
   }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
 }, [isImporting, isOpen, onClose]);

 if (!isOpen) return null;

 return (
 <div
  className="fixed inset-0 mobile-modal-viewport bg-black/50 flex items-center justify-center z-50 p-4"
  onMouseDown={event => {
   if (event.target === event.currentTarget && !isImporting) {
    onClose();
   }
  }}
 >
 <div
  role="dialog"
  aria-modal="true"
  aria-labelledby="import-data-title"
  className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-lg max-w-md w-full mobile-modal-panel animate-scale-in"
 >
 <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
 <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500"/>
 </div>
 <h2 id="import-data-title" className="text-xl font-semibold text-gray-900 dark:text-white">
 {t('importData:title')}
 </h2>
 </div>
 <button
 type="button"
 onClick={onClose}
 disabled={isImporting}
 aria-label={t('addSubscription:closeForm')}
 className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
 >
 <X className="w-6 h-6"/>
 </button>
 </div>

 <div className="p-6 space-y-4">
 <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-4">
 <p className="text-sm text-yellow-800 dark:text-yellow-200">
 ⚠️ <strong>{t('importData:warningTitle')}</strong> {t('importData:warningBody')}
 </p>
 </div>

 {previewData && (
 <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4 space-y-2">
 <h3 className="font-medium text-gray-900 dark:text-white mb-3">
 {t('importData:previewTitle')}
 </h3>
 <div className="space-y-2 text-sm">
 <div className="flex justify-between">
 <span className="text-gray-600 dark:text-gray-400">{t('importData:subscriptions')}</span>
 <span className="font-medium text-gray-900 dark:text-white">
 {previewData.subscriptions.length}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-600 dark:text-gray-400">{t('importData:categories')}</span>
 <span className="font-medium text-gray-900 dark:text-white">
 {previewData.categories?.length || 0}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-600 dark:text-gray-400">{t('importData:exportDate')}</span>
 <span className="font-medium text-gray-900 dark:text-white">
 {formatDateByLocale(new Date(previewData.exportDate), i18n.language, { dateStyle: 'medium' })}
 </span>
 </div>
 {previewData.version && (
 <div className="flex justify-between">
 <span className="text-gray-600 dark:text-gray-400">{t('importData:version')}</span>
 <span className="font-medium text-gray-900 dark:text-white">
 {previewData.version}
 </span>
 </div>
 )}
 </div>
 </div>
 )}

 <div className="flex gap-3 pt-4">
 <button
 type="button"
 onClick={onClose}
 disabled={isImporting}
 className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
 >
 {t('app:cancel')}
 </button>
 <button
 type="button"
 onClick={() => void onConfirm()}
 disabled={isImporting}
 className="flex-1 px-4 py-2.5 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 text-white rounded-2xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {isImporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
 {isImporting ? t('importData:importing') : t('importData:import')}
 </button>
 </div>
 </div>
 </div>
 </div>
 );
}
