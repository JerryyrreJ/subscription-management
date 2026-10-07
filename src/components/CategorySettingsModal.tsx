import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useState, useEffect } from 'react'
import { X, Trash2, GripVertical, Plus, RotateCcw, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CloudMutationResult } from '../types'
import {
 Category,
 getAllCategoriesWithDetails,
 updateCategoriesOrder,
 addCustomCategory,
 deleteCategory,
 restoreCategory,
 restoreDefaultCategories,
 FALLBACK_CATEGORY,
 getCategoryDisplayName
} from '../utils/categories'
import { Subscription } from '../types'
import { DeleteCategoryDialog } from './DeleteCategoryDialog'
import { RestoreDefaultsDialog } from './RestoreDefaultsDialog'

interface CategorySyncMethods {
 createCategory: (category: Category) => Promise<CloudMutationResult<Category>>
 updateCategory: (category: Category) => Promise<CloudMutationResult<Category>>
 deleteCategory: (categoryId: string) => Promise<CloudMutationResult<void>>
 updateCategoriesOrder: (categories: Category[]) => Promise<CloudMutationResult<Category[]>>
}

interface CategorySettingsModalProps {
  isOpen: boolean
  onClose: () => void
  subscriptions: Subscription[]
  onCategoriesChanged?: () => void
  onUpdateSubscriptions?: (updatedSubscriptions: Subscription[]) => Promise<void>
  categorySync?: CategorySyncMethods
  isStandalone?: boolean
}

