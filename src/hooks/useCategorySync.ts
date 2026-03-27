import { useState, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import {
 Category,
 clearPendingCategorySync,
 loadCategories,
 loadPendingCategorySync,
 saveCategories,
 savePendingCategorySync
} from '../utils/categories'
import { CategoryService } from '../services/categoryService'
import { config } from '../lib/config'
import {
 executeCategorySync,
 executeCategoryUpload,
 finalizeCategoryCloudMutation,
 stageCategorySnapshot
} from '../utils/categorySyncState'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

interface UseCategorySyncReturn {
 syncStatus: SyncStatus
 lastSyncTime: Date | null
 syncCategories: () => Promise<Category[]>
 uploadLocalCategories: (categories: Category[]) => Promise<Category[]>
 createCategory: (category: Category) => Promise<Category>
 updateCategory: (category: Category) => Promise<Category>
 deleteCategory: (categoryId: string) => Promise<void>
 updateCategoriesOrder: (categories: Category[]) => Promise<void>
}

export function useCategorySync(
 user: User | null,
 onCategoriesChange?: (categories: Category[]) => void
): UseCategorySyncReturn {
 const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
 const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
 const activeCloudTaskRef = useRef<Promise<Category[]> | null>(null)
 const statusResetTimeoutRef = useRef<number | null>(null)

 const scheduleStatusReset = useCallback((nextStatus: SyncStatus, delayMs: number) => {
  setSyncStatus(nextStatus)

  if (statusResetTimeoutRef.current) {
   window.clearTimeout(statusResetTimeoutRef.current)
  }

  statusResetTimeoutRef.current = window.setTimeout(() => {
   setSyncStatus('idle')
   statusResetTimeoutRef.current = null
  }, delayMs)
 }, [])

 const runCloudTask = useCallback(async (
  task: () => Promise<Category[]>,
  fallback: () => Category[]
 ): Promise<Category[]> => {
  if (activeCloudTaskRef.current) {
   return activeCloudTaskRef.current
  }

  const activeTask = (async () => {
   setSyncStatus('syncing')

   try {
    const result = await task()
    setLastSyncTime(new Date())
    scheduleStatusReset('success', 3000)
    return result
   } catch (error) {
    console.error('Cloud category task failed:', error)
    scheduleStatusReset('error', 5000)
    return fallback()
   } finally {
    activeCloudTaskRef.current = null
   }
  })()

 activeCloudTaskRef.current = activeTask
 return activeTask
 }, [scheduleStatusReset])

 const persistCategories = useCallback((categories: Category[]) => {
  saveCategories(categories)
  onCategoriesChange?.(categories)
 }, [onCategoriesChange])

 const replaceOrAppendCategory = useCallback((categories: Category[], nextCategory: Category) => {
  const existingIndex = categories.findIndex(category => category.id === nextCategory.id)
  if (existingIndex === -1) {
   return [...categories, nextCategory]
  }

  return categories.map(category =>
   category.id === nextCategory.id ? nextCategory : category
  )
 }, [])

 // 同步类别数据
 const syncCategories = useCallback(async (): Promise<Category[]> => {
  if (!config.features.cloudSync || !user) {
   console.log('Category sync skipped:', { cloudSync: config.features.cloudSync, user: !!user })
   return loadCategories()
  }

  if (activeCloudTaskRef.current) {
   console.log('Category sync joined existing cloud task')
   return activeCloudTaskRef.current
  }

  console.log('Starting category sync for user:', user.email)
  return runCloudTask(async () => {
   return executeCategorySync({
    loadLocalCategories: loadCategories,
    loadPendingSnapshot: loadPendingCategorySync,
    syncCloudCategories: CategoryService.syncCategories,
    reconcilePendingCategories: CategoryService.reconcileCategories,
    persistCategories,
    clearPendingSnapshot: clearPendingCategorySync,
   })
  }, () => loadCategories())
 }, [persistCategories, runCloudTask, user])

 // 上传本地类别到云端（用户首次登录时）
 const uploadLocalCategories = useCallback(async (localCategories: Category[]): Promise<Category[]> => {
  if (!config.features.cloudSync || !user || localCategories.length === 0) {
   return localCategories
  }

  if (activeCloudTaskRef.current) {
   console.log('Category upload joined existing cloud task')
   return activeCloudTaskRef.current
  }

  console.log('Uploading local categories to cloud...')
  return runCloudTask(async () => {
   return executeCategoryUpload(localCategories, {
    loadPendingSnapshot: loadPendingCategorySync,
    reconcilePendingCategories: CategoryService.reconcileCategories,
    persistCategories,
    clearPendingSnapshot: clearPendingCategorySync,
   })
  }, () => localCategories)
 }, [persistCategories, runCloudTask, user])

 // 创建类别（自动同步）
 const createCategory = useCallback(async (category: Category): Promise<Category> => {
 const hadPendingSync = Boolean(loadPendingCategorySync())
 const categories = loadCategories()
 const updatedCategories = stageCategorySnapshot(
  replaceOrAppendCategory(categories, category),
  {
   persistCategories,
   savePendingSnapshot: savePendingCategorySync,
  }
 )

 if (config.features.cloudSync && user) {
  try {
   // 在线模式：直接保存到云端
   const newCategory = await finalizeCategoryCloudMutation({
    hadPendingSnapshot: hadPendingSync,
    executeCloudMutation: () => CategoryService.createCategory(category),
    clearPendingSnapshot: clearPendingCategorySync,
    markSyncSuccess: () => {
     setLastSyncTime(new Date())
    }
   })
   const syncedCategories = replaceOrAppendCategory(updatedCategories, newCategory)
   persistCategories(syncedCategories)
   return newCategory
  } catch (error) {
   console.error('Failed to save category online:', error)
   return category
  }
 }

 return category
 }, [persistCategories, replaceOrAppendCategory, user])

 // 更新类别（自动同步）
 const updateCategory = useCallback(async (category: Category): Promise<Category> => {
 const hadPendingSync = Boolean(loadPendingCategorySync())
 const categories = loadCategories()
 const updatedCategories = stageCategorySnapshot(
  replaceOrAppendCategory(categories, category),
  {
   persistCategories,
   savePendingSnapshot: savePendingCategorySync,
  }
 )

 if (config.features.cloudSync && user) {
  try {
   // 在线模式：同步到云端
   const updatedCategory = await finalizeCategoryCloudMutation({
    hadPendingSnapshot: hadPendingSync,
    executeCloudMutation: () => CategoryService.updateCategory(category),
    clearPendingSnapshot: clearPendingCategorySync,
    markSyncSuccess: () => {
     setLastSyncTime(new Date())
    }
   })
   const syncedCategories = replaceOrAppendCategory(updatedCategories, updatedCategory)
   persistCategories(syncedCategories)
   return updatedCategory
  } catch (error) {
   console.error('Failed to update category online:', error)
   return category
  }
 }

 return category
 }, [persistCategories, replaceOrAppendCategory, user])

 // 删除类别（自动同步）
 const deleteCategory = useCallback(async (categoryId: string): Promise<void> => {
 const hadPendingSync = Boolean(loadPendingCategorySync())
 const categories = loadCategories()
 const category = categories.find(cat => cat.id === categoryId)

 if (!category) {
  return
 }

 const updatedCategories = stageCategorySnapshot(
  category.isBuiltIn
   ? categories.map(cat =>
    cat.id === categoryId ? { ...cat, isHidden: true } : cat
   )
   : categories.filter(cat => cat.id !== categoryId),
  {
   persistCategories,
   savePendingSnapshot: savePendingCategorySync,
  }
 )

 if (config.features.cloudSync && user) {
  try {
   // 在线模式：从云端删除
   await finalizeCategoryCloudMutation({
    hadPendingSnapshot: hadPendingSync,
    executeCloudMutation: () => CategoryService.deleteCategory(categoryId),
    clearPendingSnapshot: clearPendingCategorySync,
    markSyncSuccess: () => {
     setLastSyncTime(new Date())
    }
   })
  } catch (error) {
   console.error('Failed to delete category online:', error)
  }
 }
 }, [persistCategories, user])

 // 更新类别顺序（拖拽排序）
 const updateCategoriesOrder = useCallback(async (categories: Category[]): Promise<void> => {
 // 更新 order 字段
 const reorderedCategories = categories.map((cat, index) => ({
 ...cat,
 order: index
 }))

 const hadPendingSync = Boolean(loadPendingCategorySync())
 stageCategorySnapshot(reorderedCategories, {
  persistCategories,
  savePendingSnapshot: savePendingCategorySync,
 })

 if (config.features.cloudSync && user) {
 try {
 // 在线模式：同步到云端
 await finalizeCategoryCloudMutation({
 hadPendingSnapshot: hadPendingSync,
 executeCloudMutation: () => CategoryService.updateCategoriesOrder(reorderedCategories),
 clearPendingSnapshot: clearPendingCategorySync,
 markSyncSuccess: () => {
 setLastSyncTime(new Date())
 }
 })
 } catch (error) {
 console.error('Failed to update categories order online:', error)
 }
 }
 }, [persistCategories, user])

 return {
 syncStatus,
 lastSyncTime,
 syncCategories,
 uploadLocalCategories,
 createCategory,
 updateCategory,
 deleteCategory,
 updateCategoriesOrder
 }
}
