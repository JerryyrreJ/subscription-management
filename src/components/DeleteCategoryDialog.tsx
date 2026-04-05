import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CustomSelect } from './CustomSelect'

interface DeleteCategoryDialogProps {
 isOpen: boolean
 categoryName: string
 isBuiltIn: boolean
 affectedCount: number
 affectedSubscriptions: Array<{ id: string; name: string }>
 availableCategories: string[]
 onConfirm: (moveToCategory?: string) => void
 onCancel: () => void
}

export function DeleteCategoryDialog({
 isOpen,
 categoryName,
 isBuiltIn,
 affectedCount,
 affectedSubscriptions,
 availableCategories,
 onConfirm,
 onCancel
}: DeleteCategoryDialogProps) {
 const { t } = useTranslation(['categorySettings', 'app'])
 const [moveToCategory, setMoveToCategory] = useState<string>('')

 if (!isOpen) return null

 const handleConfirm = () => {
 onConfirm(moveToCategory || undefined)
 setMoveToCategory('')
 }

 const handleCancel = () => {
 setMoveToCategory('')
 onCancel()
 }

 return (
 <div className="fixed inset-0 bg-black bg-opacity-60 dark:bg-opacity-80 flex items-center justify-center p-4 z-[60]">
 <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-xl max-w-md w-full">
 {/* Header */}
 <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
 <div className="flex items-start justify-between">
 <div className="flex items-center gap-3">
 <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-2xl">
 <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400"/>
 </div>
 <div>
 <h3 className="text-lg font-bold text-gray-900 dark:text-white">
 {isBuiltIn ? t('categorySettings:deleteDialogHideTitle') : t('categorySettings:deleteDialogDeleteTitle')}
 </h3>
 <p className="text-sm text-gray-500 dark:text-gray-400">
"{categoryName}"
 </p>
 </div>
 </div>
 <button
 onClick={handleCancel}
 className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
 >
 <X className="w-5 h-5"/>
 </button>
 </div>
 </div>

 {/* Content */}
 <div className="p-4 sm:p-6 space-y-4">
 {affectedCount > 0 ? (
 <>
 <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-4">
 <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
 {t(affectedCount === 1 ? 'categorySettings:deleteDialogUsedByOne' : 'categorySettings:deleteDialogUsedByOther', { count: affectedCount })}
 </p>
 <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1 max-h-32 overflow-y-auto">
 {affectedSubscriptions.map(sub => (
 <li key={sub.id} className="flex items-center gap-2">
 <span className="w-1.5 h-1.5 bg-yellow-600 dark:bg-yellow-400 rounded-full"></span>
 {sub.name}
 </li>
 ))}
 </ul>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
 {t('categorySettings:deleteDialogMoveTo')}
 </label>
 <CustomSelect
 value={moveToCategory}
 onChange={setMoveToCategory}
 options={[
 { value: '', label: t('categorySettings:deleteDialogDefaultTarget') },
 ...availableCategories
 .filter(cat => cat !== categoryName)
 .map(cat => ({ value: cat, label: cat }))
 ]}
 required={false}
 />
 <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
 {t('categorySettings:deleteDialogMoveHint')}
 </p>
 </div>
 </>
 ) : (
 <div className="bg-[#f4f5f7] dark:bg-[#202225] dark:bg-zinc-800/20 border border-zinc-200 dark:border-zinc-800 dark:border-zinc-700 dark:border-zinc-700 rounded-2xl p-4">
 <p className="text-sm text-emerald-600 dark:text-emerald-300">
 {t('categorySettings:deleteDialogSafeMessage', {
  action: isBuiltIn
   ? t('categorySettings:deleteDialogSafeActionHide')
   : t('categorySettings:deleteDialogSafeActionDelete')
 })}
 </p>
 </div>
 )}

 {isBuiltIn && (
 <div className="bg-gray-50 dark:bg-gray-700 rounded-2xl p-3">
 <p className="text-xs text-gray-600 dark:text-gray-400">
 💡 {t('categorySettings:deleteDialogBuiltInNote')}
 </p>
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
 <button
 onClick={handleCancel}
 className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
 >
 {t('app:cancel')}
 </button>
 <button
 onClick={handleConfirm}
 className="flex-1 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-colors font-medium"
 >
 {isBuiltIn ? t('categorySettings:deleteDialogHideTitle') : t('categorySettings:deleteDialogDeleteTitle')}
 </button>
 </div>
 </div>
 </div>
 )
}
