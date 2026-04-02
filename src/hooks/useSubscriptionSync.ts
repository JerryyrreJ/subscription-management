import { Dispatch, SetStateAction, useState, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { PendingSyncOperation, Subscription } from '../types'
import { SubscriptionService } from '../services/subscriptionService'
import {
 clearPendingSyncOperations,
 enqueuePendingSyncOperation,
 loadPendingSyncOperations,
 loadSubscriptions,
 savePendingSyncOperations,
 saveSubscriptions
} from '../utils/storage'
import { config } from '../lib/config'
import { buildPendingCreateOperations, normalizeSubscription } from '../utils/subscriptionSync'
import { DataScope, GUEST_DATA_SCOPE, getUserDataScope } from '../utils/dataScope'
import { createScopedTaskGate } from '../utils/scopedTaskGate'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

interface UseSyncReturn {
 syncStatus: SyncStatus
 lastSyncTime: Date | null
 syncSubscriptions: () => Promise<Subscription[]>
 uploadLocalData: (subscriptions: Subscription[]) => Promise<Subscription[]>
 createSubscription: (subscription: Subscription | Omit<Subscription, 'id'>) => Promise<Subscription>
 updateSubscription: (subscription: Subscription) => Promise<Subscription>
 updateSubscriptionsBatch: (subscriptions: Subscription[]) => Promise<Subscription[]>
 deleteSubscription: (id: string) => Promise<void>
}

const subscriptionCloudTaskGate = createScopedTaskGate<DataScope>()

const resolveUserScope = (user: User | null): DataScope =>
 user ? getUserDataScope(user.id) : GUEST_DATA_SCOPE

export function useSubscriptionSync(
 user: User | null,
 setSubscriptions: Dispatch<SetStateAction<Subscription[]>>
): UseSyncReturn {
 const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
 const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
 const activeCloudTaskRef = useRef<Promise<Subscription[]> | null>(null)
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
  task: () => Promise<Subscription[]>,
  fallback: () => Subscription[]
 ): Promise<Subscription[]> => {
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
    console.error('Cloud subscription task failed:', error)
    scheduleStatusReset('error', 5000)
    return fallback()
   } finally {
    activeCloudTaskRef.current = null
   }
  })()

  activeCloudTaskRef.current = activeTask
  return activeTask
 }, [scheduleStatusReset])

 const queueOperation = useCallback((operation: Omit<PendingSyncOperation, 'id'>): PendingSyncOperation[] => {
 const scope = resolveUserScope(user)
 const pendingOperation: PendingSyncOperation = {
 id: crypto.randomUUID(),
 ...operation
 }

 return enqueuePendingSyncOperation(pendingOperation, scope)
 }, [user])

 const removeQueuedOperations = useCallback((subscriptionId: string) => {
 const scope = resolveUserScope(user)
 const remainingOperations = loadPendingSyncOperations(scope).filter(
 operation => operation.subscriptionId !== subscriptionId
 )
 savePendingSyncOperations(remainingOperations, scope)
 }, [user])

 // 同步订阅数据
 const syncSubscriptions = useCallback(async (): Promise<Subscription[]> => {
  const scope = resolveUserScope(user)

  if (!config.features.cloudSync || !user) {
   console.log('Sync skipped:', { cloudSync: config.features.cloudSync, user: !!user })
   return loadSubscriptions(scope)
  }

  if (activeCloudTaskRef.current) {
   console.log('Sync joined existing cloud task')
   return activeCloudTaskRef.current
  }

  console.log('Starting sync for user:', user.email)
  const taskToken = subscriptionCloudTaskGate.claim(scope)
  return runCloudTask(async () => {
   const currentSubscriptions = loadSubscriptions(scope)
   const pendingOperations = loadPendingSyncOperations(scope)
   const syncResult = await SubscriptionService.syncSubscriptions(
    currentSubscriptions,
    pendingOperations
   )

   if (!subscriptionCloudTaskGate.isCurrent(scope, taskToken)) {
    return loadSubscriptions(scope)
   }

   setSubscriptions(syncResult.subscriptions)
   saveSubscriptions(syncResult.subscriptions, scope)
   savePendingSyncOperations(syncResult.pendingOperations, scope)

   return syncResult.subscriptions
  }, () => loadSubscriptions(scope))
 }, [runCloudTask, user, setSubscriptions])

 // 上传本地数据到云端（用户首次登录时）
 const uploadLocalData = useCallback(async (localSubscriptions: Subscription[]): Promise<Subscription[]> => {
  const scope = resolveUserScope(user)

  if (!config.features.cloudSync || !user || localSubscriptions.length === 0) {
   return localSubscriptions
  }

  if (activeCloudTaskRef.current) {
   console.log('Upload joined existing cloud task')
   return activeCloudTaskRef.current
  }

 console.log('Uploading local data to cloud...')
 const taskToken = subscriptionCloudTaskGate.claim(scope)
 return runCloudTask(async () => {
   const uploadResult = await SubscriptionService.uploadLocalSubscriptions(localSubscriptions)
   const pendingOperations = buildPendingCreateOperations(uploadResult.failedSubscriptions)

   if (!subscriptionCloudTaskGate.isCurrent(scope, taskToken)) {
    return loadSubscriptions(scope)
   }

   setSubscriptions(uploadResult.subscriptions)
   saveSubscriptions(uploadResult.subscriptions, scope)

   if (pendingOperations.length > 0) {
    savePendingSyncOperations(pendingOperations, scope)
   } else {
    clearPendingSyncOperations(scope)
   }

   return uploadResult.subscriptions
  }, () => localSubscriptions)
 }, [runCloudTask, user, setSubscriptions])

 // 创建订阅（自动同步）
 const createSubscription = useCallback(async (subscription: Subscription | Omit<Subscription, 'id'>): Promise<Subscription> => {
 const scope = resolveUserScope(user)
 const normalizedSubscription = normalizeSubscription({
 ...subscription,
 id: 'id' in subscription ? subscription.id : crypto.randomUUID(),
 createdAt: subscription.createdAt || new Date().toISOString(),
 updatedAt: new Date().toISOString()
 })

 if (config.features.cloudSync && user) {
 try {
 // 在线模式：直接保存到云端
 const newSubscription = await SubscriptionService.createSubscription(normalizedSubscription)
 // 使用函数式更新，避免依赖陈旧的 subscriptions 状态
 setSubscriptions(prev => {
 const updated = [...prev, newSubscription]
 saveSubscriptions(updated, scope)
 return updated
 })
 removeQueuedOperations(newSubscription.id)
 setLastSyncTime(new Date())
 return newSubscription
 } catch (error) {
 console.error('Failed to save subscription online:', error)
 // 降级到离线模式
 setSubscriptions(prev => {
 const updated = [...prev, normalizedSubscription]
 saveSubscriptions(updated, scope)
 return updated
 })
 queueOperation({
 type: 'create',
 subscriptionId: normalizedSubscription.id,
 subscription: normalizedSubscription,
 queuedAt: normalizedSubscription.updatedAt || new Date().toISOString()
 })
 return normalizedSubscription
 }
 } else {
 // 离线模式：只保存到本地
 setSubscriptions(prev => {
 const updated = [...prev, normalizedSubscription]
 saveSubscriptions(updated, scope)
 return updated
 })
 queueOperation({
 type: 'create',
 subscriptionId: normalizedSubscription.id,
 subscription: normalizedSubscription,
 queuedAt: normalizedSubscription.updatedAt || new Date().toISOString()
 })
 return normalizedSubscription
 }
 }, [queueOperation, removeQueuedOperations, user, setSubscriptions])

 // 更新订阅（自动同步）
 const updateSubscription = useCallback(async (subscription: Subscription): Promise<Subscription> => {
 const scope = resolveUserScope(user)
 const currentSubscriptions = loadSubscriptions(scope)
 const existingSubscription = currentSubscriptions.find(sub => sub.id === subscription.id)
 const normalizedSubscription = normalizeSubscription({
 ...existingSubscription,
 ...subscription,
 updatedAt: new Date().toISOString()
 })

 if (config.features.cloudSync && user) {
 try {
 // 在线模式：同步到云端
 const updatedSubscription = await SubscriptionService.updateSubscription(normalizedSubscription)
 // 使用函数式更新，避免依赖陈旧的 subscriptions 状态
 setSubscriptions(prev => {
 const updated = prev.map(sub =>
 sub.id === updatedSubscription.id ? updatedSubscription : sub
 )
 saveSubscriptions(updated, scope)
 return updated
 })
 removeQueuedOperations(updatedSubscription.id)
 setLastSyncTime(new Date())
 return updatedSubscription
 } catch (error) {
 console.error('Failed to update subscription online:', error)
 // 降级到离线模式
 setSubscriptions(prev => {
 const updated = prev.map(sub =>
 sub.id === normalizedSubscription.id ? normalizedSubscription : sub
 )
 saveSubscriptions(updated, scope)
 return updated
 })
 queueOperation({
 type: 'update',
 subscriptionId: normalizedSubscription.id,
 subscription: normalizedSubscription,
 baseUpdatedAt: existingSubscription?.updatedAt,
 queuedAt: normalizedSubscription.updatedAt || new Date().toISOString()
 })
 return normalizedSubscription
 }
 } else {
 // 离线模式：只更新本地
 setSubscriptions(prev => {
 const updated = prev.map(sub =>
 sub.id === normalizedSubscription.id ? normalizedSubscription : sub
 )
 saveSubscriptions(updated, scope)
 return updated
 })
 queueOperation({
 type: 'update',
 subscriptionId: normalizedSubscription.id,
 subscription: normalizedSubscription,
 baseUpdatedAt: existingSubscription?.updatedAt,
 queuedAt: normalizedSubscription.updatedAt || new Date().toISOString()
 })
 return normalizedSubscription
 }
 }, [queueOperation, removeQueuedOperations, user, setSubscriptions])

 const updateSubscriptionsBatch = useCallback(async (updatedSubscriptions: Subscription[]): Promise<Subscription[]> => {
 const scope = resolveUserScope(user)
 const currentSubscriptions = loadSubscriptions(scope)
 const currentSubscriptionMap = new Map(currentSubscriptions.map(subscription => [subscription.id, subscription]))
 const changedSubscriptions = updatedSubscriptions.filter(updatedSubscription => {
 const currentSubscription = currentSubscriptionMap.get(updatedSubscription.id)

 if (!currentSubscription) {
 return true
 }

 return JSON.stringify(currentSubscription) !== JSON.stringify(updatedSubscription)
 })

 if (changedSubscriptions.length === 0) {
 return currentSubscriptions
 }

 await Promise.all(changedSubscriptions.map(subscription => updateSubscription(subscription)))
 return loadSubscriptions(scope)
 }, [updateSubscription])

 // 删除订阅（自动同步）
 const deleteSubscription = useCallback(async (id: string): Promise<void> => {
 const scope = resolveUserScope(user)
 const currentSubscriptions = loadSubscriptions(scope)
 const existingSubscription = currentSubscriptions.find(subscription => subscription.id === id)

 if (config.features.cloudSync && user) {
 try {
 // 在线模式：从云端删除
 await SubscriptionService.deleteSubscription(id)
 // 使用函数式更新，避免依赖陈旧的 subscriptions 状态
 setSubscriptions(prev => {
 const updated = prev.filter(s => s.id !== id)
 saveSubscriptions(updated, scope)
 return updated
 })
 removeQueuedOperations(id)
 setLastSyncTime(new Date())
 } catch (error) {
 console.error('Failed to delete subscription online:', error)
 // 降级到离线模式：使用函数式更新
 setSubscriptions(prev => {
 const updated = prev.filter(s => s.id !== id)
 saveSubscriptions(updated, scope)
 return updated
 })
 queueOperation({
 type: 'delete',
 subscriptionId: id,
 baseUpdatedAt: existingSubscription?.updatedAt,
 queuedAt: new Date().toISOString()
 })
 }
 } else {
 // 离线模式：只从本地删除，使用函数式更新
 setSubscriptions(prev => {
 const updated = prev.filter(s => s.id !== id)
 saveSubscriptions(updated, scope)
 return updated
 })
 queueOperation({
 type: 'delete',
 subscriptionId: id,
 baseUpdatedAt: existingSubscription?.updatedAt,
 queuedAt: new Date().toISOString()
 })
 }
 }, [queueOperation, removeQueuedOperations, user, setSubscriptions])

 return {
 syncStatus,
 lastSyncTime,
 syncSubscriptions,
 uploadLocalData,
 createSubscription,
 updateSubscription,
 updateSubscriptionsBatch,
 deleteSubscription
 }
}
