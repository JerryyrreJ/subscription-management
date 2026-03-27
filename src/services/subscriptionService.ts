import { supabase } from '../lib/supabase'
import { PendingSyncOperation, Subscription, SyncSubscriptionsResult, UploadLocalSubscriptionsResult } from '../types'
import { config } from '../lib/config'
import {
 applyPendingOperationsToSubscriptions,
 chooseConflictWinner,
 normalizeSubscription,
 sortPendingOperations
} from '../utils/subscriptionSync'
import { scopeSubscriptionQueryToUser, scopeSubscriptionQueryToUserAndId } from '../utils/subscriptionTenantScope'

export interface SupabaseSubscription {
 id: string
 user_id: string
 name: string
 category: string
 amount: number
 currency: string
 period: string
 last_payment_date: string
 next_payment_date: string
 custom_date?: string
 notification_enabled: boolean
 created_at: string
 updated_at: string
}

export class SubscriptionService {
 private static async getAuthenticatedUserId(): Promise<string> {
 if (!supabase) {
 throw new Error('Cloud sync not available')
 }

 const { data: { user }, error: authError } = await supabase.auth.getUser()
 if (authError) {
 console.error('Auth error:', authError)
 throw new Error(`Authentication failed: ${authError.message}`)
 }
 if (!user) {
 console.error('No authenticated user found')
 throw new Error('User not authenticated')
 }

 return user.id
 }

 // 获取云端数据
 static async getSubscriptions(): Promise<Subscription[]> {
 if (!config.hasSupabaseConfig || !supabase) {
 throw new Error('Cloud sync not available')
 }

 const userId = await this.getAuthenticatedUserId()

 const { data, error } = await scopeSubscriptionQueryToUser(
  supabase
 .from('subscriptions')
 .select('*')
 .order('created_at', { ascending: false }),
  userId
 )

 if (error) {
 console.error('Error fetching subscriptions:', error)
 throw error
 }

 return data ? data.map(this.transformFromSupabase) : []
 }

 // 创建订阅
 static async createSubscription(subscription: Subscription | Omit<Subscription, 'id'>): Promise<Subscription> {
 if (!config.hasSupabaseConfig || !supabase) {
 throw new Error('Cloud sync not available')
 }

 const supabaseData = this.transformToSupabase(subscription)

 const userId = await this.getAuthenticatedUserId()
 console.log('Creating subscription for user:', userId)

 const insertPayload = {
  ...supabaseData,
  user_id: userId,
  ...('id' in subscription ? { id: subscription.id } : {})
 }

 const { data, error } = await supabase
 .from('subscriptions')
 .insert([insertPayload])
 .select()
 .single()

 if (error) {
 console.error('Error creating subscription:', error)
 throw error
 }

 return this.transformFromSupabase(data)
 }

 // 更新订阅
 static async updateSubscription(subscription: Subscription): Promise<Subscription> {
 if (!config.hasSupabaseConfig || !supabase) {
 throw new Error('Cloud sync not available')
 }

 const userId = await this.getAuthenticatedUserId()
 const supabaseData = this.transformToSupabase(subscription)

 const { data, error } = await scopeSubscriptionQueryToUserAndId(
  supabase
 .from('subscriptions')
 .update(supabaseData),
  userId,
  subscription.id
 )
 .select()
 .single()

 if (error) {
 console.error('Error updating subscription:', error)
 throw error
 }

 return this.transformFromSupabase(data)
 }

 // 删除订阅
 static async deleteSubscription(id: string): Promise<void> {
 if (!config.hasSupabaseConfig || !supabase) {
 throw new Error('Cloud sync not available')
 }

 const userId = await this.getAuthenticatedUserId()
 const { error } = await scopeSubscriptionQueryToUserAndId(
  supabase
 .from('subscriptions')
 .delete(),
  userId,
  id
 )

 if (error) {
 console.error('Error deleting subscription:', error)
 throw error
 }
 }

