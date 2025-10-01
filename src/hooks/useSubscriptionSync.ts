import { useState, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { Subscription } from '../types'
import { SubscriptionService } from '../services/subscriptionService'
import { loadSubscriptions, saveSubscriptions } from '../utils/storage'
import { config } from '../lib/config'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

interface UseSyncReturn {
  syncStatus: SyncStatus
  lastSyncTime: Date | null
  syncSubscriptions: () => Promise<Subscription[]>
  uploadLocalData: (subscriptions: Subscription[]) => Promise<Subscription[]>
  createSubscription: (subscription: Omit<Subscription, 'id'>) => Promise<Subscription>
  updateSubscription: (subscription: Subscription) => Promise<Subscription>
  deleteSubscription: (id: string) => Promise<void>
}

export function useSubscriptionSync(
  user: User | null,
  subscriptions: Subscription[],
  setSubscriptions: (subs: Subscription[]) => void
): UseSyncReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const isSyncingRef = useRef(false)
  const isUploadingRef = useRef(false)

  // 同步订阅数据
  const syncSubscriptions = useCallback(async (): Promise<Subscription[]> => {
    if (!config.features.cloudSync || !user || isSyncingRef.current) {
      console.log('Sync skipped:', { cloudSync: config.features.cloudSync, user: !!user, isSyncing: isSyncingRef.current })
      return loadSubscriptions() // 直接从存储返回，避免状态依赖
    }

    console.log('Starting sync for user:', user.email)
    isSyncingRef.current = true
    setSyncStatus('syncing')

    try {
      const currentSubscriptions = loadSubscriptions() // 从存储获取最新数据
      const syncedSubscriptions = await SubscriptionService.syncSubscriptions(currentSubscriptions)
      setSubscriptions(syncedSubscriptions)
      saveSubscriptions(syncedSubscriptions)
      setSyncStatus('success')
      setLastSyncTime(new Date())

      // 立即重置同步标志，然后延迟重置状态
      isSyncingRef.current = false

      // 3秒后重置状态
      setTimeout(() => {
        setSyncStatus('idle')
      }, 3000)

      return syncedSubscriptions
    } catch (error) {
      console.error('Sync failed:', error)
      setSyncStatus('error')

      // 立即重置同步标志，然后延迟重置状态
      isSyncingRef.current = false

      // 5秒后重置状态
      setTimeout(() => {
        setSyncStatus('idle')
      }, 5000)

      return loadSubscriptions() // 返回存储中的数据
    }
  }, [user, setSubscriptions]) // 移除subscriptions依赖避免无限重新创建

  // 上传本地数据到云端（用户首次登录时）
  const uploadLocalData = useCallback(async (localSubscriptions: Subscription[]): Promise<Subscription[]> => {
    if (!config.features.cloudSync || !user || localSubscriptions.length === 0 || isUploadingRef.current) {
      return localSubscriptions
    }

    isUploadingRef.current = true
    setSyncStatus('syncing')

    try {
      console.log('Uploading local data to cloud...')
      const cloudSubscriptions = await SubscriptionService.uploadLocalSubscriptions(localSubscriptions)
      setSubscriptions(cloudSubscriptions)
      saveSubscriptions(cloudSubscriptions)
      setSyncStatus('success')
      setLastSyncTime(new Date())

      // 立即重置上传标志，然后延迟重置状态
      isUploadingRef.current = false

      setTimeout(() => {
        setSyncStatus('idle')
      }, 3000)

      return cloudSubscriptions
    } catch (error) {
      console.error('Upload failed:', error)
      setSyncStatus('error')

      // 立即重置上传标志，然后延迟重置状态
      isUploadingRef.current = false

      setTimeout(() => {
        setSyncStatus('idle')
      }, 5000)

      return localSubscriptions
    }
  }, [user, setSubscriptions])

  // 创建订阅（自动同步）
  const createSubscription = useCallback(async (subscription: Omit<Subscription, 'id'>): Promise<Subscription> => {
    if (config.features.cloudSync && user) {
      try {
        // 在线模式：直接保存到云端
        const newSubscription = await SubscriptionService.createSubscription(subscription)
        // 使用函数式更新，避免依赖陈旧的 subscriptions 状态
        setSubscriptions(prev => {
          const updated = [...prev, newSubscription]
          saveSubscriptions(updated)
          return updated
        })
        setLastSyncTime(new Date())
        return newSubscription
      } catch (error) {
        console.error('Failed to save subscription online:', error)
        // 降级到离线模式
        const offlineSubscription: Subscription = {
          id: crypto.randomUUID(),
          ...subscription
        }
        setSubscriptions(prev => {
          const updated = [...prev, offlineSubscription]
          saveSubscriptions(updated)
          return updated
        })
        return offlineSubscription
      }
    } else {
      // 离线模式：只保存到本地
      const offlineSubscription: Subscription = {
        id: crypto.randomUUID(),
        ...subscription
      }
      setSubscriptions(prev => {
        const updated = [...prev, offlineSubscription]
        saveSubscriptions(updated)
        return updated
      })
      return offlineSubscription
    }
  }, [user, setSubscriptions])

  // 更新订阅（自动同步）
  const updateSubscription = useCallback(async (subscription: Subscription): Promise<Subscription> => {
    if (config.features.cloudSync && user) {
      try {
        // 在线模式：同步到云端
        const updatedSubscription = await SubscriptionService.updateSubscription(subscription)
        // 使用函数式更新，避免依赖陈旧的 subscriptions 状态
        setSubscriptions(prev => {
          const updated = prev.map(sub =>
            sub.id === updatedSubscription.id ? updatedSubscription : sub
          )
          saveSubscriptions(updated)
          return updated
        })
        setLastSyncTime(new Date())
        return updatedSubscription
      } catch (error) {
        console.error('Failed to update subscription online:', error)
        // 降级到离线模式
        setSubscriptions(prev => {
          const updated = prev.map(sub =>
            sub.id === subscription.id ? subscription : sub
          )
          saveSubscriptions(updated)
          return updated
        })
        return subscription
      }
    } else {
      // 离线模式：只更新本地
      setSubscriptions(prev => {
        const updated = prev.map(sub =>
          sub.id === subscription.id ? subscription : sub
        )
        saveSubscriptions(updated)
        return updated
      })
      return subscription
    }
  }, [user, setSubscriptions])

  // 删除订阅（自动同步）
  const deleteSubscription = useCallback(async (id: string): Promise<void> => {
    if (config.features.cloudSync && user) {
      try {
        // 在线模式：从云端删除
        await SubscriptionService.deleteSubscription(id)
        // 使用函数式更新，避免依赖陈旧的 subscriptions 状态
        setSubscriptions(prev => {
          const updated = prev.filter(s => s.id !== id)
          saveSubscriptions(updated)
          return updated
        })
        setLastSyncTime(new Date())
      } catch (error) {
        console.error('Failed to delete subscription online:', error)
        // 降级到离线模式：使用函数式更新
        setSubscriptions(prev => {
          const updated = prev.filter(s => s.id !== id)
          saveSubscriptions(updated)
          return updated
        })
      }
    } else {
      // 离线模式：只从本地删除，使用函数式更新
      setSubscriptions(prev => {
        const updated = prev.filter(s => s.id !== id)
        saveSubscriptions(updated)
        return updated
      })
    }
  }, [user, setSubscriptions])

  return {
    syncStatus,
    lastSyncTime,
    syncSubscriptions,
    uploadLocalData,
    createSubscription,
    updateSubscription,
    deleteSubscription
  }
}