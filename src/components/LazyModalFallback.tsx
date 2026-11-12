import { useTranslation } from 'react-i18next';

interface LazyModalFallbackProps {
  title: string;
  description: string;
  onClose: () => void;
}

export function LazyModalFallback({
  title,
  description,
  onClose,
}: LazyModalFallbackProps) {
  const { t } = useTranslation(['app']);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md rounded-3xl border border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-[#1a1c1e]/95 shadow-apple-xl p-8 text-center">
        <div className="w-10 h-10 border-4 border-emerald-600 dark:border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{description}</p>
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-colors"
        >
          {t('app:cancel')}
        </button>
      </div>
    </div>
  );
}