export function CategorySettingsModal({
  isOpen,
  onClose,
  subscriptions,
  onCategoriesChanged,
  onUpdateSubscriptions,
  categorySync,
  isStandalone = true
}: CategorySettingsModalProps) {
 useModalScrollLock(isOpen && isStandalone);
  const { t } = useTranslation(['categorySettings', 'app', 'settingsHub', 'categoryLabels'])
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
 const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
 const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
 const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

 const applyCloudSyncFeedback = (result: CloudMutationResult<unknown>) => {
  if (result.cloudSynced) {
   setError('')
   return
  }

  if (result.queuedForRetry) {
   setError(t('categorySettings:cloudSyncPending'))
   return
  }

  setError(t('categorySettings:cloudSyncFailed'))
 }

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
 setError(t('categorySettings:enterCategoryName'))
 return
 }

 // 使用本地函数添加类别（包含验证逻辑）
 const success = addCustomCategory(trimmed)
 if (success) {
  setError('')
  // 如果有云同步，则同步到云端
  if (categorySync) {
   const allCategories = getAllCategoriesWithDetails()
   const newCategory = allCategories.find(cat => cat.name === trimmed)
   if (newCategory) {
    try {
     const result = await categorySync.createCategory(newCategory)
     applyCloudSyncFeedback(result)
    } catch (error) {
     console.error('Failed to sync new category to cloud:', error)
     setError(t('categorySettings:cloudSyncPending'))
    }
   }
  }

 setNewCategoryName('')
 loadCategories()
 onCategoriesChanged?.()
} else {
 setError(t('categorySettings:failedToAddCategory'))
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
   const result = await categorySync.deleteCategory(categoryId)
   applyCloudSyncFeedback(result)
  } catch (error) {
   console.error('Failed to sync category deletion to cloud:', error)
   setError(t('categorySettings:cloudSyncPending'))
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
 await onUpdateSubscriptions(updatedSubscriptions)
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
   const result = await categorySync.updateCategory(restoredCategory)
   applyCloudSyncFeedback(result)
  } catch (error) {
   console.error('Failed to sync category restoration to cloud:', error)
   setError(t('categorySettings:cloudSyncPending'))
  }
 }

 loadCategories()
 onCategoriesChanged?.()
 }

 const handleRestoreDefaults = () => {
 setRestoreDialogOpen(true)
 }

 const handleConfirmRestore = () => {
 restoreDefaultCategories()
 loadCategories()
 onCategoriesChanged?.()
 setRestoreDialogOpen(false)
 }

 const handleCancelRestore = () => {
 setRestoreDialogOpen(false)
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
 setError('')
 updateCategoriesOrder(newCategories)

 // 如果有云同步，则同步到云端
 if (categorySync) {
  try {
   const result = await categorySync.updateCategoriesOrder(newCategories)
   applyCloudSyncFeedback(result)
  } catch (error) {
   console.error('Failed to sync categories order to cloud:', error)
   setError(t('categorySettings:cloudSyncPending'))
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

  const content = (
    <>
      {isStandalone && (
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold app-theme-text-primary tracking-tight">
              {t('categorySettings:title')}
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6"/>
            </button>
          </div>
        </div>
      )}

      {/* Content */}
 <div className={isStandalone ? "flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4" : "space-y-5"}>
 {/* Add New Category */}
 <div className="settings-card space-y-3">
 <h3 className="text-sm font-semibold app-theme-text-secondary">
 {t('categorySettings:addNewCategory')}
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
 aria-label={t('categorySettings:addNewCategory')}
 placeholder={t('categorySettings:addCategoryPlaceholder')}
 className="settings-input flex-1"
 />
 <button
 onClick={handleAddCategory}
 className="settings-button-primary shrink-0"
 >
 <Plus className="w-4 h-4"/>
 {t('categorySettings:add')}
 </button>
 </div>
 {error && (
 <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
 )}
 </div>

 {/* Controls */}
 <div className="flex flex-wrap gap-3 justify-between items-center">
 <button
 onClick={() => setShowHidden(!showHidden)}
 className="text-sm app-theme-text-secondary hover:underline font-medium transition-colors flex items-center gap-1"
 >
 {showHidden ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
 {showHidden ? t('categorySettings:hideHidden') : t('categorySettings:showHidden')}
 </button>
 <button
 onClick={handleRestoreDefaults}
 className="text-sm app-theme-text-muted hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors flex items-center gap-1"
 >
 <RotateCcw className="w-4 h-4"/>
 {t('categorySettings:restoreDefaults')}
 </button>
 </div>

 {/* Categories List */}
 <div className="space-y-2">
 <h3 className="text-sm font-semibold app-theme-text-secondary">
 {t('categorySettings:categoriesCount', { count: displayedCategories.length })}
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
 data-hidden={category.isHidden || undefined}
 data-drag-over={dragOverIndex === index && draggedIndex !== index || undefined}
 className={`settings-category-row ${draggedIndex === index ? 'opacity-50 cursor-grabbing' : category.isHidden ? 'cursor-default' : 'cursor-grab'}`}
 >
 {/* Drag handle */}
 <div className={`flex items-center justify-center ${
 category.isHidden ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'
 }`}>
 <GripVertical className="w-5 h-5"/>
 </div>

 {/* Category name */}
 <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2 break-words">
 <span className="text-sm app-theme-text-primary">
 {getCategoryDisplayName(category.name, t)}
 </span>
 {category.isBuiltIn && (
 <span className="text-xs px-2 py-0.5 app-theme-chip">
 {t('categorySettings:builtIn')}
 </span>
 )}
 {category.isHidden && (
 <span className="text-xs px-2 py-0.5 app-theme-chip">
 {t('categorySettings:hidden')}
 </span>
 )}
 </div>

 {/* Actions */}
 <div className="flex items-center gap-1">
 {category.isHidden ? (
 <button
 onClick={() => handleRestoreCategory(category)}
 className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors"
 title={t('categorySettings:restoreCategory')}
 >
 <RotateCcw className="w-4 h-4"/>
 </button>
 ) : (
 <button
 onClick={() => handleDeleteCategory(category)}
 disabled={category.name === FALLBACK_CATEGORY}
 className="p-1.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
 title={category.isBuiltIn ? t('categorySettings:hideCategory') : t('categorySettings:deleteCategory')}
 >
 <Trash2 className="w-4 h-4"/>
 </button>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Info */}
 <div className="settings-inset text-xs app-theme-text-muted space-y-1 p-3">
 <p>• {t('categorySettings:infoDrag')}</p>
 <p>• {t('categorySettings:infoBuiltIn')}</p>
 <p>• {t('categorySettings:infoCustom')}</p>
 <p>• {t('categorySettings:infoFallback', { category: getCategoryDisplayName(FALLBACK_CATEGORY, t) })}</p>
 </div>
 </div>

      {isStandalone && (
        <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleClose}
            className="w-full bg-emerald-600 dark:bg-emerald-500 text-white py-2 px-4 rounded-2xl hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors duration-200"
          >
            {t('categorySettings:done')}
          </button>
        </div>
      )}
    </>
  )

  if (!isStandalone) {
    return (
      <div className="settings-page">
        {!isStandalone && (
          <div className="settings-page-heading">
            <h2 className="text-xl font-semibold app-theme-text-primary mb-1">
              {t('categorySettings:title')}
            </h2>
            <p className="text-sm app-theme-text-muted">
              {t('settingsHub:categorySubtitle')}
            </p>
          </div>
        )}
        {content}
        {/* Dialogs need to render outside the main scroll container but they are position fixed so it's fine */}
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
        <RestoreDefaultsDialog
          isOpen={restoreDialogOpen}
          onConfirm={handleConfirmRestore}
          onCancel={handleCancelRestore}
        />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 mobile-modal-viewport bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-2 sm:p-4 z-50 modal-overlay">
      <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-lg max-w-lg w-full max-h-[calc(var(--app-viewport-height,100dvh)*0.9)] overflow-hidden modal-content flex flex-col">
        {content}
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

      {/* Restore Defaults Dialog */}
      <RestoreDefaultsDialog
        isOpen={restoreDialogOpen}
        onConfirm={handleConfirmRestore}
        onCancel={handleCancelRestore}
      />
    </div>
  )
}
