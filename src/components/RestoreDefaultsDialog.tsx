import { X, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface RestoreDefaultsDialogProps {
 isOpen: boolean
 onConfirm: () => void
 onCancel: () => void
}

export function RestoreDefaultsDialog({
 isOpen,
 onConfirm,
 onCancel
}: RestoreDefaultsDialogProps) {
 const { t } = useTranslation(['categorySettings', 'app'])
 if (!isOpen) return null

 return (
 <div className="fixed inset-0 bg-black bg-opacity-60 dark:bg-opacity-80 flex items-center justify-center p-4 z-[60]">
 <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-xl max-w-md w-full">
 {/* Header */}
 <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
 <div className="flex items-start justify-between">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-[#e5e7eb] dark:bg-[#2a2d31] dark:bg-zinc-800/50 rounded-2xl">
 <RotateCcw className="w-6 h-6 text-emerald-700 dark:text-emerald-400 dark:text-zinc-600 dark:text-zinc-400"/>
 </div>
 <div>
 <h3 className="text-lg font-bold text-gray-900 dark:text-white">
 {t('categorySettings:restoreDefaultsTitle')}
 </h3>
 </div>
 </div>
 <button
 onClick={onCancel}
 className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
 >
 <X className="w-5 h-5"/>
 </button>
 </div>
 </div>

 {/* Content */}
 <div className="p-4 sm:p-6 space-y-4">
 <div className="bg-[#f4f5f7] dark:bg-[#202225] dark:bg-zinc-800/20 border border-zinc-200 dark:border-zinc-800 dark:border-zinc-700 dark:border-zinc-700 rounded-2xl p-4">
 <p className="text-sm text-emerald-600 dark:text-emerald-300 mb-3">
 {t('categorySettings:restoreDefaultsIntro')}
 </p>
 <ul className="text-sm text-zinc-700 dark:text-zinc-300 space-y-1.5 ml-4">
 <li className="flex items-center gap-2">
 <span className="w-1.5 h-1.5 bg-emerald-600 dark:bg-emerald-500 dark:bg-zinc-400 rounded-full"></span>
 {t('categorySettings:restoreDefaultsPointUnhide')}
 </li>
 <li className="flex items-center gap-2">
 <span className="w-1.5 h-1.5 bg-emerald-600 dark:bg-emerald-500 dark:bg-zinc-400 rounded-full"></span>
 {t('categorySettings:restoreDefaultsPointRestoreMissing')}
 </li>
 </ul>
 </div>

 <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-3">
 <p className="text-xs text-green-800 dark:text-green-200">
 ✓ {t('categorySettings:restoreDefaultsCustomSafe')}
 </p>
 </div>
 </div>

 {/* Footer */}
 <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
 <button
 onClick={onCancel}
 className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
 >
 {t('app:cancel')}
 </button>
 <button
 onClick={onConfirm}
 className="flex-1 px-4 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-2xl hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors font-medium"
 >
 {t('categorySettings:restoreDefaults')}
 </button>
 </div>
 </div>
 </div>
 )
}
