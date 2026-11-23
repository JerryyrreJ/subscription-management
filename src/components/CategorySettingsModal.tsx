import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useState, useEffect } from 'react'
import { X, Trash2, GripVertical, Plus, RotateCcw, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CloudMutationResult } from '../types'
import {
 Category,
 CategoryValidationErrorCode,
 addOrRestoreCustomCategory,
 getAllCategoriesWithDetails,
 updateCategoriesOrder,
 deleteCategory,
 restoreCategory,
 restoreDefaultCategories,
 reorderCategoriesById,
 moveVisibleCategory,
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
 restoreDefaultCategories?: () => Promise<CloudMutationResult<Category[]>>
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
 const [draggedId, setDraggedId] = useState<string | null>(null)
 const [dragOverId, setDragOverId] = useState<string | null>(null)

 const resolveValidationError = (errorCode?: CategoryValidationErrorCode) => {
  switch (errorCode) {
   case 'required':
    return t('categorySettings:enterCategoryName')
   case 'tooLong':
    return t('categorySettings:categoryTooLong')
   case 'invalidCharacters':
    return t('categorySettings:categoryInvalidCharacters')
   case 'duplicate':
    return t('categorySettings:categoryAlreadyExists')
   case 'reserved':
    return t('categorySettings:categoryReserved', { category: getCategoryDisplayName(FALLBACK_CATEGORY, t) })
   default:
    return t('categorySettings:failedToAddCategory')
  }
 }

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

 // 使用本地函数添加或恢复隐藏的内置类别（包含完整验证逻辑）
 const addResult = addOrRestoreCustomCategory(trimmed)
 if (addResult.success && addResult.category) {
  setError('')
  // 如果有云同步，则同步到云端（恢复内置分类走 update，新建走 create）
  if (categorySync) {
   try {
    const syncResult = addResult.action === 'restored'
     ? await categorySync.updateCategory(addResult.category)
     : await categorySync.createCategory(addResult.category)
    applyCloudSyncFeedback(syncResult)
   } catch (error) {
    console.error('Failed to sync new category to cloud:', error)
    setError(t('categorySettings:cloudSyncPending'))
   }
  }

  setNewCategoryName('')
  loadCategories()
  onCategoriesChanged?.()
 } else {
  setError(resolveValidationError(addResult.errorCode))
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

 const handleConfirmRestore = async () => {
 setRestoreDialogOpen(false)
 if (categorySync?.restoreDefaultCategories) {
  try {
   const result = await categorySync.restoreDefaultCategories()
   applyCloudSyncFeedback(result)
  } catch (error) {
   console.error('Failed to sync restored default categories to cloud:', error)
   setError(t('categorySettings:cloudSyncPending'))
  }
 } else {
  restoreDefaultCategories()
 }
 loadCategories()
 onCategoriesChanged?.()
 }

 const handleCancelRestore = () => {
 setRestoreDialogOpen(false)
 }

 const commitCategoriesOrder = async (nextCategories: Category[]) => {
  setCategories(nextCategories)
  setError('')
  updateCategoriesOrder(nextCategories)

  if (categorySync) {
   try {
    const result = await categorySync.updateCategoriesOrder(nextCategories)
    applyCloudSyncFeedback(result)
   } catch (error) {
    console.error('Failed to sync categories order to cloud:', error)
    setError(t('categorySettings:cloudSyncPending'))
   }
  }

  onCategoriesChanged?.()
 }

 // 拖拽处理函数（按分类 ID 定位，避免隐藏项过滤导致的下标错位）
 const handleDragStart = (categoryId: string) => {
 setDraggedId(categoryId)
 }

 const handleDragOver = (e: React.DragEvent, categoryId: string) => {
 e.preventDefault()
 setDragOverId(categoryId)
 }

 const handleDragLeave = () => {
 setDragOverId(null)
 }

 const handleDrop = async (e: React.DragEvent, targetId: string) => {
 e.preventDefault()

 if (!draggedId || draggedId === targetId) {
 setDraggedId(null)
 setDragOverId(null)
 return
 }

 const newCategories = reorderCategoriesById(categories, draggedId, targetId)
 setDraggedId(null)
 setDragOverId(null)
 if (newCategories === categories) {
  return
 }

 await commitCategoriesOrder(newCategories)
 }

 const handleDragEnd = () => {
 setDraggedId(null)
 setDragOverId(null)
 }

 const handleMoveCategory = async (categoryId: string, direction: 'up' | 'down') => {
  const newCategories = moveVisibleCategory(categories, categoryId, direction, showHidden)
  if (newCategories === categories) {
   return
  }
  await commitCategoriesOrder(newCategories)
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
              type="button"
              onClick={handleClose}
              aria-label={t('app:cancel')}
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
 onKeyDown={(e) => {
 if (e.key === 'Enter') {
 e.preventDefault()
 void handleAddCategory()
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
 onDragStart={() => handleDragStart(category.id)}
 onDragOver={(e) => handleDragOver(e, category.id)}
 onDragLeave={handleDragLeave}
 onDrop={(e) => void handleDrop(e, category.id)}
 onDragEnd={handleDragEnd}
 data-hidden={category.isHidden || undefined}
 data-drag-over={dragOverId === category.id && draggedId !== category.id || undefined}
 className={`settings-category-row ${draggedId === category.id ? 'opacity-50 cursor-grabbing' : category.isHidden ? 'cursor-default' : 'cursor-grab'}`}
 >
 {/* Drag handle */}
 <div className={`flex items-center justify-center ${
 category.isHidden ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'
 }`} aria-hidden="true">
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
 {!category.isHidden && (
 <>
 <button
 type="button"
 onClick={() => void handleMoveCategory(category.id, 'up')}
 disabled={index === 0}
 className="p-1.5 app-theme-text-muted hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
 aria-label={t('categorySettings:moveUp')}
 title={t('categorySettings:moveUp')}
 >
 <ChevronUp className="w-4 h-4"/>
 </button>
 <button
 type="button"
 onClick={() => void handleMoveCategory(category.id, 'down')}
 disabled={index === displayedCategories.length - 1}
 className="p-1.5 app-theme-text-muted hover:text-gray-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
 aria-label={t('categorySettings:moveDown')}
 title={t('categorySettings:moveDown')}
 >
 <ChevronDown className="w-4 h-4"/>
 </button>
 </>
 )}
 {category.isHidden ? (
 <button
 type="button"
 onClick={() => void handleRestoreCategory(category)}
 className="p-1.5 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors"
 aria-label={t('categorySettings:restoreCategory')}
 title={t('categorySettings:restoreCategory')}
 >
 <RotateCcw className="w-4 h-4"/>
 </button>
 ) : (
 <button
 type="button"
 onClick={() => handleDeleteCategory(category)}
 disabled={category.name === FALLBACK_CATEGORY}
 className="p-1.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
 aria-label={category.isBuiltIn ? t('categorySettings:hideCategory') : t('categorySettings:deleteCategory')}
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
