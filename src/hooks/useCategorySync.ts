import { useState, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { Category, loadCategories, saveCategories } from '../utils/categories'
import { CategoryService } from '../services/categoryService'
import { config } from '../lib/config'

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
  const isSyncingRef = useRef(false)
  const isUploadingRef = useRef(false)

  // 同步类别数据
  const syncCategories = useCallback(async (): Promise<Category[]> => {
    if (!config.features.cloudSync || !user || isSyncingRef.current) {
      console.log('Category sync skipped:', { cloudSync: config.features.cloudSync, user: !!user, isSyncing: isSyncingRef.current })
      return loadCategories()
    }

    console.log('Starting category sync for user:', user.email)
    isSyncingRef.current = true
    setSyncStatus('syncing')

    try {
      const currentCategories = loadCategories()
      const syncedCategories = await CategoryService.syncCategories(currentCategories)
      saveCategories(syncedCategories)
      onCategoriesChange?.(syncedCategories)
      setSyncStatus('success')
      setLastSyncTime(new Date())

      // 立即重置同步标志，然后延迟重置状态
      isSyncingRef.current = false

      // 3秒后重置状态
      setTimeout(() => {
        setSyncStatus('idle')
      }, 3000)

      return syncedCategories
    } catch (error) {
      console.error('Category sync failed:', error)
      setSyncStatus('error')

      // 立即重置同步标志，然后延迟重置状态
      isSyncingRef.current = false

      // 5秒后重置状态
      setTimeout(() => {
        setSyncStatus('idle')
      }, 5000)

      return loadCategories()
    }
  }, [user, onCategoriesChange])

  // 上传本地类别到云端（用户首次登录时）
  const uploadLocalCategories = useCallback(async (localCategories: Category[]): Promise<Category[]> => {
    if (!config.features.cloudSync || !user || localCategories.length === 0 || isUploadingRef.current) {
      return localCategories
    }

    isUploadingRef.current = true
    setSyncStatus('syncing')

    try {
      console.log('Uploading local categories to cloud...')
      const cloudCategories = await CategoryService.uploadLocalCategories(localCategories)
      saveCategories(cloudCategories)
      onCategoriesChange?.(cloudCategories)
      setSyncStatus('success')
      setLastSyncTime(new Date())

      // 立即重置上传标志，然后延迟重置状态
      isUploadingRef.current = false

      setTimeout(() => {
        setSyncStatus('idle')
      }, 3000)

      return cloudCategories
    } catch (error) {
      console.error('Category upload failed:', error)
      setSyncStatus('error')

      // 立即重置上传标志，然后延迟重置状态
      isUploadingRef.current = false

      setTimeout(() => {
        setSyncStatus('idle')
      }, 5000)

      return localCategories
    }
  }, [user, onCategoriesChange])

  // 创建类别（自动同步）
  const createCategory = useCallback(async (category: Category): Promise<Category> => {
    if (config.features.cloudSync && user) {
      try {
        // 在线模式：直接保存到云端
        const newCategory = await CategoryService.createCategory(category)
        const categories = loadCategories()
        const updated = [...categories, newCategory]
        saveCategories(updated)
        onCategoriesChange?.(updated)
        setLastSyncTime(new Date())
        return newCategory
      } catch (error) {
        console.error('Failed to save category online:', error)
        // 降级到离线模式
        const categories = loadCategories()
        const updated = [...categories, category]
        saveCategories(updated)
        onCategoriesChange?.(updated)
        return category
      }
    } else {
      // 离线模式：只保存到本地
      const categories = loadCategories()
      const updated = [...categories, category]
      saveCategories(updated)
      onCategoriesChange?.(updated)
      return category
    }
  }, [user, onCategoriesChange])

  // 更新类别（自动同步）
  const updateCategory = useCallback(async (category: Category): Promise<Category> => {
    if (config.features.cloudSync && user) {
      try {
        // 在线模式：同步到云端
        const updatedCategory = await CategoryService.updateCategory(category)
        const categories = loadCategories()
        const updated = categories.map(cat =>
          cat.id === updatedCategory.id ? updatedCategory : cat
        )
        saveCategories(updated)
        onCategoriesChange?.(updated)
        setLastSyncTime(new Date())
        return updatedCategory
      } catch (error) {
        console.error('Failed to update category online:', error)
        // 降级到离线模式
        const categories = loadCategories()
        const updated = categories.map(cat =>
          cat.id === category.id ? category : cat
        )
        saveCategories(updated)
        onCategoriesChange?.(updated)
        return category
      }
    } else {
      // 离线模式：只更新本地
      const categories = loadCategories()
      const updated = categories.map(cat =>
        cat.id === category.id ? category : cat
      )
      saveCategories(updated)
      onCategoriesChange?.(updated)
      return category
    }
  }, [user, onCategoriesChange])

  // 删除类别（自动同步）
  const deleteCategory = useCallback(async (categoryId: string): Promise<void> => {
    if (config.features.cloudSync && user) {
      try {
        // 在线模式：从云端删除
        await CategoryService.deleteCategory(categoryId)
        const categories = loadCategories()
        const category = categories.find(cat => cat.id === categoryId)

        if (category?.isBuiltIn) {
          // 内置类别：软删除
          const updated = categories.map(cat =>
            cat.id === categoryId ? { ...cat, isHidden: true } : cat
          )
          saveCategories(updated)
          onCategoriesChange?.(updated)
        } else {
          // 自定义类别：彻底删除
          const updated = categories.filter(cat => cat.id !== categoryId)
          saveCategories(updated)
          onCategoriesChange?.(updated)
        }

        setLastSyncTime(new Date())
      } catch (error) {
        console.error('Failed to delete category online:', error)
        // 降级到离线模式
        const categories = loadCategories()
        const category = categories.find(cat => cat.id === categoryId)

        if (category?.isBuiltIn) {
          const updated = categories.map(cat =>
            cat.id === categoryId ? { ...cat, isHidden: true } : cat
          )
          saveCategories(updated)
          onCategoriesChange?.(updated)
        } else {
          const updated = categories.filter(cat => cat.id !== categoryId)
          saveCategories(updated)
          onCategoriesChange?.(updated)
        }
      }
    } else {
      // 离线模式：只从本地删除
      const categories = loadCategories()
      const category = categories.find(cat => cat.id === categoryId)

      if (category?.isBuiltIn) {
        const updated = categories.map(cat =>
          cat.id === categoryId ? { ...cat, isHidden: true } : cat
        )
        saveCategories(updated)
        onCategoriesChange?.(updated)
      } else {
        const updated = categories.filter(cat => cat.id !== categoryId)
        saveCategories(updated)
        onCategoriesChange?.(updated)
      }
    }
  }, [user, onCategoriesChange])

  // 更新类别顺序（拖拽排序）
  const updateCategoriesOrder = useCallback(async (categories: Category[]): Promise<void> => {
    // 更新 order 字段
    const reorderedCategories = categories.map((cat, index) => ({
      ...cat,
      order: index
    }))

    if (config.features.cloudSync && user) {
      try {
        // 在线模式：同步到云端
        await CategoryService.updateCategoriesOrder(reorderedCategories)
        saveCategories(reorderedCategories)
        onCategoriesChange?.(reorderedCategories)
        setLastSyncTime(new Date())
      } catch (error) {
        console.error('Failed to update categories order online:', error)
        // 降级到离线模式
        saveCategories(reorderedCategories)
        onCategoriesChange?.(reorderedCategories)
      }
    } else {
      // 离线模式：只更新本地
      saveCategories(reorderedCategories)
      onCategoriesChange?.(reorderedCategories)
    }
  }, [user, onCategoriesChange])

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
