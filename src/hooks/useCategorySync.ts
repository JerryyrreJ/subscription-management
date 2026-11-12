import { useState, useCallback, useRef, useLayoutEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { CloudMutationResult } from '../types'
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
import {
 claimLocalDataOwnership,
 refreshLocalDataOwnership,
 resolveCurrentLocalDataScope
} from '../utils/localDataOwnership'
import { DataScope, GUEST_DATA_SCOPE, getUserDataScope } from '../utils/dataScope'
import { loadLocalDataOwner } from '../utils/storage'
import { createScopedTaskGate } from '../utils/scopedTaskGate'
import { useAccountTaskGuard } from './useAccountTaskGuard'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

interface UseCategorySyncReturn {
 syncStatus: SyncStatus
 lastSyncTime: Date | null
 syncCategories: () => Promise<Category[]>
 uploadLocalCategories: (categories: Category[]) => Promise<Category[]>
 createCategory: (category: Category) => Promise<CloudMutationResult<Category>>
 updateCategory: (category: Category) => Promise<CloudMutationResult<Category>>
 deleteCategory: (categoryId: string) => Promise<CloudMutationResult<void>>
 updateCategoriesOrder: (categories: Category[]) => Promise<CloudMutationResult<Category[]>>
}

const categoryCloudTaskGate = createScopedTaskGate<DataScope>()

interface CategoryCloudTask {
 owner: () => boolean
 kind: 'sync' | 'upload'
 promise: Promise<Category[]>
}

export function useCategorySync(
 user: User | null,
 onCategoriesChange?: (categories: Category[]) => void
): UseCategorySyncReturn {
 const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
 const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
 const activeCloudTaskRef = useRef<CategoryCloudTask | null>(null)
 const statusResetTimeoutRef = useRef<number | null>(null)
 const isCurrentAccount = useAccountTaskGuard(user?.id)

 useLayoutEffect(() => {
  setSyncStatus('idle')
  setLastSyncTime(null)
  return () => {
   if (statusResetTimeoutRef.current !== null) {
    window.clearTimeout(statusResetTimeoutRef.current)
   }
  }
 }, [isCurrentAccount])

 const scheduleStatusReset = useCallback((nextStatus: SyncStatus, delayMs: number) => {
  if (!isCurrentAccount()) return
  setSyncStatus(nextStatus)

  if (statusResetTimeoutRef.current !== null) {
   window.clearTimeout(statusResetTimeoutRef.current)
  }

  statusResetTimeoutRef.current = window.setTimeout(() => {
   if (isCurrentAccount()) {
    setSyncStatus('idle')
   }
   statusResetTimeoutRef.current = null
  }, delayMs)
 }, [isCurrentAccount])

 const persistCategoriesForScope = useCallback((scope: DataScope, categories: Category[]) => {
  saveCategories(categories, scope)
  if (!isCurrentAccount()) return
  onCategoriesChange?.(categories)
 }, [isCurrentAccount, onCategoriesChange])

 const runCloudTask = useCallback(async (
  scope: DataScope,
  kind: CategoryCloudTask['kind'],
  task: (isCurrent: () => boolean) => Promise<Category[]>,
  fallback: () => Category[]
 ): Promise<Category[]> => {
  let existing = activeCloudTaskRef.current
  while (existing?.owner === isCurrentAccount) {
   if (kind === 'sync') {
    return existing.promise
   }
   await existing.promise
   existing = activeCloudTaskRef.current
  }
  if (!isCurrentAccount()) {
   return fallback()
  }

  const token = categoryCloudTaskGate.claim(scope)
  const isCurrent = () => isCurrentAccount() && categoryCloudTaskGate.isCurrent(scope, token)

  const activeTask: CategoryCloudTask = {
   owner: isCurrentAccount,
   kind,
   promise: Promise.resolve().then(async () => {
    try {
     if (!isCurrent()) {
      return fallback()
     }
     setSyncStatus('syncing')
     const result = await task(isCurrent)
     if (!isCurrent()) {
      return loadCategories(scope)
     }
     setLastSyncTime(new Date())
     scheduleStatusReset('success', 3000)
     return result
    } catch (error) {
     console.error('Cloud category task failed:', error)
     if (isCurrent()) {
      scheduleStatusReset('error', 5000)
     }
     return fallback()
    } finally {
     categoryCloudTaskGate.release(scope, token)
     if (activeCloudTaskRef.current === activeTask) {
      activeCloudTaskRef.current = null
     }
    }
   })
  }

  activeCloudTaskRef.current = activeTask
  return activeTask.promise
 }, [isCurrentAccount, scheduleStatusReset])

 const resolveScope = useCallback(() => (
  resolveCurrentLocalDataScope(user?.id)
 ), [user])

 const refreshOwnedGuestData = useCallback((wasAuthenticated: boolean) => {
  if (wasAuthenticated) {
   return
  }

  const owner = loadLocalDataOwner(GUEST_DATA_SCOPE)
  if (owner) {
   refreshLocalDataOwnership(owner.userId, GUEST_DATA_SCOPE)
  }
 }, [])

 const replaceOrAppendCategory = useCallback((categories: Category[], nextCategory: Category) => {
  const existingIndex = categories.findIndex(category => category.id === nextCategory.id)
  if (existingIndex === -1) {
   return [...categories, nextCategory]
  }

  return categories.map(category =>
   category.id === nextCategory.id ? nextCategory : category
  )
 }, [])

 const buildCloudMutationResult = useCallback(<T,>(
  data: T,
  cloudSynced: boolean,
  queuedForRetry: boolean
 ): CloudMutationResult<T> => ({
  data,
  cloudSynced,
  queuedForRetry
 }), [])

 // 同步类别数据
 const syncCategories = useCallback(async (): Promise<Category[]> => {
  const scope = user ? getUserDataScope(user.id) : resolveScope()

  if (!config.features.cloudSync || !user) {
   console.log('Category sync skipped:', { cloudSync: config.features.cloudSync, user: !!user })
   return loadCategories(scope)
  }

  const targetUserId = user.id
  console.log('Starting category sync for user:', user.email)
  return runCloudTask(scope, 'sync', async (isCurrent) => {
   return executeCategorySync({
    loadLocalCategories: () => loadCategories(scope),
    loadPendingSnapshot: () => loadPendingCategorySync(scope),
    syncCloudCategories: localCategories => CategoryService.syncCategories(localCategories, targetUserId),
    reconcilePendingCategories: pendingCategories => CategoryService.reconcileCategories(pendingCategories, targetUserId),
    persistCategories: categories => {
     if (!isCurrent()) return
     persistCategoriesForScope(scope, categories)
    },
    clearPendingSnapshot: () => {
     if (!isCurrent()) return
     clearPendingCategorySync(scope)
    },
   })
  }, () => loadCategories(scope))
 }, [persistCategoriesForScope, resolveScope, runCloudTask, user])

 // 上传本地类别到云端（用户首次登录时）
 const uploadLocalCategories = useCallback(async (localCategories: Category[]): Promise<Category[]> => {
  if (!config.features.cloudSync || !user || localCategories.length === 0) {
   return localCategories
  }

  const targetUserId = user.id
  const scope = getUserDataScope(targetUserId)

  console.log('Uploading local categories to cloud...')
  return runCloudTask(scope, 'upload', async (isCurrent) => {
   return executeCategoryUpload(localCategories, {
    loadPendingSnapshot: () => loadPendingCategorySync(scope),
    reconcilePendingCategories: pendingCategories => CategoryService.reconcileCategories(pendingCategories, targetUserId),
    persistCategories: categories => {
     if (!isCurrent()) return
     persistCategoriesForScope(scope, categories)
    },
    clearPendingSnapshot: () => {
     if (!isCurrent()) return
     clearPendingCategorySync(scope)
    },
   })
  }, () => localCategories)
 }, [persistCategoriesForScope, runCloudTask, user])

 // 创建类别（自动同步）
 const createCategory = useCallback(async (category: Category): Promise<CloudMutationResult<Category>> => {
  const scope = resolveScope()
  const targetUserId = user?.id
  const hadPendingSync = Boolean(loadPendingCategorySync(scope))
  const categories = loadCategories(scope)
  stageCategorySnapshot(
   replaceOrAppendCategory(categories, category),
   {
    persistCategories: next => persistCategoriesForScope(scope, next),
    savePendingSnapshot: next => savePendingCategorySync(next, scope),
   }
  )

  if (config.features.cloudSync && targetUserId) {
   try {
    const newCategory = await finalizeCategoryCloudMutation({
     hadPendingSnapshot: hadPendingSync,
     executeCloudMutation: () => CategoryService.createCategory(category, targetUserId),
     clearPendingSnapshot: () => clearPendingCategorySync(scope),
     markSyncSuccess: () => {
      if (isCurrentAccount()) {
       setLastSyncTime(new Date())
      }
      claimLocalDataOwnership(targetUserId, getUserDataScope(targetUserId))
     }
    })
    const syncedCategories = replaceOrAppendCategory(loadCategories(scope), newCategory)
    persistCategoriesForScope(scope, syncedCategories)
    return buildCloudMutationResult(newCategory, true, hadPendingSync)
   } catch (error) {
    console.error('Failed to save category online:', error)
    scheduleStatusReset('error', 5000)
    return buildCloudMutationResult(category, false, true)
   }
  }

  refreshOwnedGuestData(Boolean(targetUserId))
  return buildCloudMutationResult(category, true, false)
 }, [buildCloudMutationResult, isCurrentAccount, persistCategoriesForScope, refreshOwnedGuestData, replaceOrAppendCategory, resolveScope, scheduleStatusReset, user])

 // 更新类别（自动同步）
 const updateCategory = useCallback(async (category: Category): Promise<CloudMutationResult<Category>> => {
  const scope = resolveScope()
  const targetUserId = user?.id
  const hadPendingSync = Boolean(loadPendingCategorySync(scope))
  const categories = loadCategories(scope)
  stageCategorySnapshot(
   replaceOrAppendCategory(categories, category),
   {
    persistCategories: next => persistCategoriesForScope(scope, next),
    savePendingSnapshot: next => savePendingCategorySync(next, scope),
   }
  )

  if (config.features.cloudSync && targetUserId) {
   try {
    const updatedCategory = await finalizeCategoryCloudMutation({
     hadPendingSnapshot: hadPendingSync,
     executeCloudMutation: () => CategoryService.updateCategory(category, targetUserId),
     clearPendingSnapshot: () => clearPendingCategorySync(scope),
     markSyncSuccess: () => {
      if (isCurrentAccount()) {
       setLastSyncTime(new Date())
      }
      claimLocalDataOwnership(targetUserId, getUserDataScope(targetUserId))
     }
    })
    const syncedCategories = replaceOrAppendCategory(loadCategories(scope), updatedCategory)
    persistCategoriesForScope(scope, syncedCategories)
    return buildCloudMutationResult(updatedCategory, true, hadPendingSync)
   } catch (error) {
    console.error('Failed to update category online:', error)
    scheduleStatusReset('error', 5000)
    return buildCloudMutationResult(category, false, true)
   }
  }

  refreshOwnedGuestData(Boolean(targetUserId))
  return buildCloudMutationResult(category, true, false)
 }, [buildCloudMutationResult, isCurrentAccount, persistCategoriesForScope, refreshOwnedGuestData, replaceOrAppendCategory, resolveScope, scheduleStatusReset, user])

 // 删除类别（自动同步）
 const deleteCategory = useCallback(async (categoryId: string): Promise<CloudMutationResult<void>> => {
  const scope = resolveScope()
  const targetUserId = user?.id
  const hadPendingSync = Boolean(loadPendingCategorySync(scope))
  const categories = loadCategories(scope)
  const category = categories.find(cat => cat.id === categoryId)

  if (!category) {
   return buildCloudMutationResult(undefined, true, false)
  }

  stageCategorySnapshot(
   category.isBuiltIn
    ? categories.map(cat =>
     cat.id === categoryId ? { ...cat, isHidden: true } : cat
    )
    : categories.filter(cat => cat.id !== categoryId),
   {
    persistCategories: next => persistCategoriesForScope(scope, next),
    savePendingSnapshot: next => savePendingCategorySync(next, scope),
   }
  )

  if (config.features.cloudSync && targetUserId) {
   try {
    await finalizeCategoryCloudMutation({
     hadPendingSnapshot: hadPendingSync,
     executeCloudMutation: () => CategoryService.deleteCategory(categoryId, targetUserId),
     clearPendingSnapshot: () => clearPendingCategorySync(scope),
     markSyncSuccess: () => {
      if (isCurrentAccount()) {
       setLastSyncTime(new Date())
      }
      claimLocalDataOwnership(targetUserId, getUserDataScope(targetUserId))
     }
    })
    return buildCloudMutationResult(undefined, true, hadPendingSync)
   } catch (error) {
    console.error('Failed to delete category online:', error)
    scheduleStatusReset('error', 5000)
    return buildCloudMutationResult(undefined, false, true)
   }
  }

  refreshOwnedGuestData(Boolean(targetUserId))
  return buildCloudMutationResult(undefined, true, false)
 }, [buildCloudMutationResult, isCurrentAccount, persistCategoriesForScope, refreshOwnedGuestData, resolveScope, scheduleStatusReset, user])

 // 更新类别顺序（拖拽排序）
 const updateCategoriesOrder = useCallback(async (categories: Category[]): Promise<CloudMutationResult<Category[]>> => {
  const scope = resolveScope()
  const targetUserId = user?.id
  const reorderedCategories = categories.map((cat, index) => ({
   ...cat,
   order: index
  }))

  const hadPendingSync = Boolean(loadPendingCategorySync(scope))
  stageCategorySnapshot(reorderedCategories, {
   persistCategories: next => persistCategoriesForScope(scope, next),
   savePendingSnapshot: next => savePendingCategorySync(next, scope),
  })

  if (config.features.cloudSync && targetUserId) {
   try {
    await finalizeCategoryCloudMutation({
     hadPendingSnapshot: hadPendingSync,
     executeCloudMutation: () => CategoryService.updateCategoriesOrder(reorderedCategories, targetUserId),
     clearPendingSnapshot: () => clearPendingCategorySync(scope),
     markSyncSuccess: () => {
      if (isCurrentAccount()) {
       setLastSyncTime(new Date())
      }
      claimLocalDataOwnership(targetUserId, getUserDataScope(targetUserId))
     }
    })
    return buildCloudMutationResult(reorderedCategories, true, hadPendingSync)
   } catch (error) {
    console.error('Failed to update categories order online:', error)
    scheduleStatusReset('error', 5000)
    return buildCloudMutationResult(reorderedCategories, false, true)
   }
  }

  refreshOwnedGuestData(Boolean(targetUserId))
  return buildCloudMutationResult(reorderedCategories, true, false)
 }, [buildCloudMutationResult, isCurrentAccount, persistCategoriesForScope, refreshOwnedGuestData, resolveScope, scheduleStatusReset, user])

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
