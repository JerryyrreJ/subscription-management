import { useState, useCallback, useRef } from 'react'
import { Subscription } from '../types'
import { SubscriptionService } from '../services/subscriptionService'
import { loadSubscriptions, saveSubscriptions } from '../utils/storage'
import { config } from '../lib/config'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

interface UseSyncReturn {
  syncStatus: SyncStatus
  syncSubscriptions: () => Promise<Subscription[]>
  uploadLocalData: (subscriptions: Subscription[]) => Promise<Subscription[]>
  createSubscription: (subscription: Omit<Subscription, 'id'>) => Promise<Subscription>
  updateSubscription: (subscription: Subscription) => Promise<Subscription>
  deleteSubscription: (id: string) => Promise<void>
}

export function useSubscriptionSync(
  user: any,
  subscriptions: Subscription[],
  setSubscriptions: (subs: Subscription[]) => void
): UseSyncReturn {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const isSyncingRef = useRef(false)
  const isUploadingRef = useRef(false)

  // 同步订阅数据
  const syncSubscriptions = useCallback(async (): Promise<Subscription[]> => {
    if (!config.features.cloudSync || !user || isSyncingRef.current) {
      return subscriptions
    }

    isSyncingRef.current = true
    setSyncStatus('syncing')

    try {
      const syncedSubscriptions = await SubscriptionService.syncSubscriptions(subscriptions)
      setSubscriptions(syncedSubscriptions)
      saveSubscriptions(syncedSubscriptions)
      setSyncStatus('success')

      // 3秒后重置状态
      setTimeout(() => {
        setSyncStatus('idle')
        isSyncingRef.current = false
      }, 3000)

      return syncedSubscriptions
    } catch (error) {
      console.error('Sync failed:', error)
      setSyncStatus('error')

      // 5秒后重置状态
      setTimeout(() => {
        setSyncStatus('idle')
        isSyncingRef.current = false
      }, 5000)

      return subscriptions
    }
  }, [user, subscriptions, setSubscriptions])

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

      setTimeout(() => {
        setSyncStatus('idle')
        isUploadingRef.current = false
      }, 3000)

      return cloudSubscriptions
    } catch (error) {
      console.error('Upload failed:', error)
      setSyncStatus('error')

      setTimeout(() => {
        setSyncStatus('idle')
        isUploadingRef.current = false
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
        const updatedSubscriptions = [...subscriptions, newSubscription]
        setSubscriptions(updatedSubscriptions)
        saveSubscriptions(updatedSubscriptions) // 同时保存到本地作为缓存
        return newSubscription
      } catch (error) {
        console.error('Failed to save subscription online:', error)
        // 降级到离线模式
        const offlineSubscription: Subscription = {
          id: crypto.randomUUID(),
          ...subscription
        }
        const updatedSubscriptions = [...subscriptions, offlineSubscription]
        setSubscriptions(updatedSubscriptions)
        saveSubscriptions(updatedSubscriptions)
        return offlineSubscription
      }
    } else {
      // 离线模式：只保存到本地
      const offlineSubscription: Subscription = {
        id: crypto.randomUUID(),
        ...subscription
      }
      const updatedSubscriptions = [...subscriptions, offlineSubscription]
      setSubscriptions(updatedSubscriptions)
      saveSubscriptions(updatedSubscriptions)
      return offlineSubscription
    }
  }, [user, subscriptions, setSubscriptions])

  // 更新订阅（自动同步）
  const updateSubscription = useCallback(async (subscription: Subscription): Promise<Subscription> => {
    if (config.features.cloudSync && user) {
      try {
        // 在线模式：同步到云端
        const updatedSubscription = await SubscriptionService.updateSubscription(subscription)
        const updatedSubscriptions = subscriptions.map(sub =>
          sub.id === updatedSubscription.id ? updatedSubscription : sub
        )
        setSubscriptions(updatedSubscriptions)
        saveSubscriptions(updatedSubscriptions)
        return updatedSubscription
      } catch (error) {
        console.error('Failed to update subscription online:', error)
        // 降级到离线模式
        const updatedSubscriptions = subscriptions.map(sub =>
          sub.id === subscription.id ? subscription : sub
        )
        setSubscriptions(updatedSubscriptions)
        saveSubscriptions(updatedSubscriptions)
        return subscription
      }
    } else {
      // 离线模式：只更新本地
      const updatedSubscriptions = subscriptions.map(sub =>
        sub.id === subscription.id ? subscription : sub
      )
      setSubscriptions(updatedSubscriptions)
      saveSubscriptions(updatedSubscriptions)
      return subscription
    }
  }, [user, subscriptions, setSubscriptions])

  // 删除订阅（自动同步）
  const deleteSubscription = useCallback(async (id: string): Promise<void> => {
    if (config.features.cloudSync && user) {
      try {
        // 在线模式：从云端删除
        await SubscriptionService.deleteSubscription(id)
        const updatedSubscriptions = subscriptions.filter(s => s.id !== id)
        setSubscriptions(updatedSubscriptions)
        saveSubscriptions(updatedSubscriptions)
      } catch (error) {
        console.error('Failed to delete subscription online:', error)
        // 降级到离线模式
        const updatedSubscriptions = subscriptions.filter(s => s.id !== id)
        setSubscriptions(updatedSubscriptions)
        saveSubscriptions(updatedSubscriptions)
      }
    } else {
      // 离线模式：只从本地删除
      const updatedSubscriptions = subscriptions.filter(s => s.id !== id)
      setSubscriptions(updatedSubscriptions)
      saveSubscriptions(updatedSubscriptions)
    }
  }, [user, subscriptions, setSubscriptions])

  return {
    syncStatus,
    syncSubscriptions,
    uploadLocalData,
    createSubscription,
    updateSubscription,
    deleteSubscription
  }
}