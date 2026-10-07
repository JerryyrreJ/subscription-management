import { Dispatch, SetStateAction, useState, useCallback, useRef, useLayoutEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { PendingSyncOperation, Subscription, SyncSubscriptionsResult } from '../types'
import { SubscriptionService } from '../services/subscriptionService'
import {
 enqueuePendingSyncOperation,
 loadLocalDataOwner,
 loadPendingSyncOperations,
 loadSubscriptions,
 savePendingSyncOperations,
 saveSubscriptions
} from '../utils/storage'
import { config } from '../lib/config'
import { buildPendingCreateOperations, reconcileSubscriptionSync } from '../utils/subscriptionSync'
import { createSubscriptionRecord, updateSubscriptionRecord } from '../utils/subscriptionDomain'
import { DataScope, GUEST_DATA_SCOPE, getUserDataScope } from '../utils/dataScope'
import { createScopedTaskGate } from '../utils/scopedTaskGate'
import { useAccountTaskGuard } from './useAccountTaskGuard'
import {
 claimLocalDataOwnership,
 refreshLocalDataOwnership,
 resolveCurrentLocalDataScope
} from '../utils/localDataOwnership'

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
const readLocalState = (scope: DataScope): SyncSubscriptionsResult => ({
 subscriptions: loadSubscriptions(scope),
 pendingOperations: loadPendingSyncOperations(scope),
})

interface CloudTask {
 owner: () => boolean
 kind: 'sync' | 'upload'
 promise: Promise<Subscription[]>
}

export function useSubscriptionSync(
 user: User | null,
 setSubscriptions: Dispatch<SetStateAction<Subscription[]>>
): UseSyncReturn {
 const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
 const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
 const activeCloudTaskRef = useRef<CloudTask | null>(null)
 const statusResetTimeoutRef = useRef<number | null>(null)
 const isCurrentAccount = useAccountTaskGuard(user?.id)

 useLayoutEffect(() => {
  setSyncStatus('idle')
  setLastSyncTime(null)
  return () => {
   if (statusResetTimeoutRef.current !== null) window.clearTimeout(statusResetTimeoutRef.current)
  }
 }, [isCurrentAccount])

 const scheduleStatusReset = useCallback((nextStatus: SyncStatus, delayMs: number) => {
  if (!isCurrentAccount()) return
  setSyncStatus(nextStatus)
  if (statusResetTimeoutRef.current !== null) window.clearTimeout(statusResetTimeoutRef.current)
  statusResetTimeoutRef.current = window.setTimeout(() => {
   if (isCurrentAccount()) setSyncStatus('idle')
   statusResetTimeoutRef.current = null
  }, delayMs)
 }, [isCurrentAccount])

 // Persist outside React state updaters so request completion can always read the
 // latest local state, even before React has committed a foreground edit.
 const persistSubscriptions = useCallback((scope: DataScope, subscriptions: Subscription[]) => {
  saveSubscriptions(subscriptions, scope)
  if (!isCurrentAccount()) return
  setSubscriptions(subscriptions)
  if (user) {
   claimLocalDataOwnership(user.id, scope)
  } else {
   const owner = loadLocalDataOwner(GUEST_DATA_SCOPE)
   if (owner) refreshLocalDataOwnership(owner.userId, GUEST_DATA_SCOPE)
  }
 }, [isCurrentAccount, setSubscriptions, user])

 const runCloudTask = useCallback(async (
  scope: DataScope,
  kind: CloudTask['kind'],
  task: () => Promise<SyncSubscriptionsResult>
 ): Promise<Subscription[]> => {
  let existing = activeCloudTaskRef.current
  while (existing?.owner === isCurrentAccount) {
   if (kind === 'sync') return existing.promise
   // An upload carries a specific payload; a running download cannot satisfy it.
   await existing.promise
   existing = activeCloudTaskRef.current
  }
  if (!isCurrentAccount()) return loadSubscriptions(scope)

  const token = subscriptionCloudTaskGate.claim(scope)
  const isCurrent = () => isCurrentAccount() && subscriptionCloudTaskGate.isCurrent(scope, token)
  const activeTask: CloudTask = {
   owner: isCurrentAccount,
   kind,
   promise: Promise.resolve().then(async () => {
    try {
     if (!isCurrent()) return loadSubscriptions(scope)
     setSyncStatus('syncing')
     const snapshot = readLocalState(scope)
     const result = await task()
     if (!isCurrent()) return loadSubscriptions(scope)

     const reconciled = reconcileSubscriptionSync(snapshot, readLocalState(scope), result)
     savePendingSyncOperations(reconciled.pendingOperations, scope)
     persistSubscriptions(scope, reconciled.subscriptions)
     setLastSyncTime(new Date())
     scheduleStatusReset(reconciled.pendingOperations.length ? 'error' : 'success', 3000)
     return reconciled.subscriptions
    } catch (error) {
     console.error('Cloud subscription task failed:', error)
     if (isCurrent()) scheduleStatusReset('error', 5000)
     return loadSubscriptions(scope)
    } finally {
     subscriptionCloudTaskGate.release(scope, token)
     if (activeCloudTaskRef.current === activeTask) activeCloudTaskRef.current = null
    }
   })
  }
  activeCloudTaskRef.current = activeTask
  return activeTask.promise
 }, [isCurrentAccount, persistSubscriptions, scheduleStatusReset])

 const syncSubscriptions = useCallback(async (): Promise<Subscription[]> => {
  const scope = user ? getUserDataScope(user.id) : resolveCurrentLocalDataScope(undefined)
  if (!config.features.cloudSync || !user) return loadSubscriptions(scope)
  return runCloudTask(scope, 'sync', () => {
   const current = readLocalState(scope)
   return SubscriptionService.syncSubscriptions(current.subscriptions, current.pendingOperations, user.id)
  })
 }, [runCloudTask, user])

 const uploadLocalData = useCallback(async (subscriptions: Subscription[]): Promise<Subscription[]> => {
  if (!config.features.cloudSync || !user || subscriptions.length === 0) return subscriptions
  const scope = getUserDataScope(user.id)
  return runCloudTask(scope, 'upload', async () => {
   const before = loadPendingSyncOperations(scope)
   const result = await SubscriptionService.uploadLocalSubscriptions(subscriptions, user.id)
   const uploadedIds = new Set(result.uploadedSubscriptions.map(sub => sub.id))
   const pending = before.filter(op => op.type !== 'create' || !uploadedIds.has(op.subscriptionId))
   const pendingIds = new Set(pending.map(op => op.subscriptionId))
   return {
    subscriptions: result.mergedLocalState,
    pendingOperations: [...pending, ...buildPendingCreateOperations(
     result.failedSubscriptions.filter(sub => !pendingIds.has(sub.id))
    )],
   }
  })
 }, [runCloudTask, user])

 const queueOperation = (scope: DataScope, operation: Omit<PendingSyncOperation, 'id'>) => {
  enqueuePendingSyncOperation({ id: crypto.randomUUID(), ...operation }, scope)
 }

 const acknowledgeOperations = (scope: DataScope, submitted: PendingSyncOperation[]) => {
  const fingerprints = new Set(submitted.map(op => JSON.stringify(op)))
  savePendingSyncOperations(loadPendingSyncOperations(scope).filter(op =>
   !fingerprints.has(JSON.stringify(op))
  ), scope)
 }

 const createSubscription = useCallback(async (subscription: Subscription | Omit<Subscription, 'id'>): Promise<Subscription> => {
  const scope = resolveCurrentLocalDataScope(user?.id)
  const normalized = createSubscriptionRecord(subscription, {
   id: 'id' in subscription ? subscription.id : undefined,
   createdAt: subscription.createdAt,
  })
  const submitted = loadPendingSyncOperations(scope).filter(op => op.subscriptionId === normalized.id)
  let saved = normalized
  let cloudSynced = false
  if (config.features.cloudSync && user) {
   try {
    saved = await SubscriptionService.createSubscription(normalized, user.id)
    cloudSynced = true
   } catch (error) {
    console.error('Failed to save subscription online:', error)
   }
  }
  if (cloudSynced) {
   acknowledgeOperations(scope, submitted)
   if (isCurrentAccount()) setLastSyncTime(new Date())
  } else {
   queueOperation(scope, { type: 'create', subscriptionId: saved.id, subscription: saved,
    queuedAt: saved.updatedAt || new Date().toISOString() })
  }
  persistSubscriptions(scope, [...loadSubscriptions(scope).filter(sub => sub.id !== saved.id), saved])
  return saved
 }, [isCurrentAccount, persistSubscriptions, user])

 const updateSubscription = useCallback(async (subscription: Subscription): Promise<Subscription> => {
  const scope = resolveCurrentLocalDataScope(user?.id)
  const existing = loadSubscriptions(scope).find(sub => sub.id === subscription.id)
  const normalized = updateSubscriptionRecord(existing || subscription, { ...existing, ...subscription })
  const submitted = loadPendingSyncOperations(scope).filter(op => op.subscriptionId === normalized.id)
  let saved = normalized
  let cloudSynced = false
  if (config.features.cloudSync && user) {
   try {
    saved = await SubscriptionService.updateSubscription(normalized, user.id)
    cloudSynced = true
   } catch (error) {
    console.error('Failed to update subscription online:', error)
   }
  }
  if (cloudSynced) {
   acknowledgeOperations(scope, submitted)
   if (isCurrentAccount()) setLastSyncTime(new Date())
  } else {
   queueOperation(scope, { type: 'update', subscriptionId: saved.id, subscription: saved,
    baseUpdatedAt: existing?.updatedAt, queuedAt: saved.updatedAt || new Date().toISOString() })
  }
  persistSubscriptions(scope, loadSubscriptions(scope).map(sub => sub.id === saved.id ? saved : sub))
  return saved
 }, [isCurrentAccount, persistSubscriptions, user])

 const updateSubscriptionsBatch = useCallback(async (subscriptions: Subscription[]): Promise<Subscription[]> => {
  const scope = resolveCurrentLocalDataScope(user?.id)
  const current = new Map(loadSubscriptions(scope).map(sub => [sub.id, sub]))
  await Promise.all(subscriptions.filter(sub => JSON.stringify(current.get(sub.id)) !== JSON.stringify(sub))
   .map(sub => updateSubscription(sub)))
  return loadSubscriptions(scope)
 }, [updateSubscription, user])

 const deleteSubscription = useCallback(async (id: string): Promise<void> => {
  const scope = resolveCurrentLocalDataScope(user?.id)
  const existing = loadSubscriptions(scope).find(sub => sub.id === id)
  const submitted = loadPendingSyncOperations(scope).filter(op => op.subscriptionId === id)
  let cloudSynced = false
  if (config.features.cloudSync && user) {
   try {
    await SubscriptionService.deleteSubscription(id, user.id)
    cloudSynced = true
   } catch (error) {
    console.error('Failed to delete subscription online:', error)
   }
  }
  if (cloudSynced) {
   acknowledgeOperations(scope, submitted)
   if (isCurrentAccount()) setLastSyncTime(new Date())
  }
  const hasConcurrentSync = activeCloudTaskRef.current?.owner === isCurrentAccount
  if (!cloudSynced || hasConcurrentSync) {
   if (hasConcurrentSync) {
    // Keep a tombstone even for create -> delete pairs absent from both local
    // snapshots: the running request might already have read/created the row.
    savePendingSyncOperations(loadPendingSyncOperations(scope).filter(op => op.subscriptionId !== id), scope)
   }
   queueOperation(scope, { type: 'delete', subscriptionId: id,
    baseUpdatedAt: existing?.updatedAt, queuedAt: new Date().toISOString() })
  }
  persistSubscriptions(scope, loadSubscriptions(scope).filter(sub => sub.id !== id))
 }, [isCurrentAccount, persistSubscriptions, user])

 return {
  syncStatus, lastSyncTime, syncSubscriptions, uploadLocalData,
  createSubscription, updateSubscription, updateSubscriptionsBatch, deleteSubscription
 }
}