 // 批量同步 - 纯下载模式（云端为准）
 static async syncSubscriptions(
 localSubscriptions: Subscription[],
 pendingOperations: PendingSyncOperation[] = []
 ): Promise<SyncSubscriptionsResult> {
 if (!config.hasSupabaseConfig || !supabase) {
 throw new Error('Cloud sync not available')
 }

 try {
 let cloudSubscriptions = await this.getSubscriptions()
 const remainingOperations: PendingSyncOperation[] = []

 for (const operation of sortPendingOperations(pendingOperations)) {
 try {
 const operationResult = await this.applyPendingOperation(operation, cloudSubscriptions)
 cloudSubscriptions = operationResult.cloudSubscriptions
 if (!operationResult.applied && operationResult.keepPending) {
 remainingOperations.push(operation)
 }
 } catch (error) {
 console.error(`Failed to sync pending ${operation.type} for ${operation.subscriptionId}:`, error)
 remainingOperations.push(operation)
 }
 }

 const refreshedCloudSubscriptions = await this.getSubscriptions()
 const resolvedSubscriptions = applyPendingOperationsToSubscriptions(
 refreshedCloudSubscriptions,
 remainingOperations
 )

 console.log(`Sync completed: ${refreshedCloudSubscriptions.length} subscriptions from cloud`)
 console.log(`Pending operations remaining after sync: ${remainingOperations.length}`)

 return {
 subscriptions: resolvedSubscriptions,
 pendingOperations: remainingOperations
 }
 } catch (error) {
 console.error('Error syncing subscriptions:', error)

 return {
 subscriptions: applyPendingOperationsToSubscriptions(localSubscriptions, pendingOperations),
 pendingOperations
 }
 }
 }

 // 批量上传本地数据到云端（带去重检查）
 static async uploadLocalSubscriptions(subscriptions: Subscription[]): Promise<UploadLocalSubscriptionsResult> {
 if (!config.hasSupabaseConfig || !supabase) {
 throw new Error('Cloud sync not available')
 }

 try {
 await this.getAuthenticatedUserId()

 // 1. 获取云端现有数据进行去重检查
 const cloudSubscriptions = await this.getSubscriptions()

 // 2. 仅按订阅ID去重，允许不同订阅拥有相同内容
 const cloudIds = new Set(cloudSubscriptions.map(s => s.id))

 // 3. 过滤需要上传的订阅（避免重复）
 const subsToUpload = subscriptions.filter(sub => {
 if (cloudIds.has(sub.id)) {
 console.log(`Skipping upload for ${sub.name}: ID already exists in cloud`)
 return false
 }

 return true
 })

 console.log(`Uploading ${subsToUpload.length} unique local subscriptions`)

 // 5. 上传独有的订阅
 const failedSubscriptions: Subscription[] = []
 const uploadPromises = subsToUpload.map(async (sub) => {
 try {
  return await this.createSubscription(sub)
 } catch (error) {
  console.error(`Failed to upload subscription ${sub.name}:`, error)
 failedSubscriptions.push(sub)
 return sub // 保留原始数据在本地
 }
 })

 const uploadedSubscriptions = await Promise.all(uploadPromises)

 // 6. 返回所有云端数据（包括原有的和新上传的）
 const allSubscriptions = [...cloudSubscriptions, ...uploadedSubscriptions]

 // 根据ID去重，确保数据一致性
 const uniqueSubscriptions = allSubscriptions.reduce((acc, current) => {
 const existing = acc.find(item => item.id === current.id)
 if (!existing) {
 acc.push(current)
 }
 return acc
 }, [] as Subscription[])

 return {
 subscriptions: uniqueSubscriptions,
 failedSubscriptions
 }
 } catch (error) {
 console.error('Error uploading subscriptions:', error)
 return {
 subscriptions,
 failedSubscriptions: subscriptions
 }
 }
 }

 // 数据格式转换：Supabase -> App
 private static transformFromSupabase(data: SupabaseSubscription): Subscription {
 return {
 id: data.id,
 name: data.name,
 category: data.category,
 amount: data.amount,
 currency: data.currency as 'CNY' | 'USD' | 'EUR' | 'JPY' | 'GBP' | 'AUD' | 'CAD' | 'CHF' | 'HKD' | 'SGD',
 period: data.period as 'monthly' | 'yearly' | 'custom',
 lastPaymentDate: data.last_payment_date,
 nextPaymentDate: data.next_payment_date,
 customDate: data.custom_date,
 updatedAt: data.updated_at,
 notificationEnabled: data.notification_enabled ?? true, // 默认 true
 createdAt: data.created_at
 }
 }

