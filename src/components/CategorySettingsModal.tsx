import { useState, useEffect } from 'react'
import { X, Trash2, GripVertical, Plus, RotateCcw, Eye, EyeOff } from 'lucide-react'
import {
  Category,
  getAllCategoriesWithDetails,
  updateCategoriesOrder,
  addCustomCategory,
  deleteCategory,
  restoreCategory,
  restoreDefaultCategories,
  FALLBACK_CATEGORY
} from '../utils/categories'
import { Subscription } from '../types'
import { DeleteCategoryDialog } from './DeleteCategoryDialog'

interface CategorySyncMethods {
  createCategory: (category: Category) => Promise<Category>
  updateCategory: (category: Category) => Promise<Category>
  deleteCategory: (categoryId: string) => Promise<void>
  updateCategoriesOrder: (categories: Category[]) => Promise<void>
}

interface CategorySettingsModalProps {
  isOpen: boolean
  onClose: () => void
  subscriptions: Subscription[]
  onCategoriesChanged?: () => void
  onUpdateSubscriptions?: (updatedSubscriptions: Subscription[]) => void
  categorySync?: CategorySyncMethods
}

export function CategorySettingsModal({
  isOpen,
  onClose,
  subscriptions,
  onCategoriesChanged,
  onUpdateSubscriptions,
  categorySync
}: CategorySettingsModalProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [error, setError] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [deleteDialogState, setDeleteDialogState] = useState<{
    isOpen: boolean
    category: Category | null
  }>({
    isOpen: false,
    category: null
  })
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // 加载类型列表
  useEffect(() => {
    if (isOpen) {
      loadCategories()
    }
  }, [isOpen])

  const loadCategories = () => {
    const allCategories = getAllCategoriesWithDetails()
    setCategories(allCategories)
  }

  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) {
      setError('Please enter a category name')
      return
    }

    // 使用本地函数添加类别（包含验证逻辑）
    const success = addCustomCategory(trimmed)
    if (success) {
      // 如果有云同步，则同步到云端
      if (categorySync) {
        const allCategories = getAllCategoriesWithDetails()
        const newCategory = allCategories.find(cat => cat.name === trimmed)
        if (newCategory) {
          try {
            await categorySync.createCategory(newCategory)
          } catch (error) {
            console.error('Failed to sync new category to cloud:', error)
          }
        }
      }

      setNewCategoryName('')
      setError('')
      loadCategories()
      onCategoriesChanged?.()
    } else {
      setError('Failed to add category. It may already exist.')
    }
  }

  const handleDeleteCategory = (category: Category) => {
    if (category.name === FALLBACK_CATEGORY) {
      return
    }

    // 打开删除确认对话框
    setDeleteDialogState({
      isOpen: true,
      category
    })
  }

  const handleConfirmDelete = async (moveToCategory?: string) => {
    if (!deleteDialogState.category) return

    const categoryName = deleteDialogState.category.name
    const categoryId = deleteDialogState.category.id
    const targetCategory = moveToCategory || FALLBACK_CATEGORY

    // 删除/隐藏类型
    deleteCategory(categoryName)

    // 如果有云同步，则同步到云端
    if (categorySync) {
      try {
        await categorySync.deleteCategory(categoryId)
      } catch (error) {
        console.error('Failed to sync category deletion to cloud:', error)
      }
    }

    // 更新受影响的订阅
    const affectedSubs = subscriptions.filter(sub => sub.category === categoryName)
    if (affectedSubs.length > 0 && onUpdateSubscriptions) {
      const updatedSubscriptions = subscriptions.map(sub =>
        sub.category === categoryName
          ? { ...sub, category: targetCategory }
          : sub
      )
      onUpdateSubscriptions(updatedSubscriptions)
    }

    // 关闭对话框并刷新
    setDeleteDialogState({ isOpen: false, category: null })
    loadCategories()
    onCategoriesChanged?.()
  }

  const handleCancelDelete = () => {
    setDeleteDialogState({ isOpen: false, category: null })
  }

  const handleRestoreCategory = async (category: Category) => {
    restoreCategory(category.name)

    // 如果有云同步，则同步到云端
    if (categorySync) {
      try {
        const restoredCategory = { ...category, isHidden: false }
        await categorySync.updateCategory(restoredCategory)
      } catch (error) {
        console.error('Failed to sync category restoration to cloud:', error)
      }
    }

    loadCategories()
    onCategoriesChanged?.()
  }

  const handleRestoreDefaults = () => {
    const confirmed = window.confirm('Restore all default categories? This will not affect your custom categories.')
    if (confirmed) {
      restoreDefaultCategories()
      loadCategories()
      onCategoriesChanged?.()
    }
  }

  // 拖拽处理函数
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const newCategories = [...categories]
    const [draggedItem] = newCategories.splice(draggedIndex, 1)
    newCategories.splice(dropIndex, 0, draggedItem)

    setCategories(newCategories)
    updateCategoriesOrder(newCategories)

    // 如果有云同步，则同步到云端
    if (categorySync) {
      try {
        await categorySync.updateCategoriesOrder(newCategories)
      } catch (error) {
        console.error('Failed to sync categories order to cloud:', error)
      }
    }

    onCategoriesChanged?.()

    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleClose = () => {
    setNewCategoryName('')
    setError('')
    setShowHidden(false)
    onClose()
  }

  if (!isOpen) return null

  // 过滤显示的类型
  const displayedCategories = showHidden
    ? categories
    : categories.filter(cat => !cat.isHidden)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-2 sm:p-4 z-50 modal-overlay">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden modal-content flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">
              Category Settings
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Add New Category */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Add New Category
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => {
                  setNewCategoryName(e.target.value)
                  setError('')
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddCategory()
                  }
                }}
                placeholder="Enter category name"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                onClick={handleAddCategory}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          {/* Controls */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium transition-colors flex items-center gap-1"
            >
              {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {showHidden ? 'Hide Hidden' : 'Show Hidden'}
            </button>
            <button
              onClick={handleRestoreDefaults}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-4 h-4" />
              Restore Defaults
            </button>
          </div>

          {/* Categories List */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Categories ({displayedCategories.length})
            </h3>
            <div className="space-y-1">
              {displayedCategories.map((category, index) => (
                <div
                  key={category.id}
                  draggable={!category.isHidden}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                    category.isHidden
                      ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 opacity-60'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                  } ${
                    draggedIndex === index
                      ? 'opacity-50 cursor-grabbing'
                      : category.isHidden
                      ? 'cursor-default'
                      : 'cursor-grab'
                  } ${
                    dragOverIndex === index && draggedIndex !== index
                      ? 'border-indigo-500 dark:border-indigo-400 shadow-lg'
                      : ''
                  }`}
                >
                  {/* Drag handle */}
                  <div className={`flex items-center justify-center ${
                    category.isHidden ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    <GripVertical className="w-5 h-5" />
                  </div>

                  {/* Category name */}
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm text-gray-900 dark:text-white">
                      {category.name}
                    </span>
                    {category.isBuiltIn && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                        Built-in
                      </span>
                    )}
                    {category.isHidden && (
                      <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400 rounded">
                        Hidden
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {category.isHidden ? (
                      <button
                        onClick={() => handleRestoreCategory(category)}
                        className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors"
                        title="Restore category"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeleteCategory(category)}
                        disabled={category.name === FALLBACK_CATEGORY}
                        className="p-1.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title={category.isBuiltIn ? 'Hide category' : 'Delete category'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <p>• Drag categories by the grip icon to reorder them</p>
            <p>• Built-in categories can be hidden but not deleted</p>
            <p>• Custom categories can be permanently deleted</p>
            <p>• "{FALLBACK_CATEGORY}" is protected and cannot be removed</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleClose}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors duration-200"
          >
            Done
          </button>
        </div>
      </div>

      {/* Delete Category Dialog */}
      {deleteDialogState.category && (
        <DeleteCategoryDialog
          isOpen={deleteDialogState.isOpen}
          categoryName={deleteDialogState.category.name}
          isBuiltIn={deleteDialogState.category.isBuiltIn}
          affectedCount={subscriptions.filter(sub => sub.category === deleteDialogState.category!.name).length}
          affectedSubscriptions={subscriptions
            .filter(sub => sub.category === deleteDialogState.category!.name)
            .map(sub => ({ id: sub.id, name: sub.name }))
          }
          availableCategories={categories
            .filter(cat => !cat.isHidden && cat.name !== deleteDialogState.category!.name)
            .map(cat => cat.name)
          }
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
  )
}
