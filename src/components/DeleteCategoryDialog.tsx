import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {isBuiltIn ? 'Hide Category' : 'Delete Category'}
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
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4">
          {affectedCount > 0 ? (
            <>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                  This category is being used by {affectedCount} subscription{affectedCount > 1 ? 's' : ''}:
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
                  Move these subscriptions to:
                </label>
                <CustomSelect
                  value={moveToCategory}
                  onChange={setMoveToCategory}
                  options={[
                    { value: '', label: 'Uncategorized (default)' },
                    ...availableCategories
                      .filter(cat => cat !== categoryName)
                      .map(cat => ({ value: cat, label: cat }))
                  ]}
                  required={false}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  If not selected, affected subscriptions will be moved to "Uncategorized"
                </p>
              </div>
            </>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                No subscriptions are using this category. It's safe to {isBuiltIn ? 'hide' : 'delete'} it.
              </p>
            </div>
          )}

          {isBuiltIn && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                💡 <strong>Note:</strong> Built-in categories are hidden, not deleted. You can restore them later from Category Settings.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            {isBuiltIn ? 'Hide Category' : 'Delete Category'}
          </button>
        </div>
      </div>
    </div>
  )
}