 // 数据格式转换：App -> Supabase
 private static transformToSupabase(subscription: Subscription | Omit<Subscription, 'id'>): Omit<SupabaseSubscription, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
 return {
 name: subscription.name,
 category: subscription.category,
 amount: subscription.amount,
 currency: subscription.currency,
 period: subscription.period,
 last_payment_date: subscription.lastPaymentDate,
 next_payment_date: subscription.nextPaymentDate,
 custom_date: subscription.customDate || null,
 notification_enabled: subscription.notificationEnabled ?? true // 默认 true
 }
 }

 private static shouldApplyLocalChange(
 operation: PendingSyncOperation,
 cloudSubscription?: Subscription
 ): boolean {
 if (!cloudSubscription) {
 return true
 }

 if (operation.baseUpdatedAt && cloudSubscription.updatedAt) {
 if (operation.baseUpdatedAt === cloudSubscription.updatedAt) {
 return true
 }
 }

 const localTimestamp = operation.subscription?.updatedAt || operation.queuedAt
 const cloudTimestamp = cloudSubscription.updatedAt || cloudSubscription.createdAt

 return chooseConflictWinner(localTimestamp, cloudTimestamp) === 'local'
 }

 private static async applyPendingOperation(
 operation: PendingSyncOperation,
 cloudSubscriptions: Subscription[]
 ): Promise<{ applied: boolean; keepPending: boolean; cloudSubscriptions: Subscription[] }> {
 const normalizedCloudSubscriptions = cloudSubscriptions.map(subscription => normalizeSubscription(subscription))
 const cloudSubscription = normalizedCloudSubscriptions.find(
 subscription => subscription.id === operation.subscriptionId
 )

 switch (operation.type) {
 case 'create': {
 if (!operation.subscription) {
 return {
 applied: false,
 keepPending: false,
 cloudSubscriptions: normalizedCloudSubscriptions
 }
 }

 if (!cloudSubscription) {
 const createdSubscription = await this.createSubscription(operation.subscription)
 return {
 applied: true,
 keepPending: false,
 cloudSubscriptions: this.replaceCloudSubscription(
 normalizedCloudSubscriptions,
 createdSubscription
 )
 }
 }

 if (!this.shouldApplyLocalChange(operation, cloudSubscription)) {
 return {
 applied: false,
 keepPending: false,
 cloudSubscriptions: normalizedCloudSubscriptions
 }
 }

 const updatedSubscription = await this.updateSubscription({
 ...cloudSubscription,
 ...operation.subscription,
 id: operation.subscriptionId
 })

 return {
 applied: true,
 keepPending: false,
 cloudSubscriptions: this.replaceCloudSubscription(
 normalizedCloudSubscriptions,
 updatedSubscription
 )
 }
 }
 case 'update': {
 if (!operation.subscription) {
 return {
 applied: false,
 keepPending: false,
 cloudSubscriptions: normalizedCloudSubscriptions
 }
 }

 if (!cloudSubscription) {
 const createdSubscription = await this.createSubscription(operation.subscription)
 return {
 applied: true,
 keepPending: false,
 cloudSubscriptions: this.replaceCloudSubscription(
 normalizedCloudSubscriptions,
 createdSubscription
 )
 }
 }

 if (!this.shouldApplyLocalChange(operation, cloudSubscription)) {
 return {
 applied: false,
 keepPending: false,
 cloudSubscriptions: normalizedCloudSubscriptions
 }
 }

 const updatedSubscription = await this.updateSubscription({
 ...cloudSubscription,
 ...operation.subscription
 })

 return {
 applied: true,
 keepPending: false,
 cloudSubscriptions: this.replaceCloudSubscription(
 normalizedCloudSubscriptions,
 updatedSubscription
 )
 }
 }
 case 'delete': {
 if (!cloudSubscription) {
 return {
 applied: true,
 keepPending: false,
 cloudSubscriptions: normalizedCloudSubscriptions
 }
 }

 if (!this.shouldApplyLocalChange(operation, cloudSubscription)) {
 return {
 applied: false,
 keepPending: false,
 cloudSubscriptions: normalizedCloudSubscriptions
 }
 }

 await this.deleteSubscription(operation.subscriptionId)

 return {
 applied: true,
 keepPending: false,
 cloudSubscriptions: normalizedCloudSubscriptions.filter(
 subscription => subscription.id !== operation.subscriptionId
 )
 }
 }
 default:
 return {
 applied: false,
 keepPending: false,
 cloudSubscriptions: normalizedCloudSubscriptions
 }
 }
 }

 private static replaceCloudSubscription(
 cloudSubscriptions: Subscription[],
 nextSubscription: Subscription
 ): Subscription[] {
 const normalizedSubscription = normalizeSubscription(nextSubscription)
 const existingIndex = cloudSubscriptions.findIndex(
 subscription => subscription.id === normalizedSubscription.id
 )

 if (existingIndex === -1) {
 return [normalizedSubscription, ...cloudSubscriptions]
 }

 const updatedSubscriptions = [...cloudSubscriptions]
 updatedSubscriptions[existingIndex] = normalizedSubscription
 return updatedSubscriptions
 }

 // 检查用户是否在线
 static async isOnline(): Promise<boolean> {
 if (!config.hasSupabaseConfig || !supabase) {
 return false
 }

 try {
 const userId = await this.getAuthenticatedUserId()
 const { error } = await scopeSubscriptionQueryToUser(
  supabase.from('subscriptions').select('id').limit(1),
  userId
 )
 return !error
 } catch {
 return false
 }
 }
}
