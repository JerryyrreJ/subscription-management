import { supabase } from '../lib/supabase'
import { Subscription } from '../types'

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
  created_at: string
  updated_at: string
}

export class SubscriptionService {
  // 获取云端数据
  static async getSubscriptions(): Promise<Subscription[]> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching subscriptions:', error)
      throw error
    }

    return data ? data.map(this.transformFromSupabase) : []
  }

  // 创建订阅
  static async createSubscription(subscription: Omit<Subscription, 'id'>): Promise<Subscription> {
    const supabaseData = this.transformToSupabase(subscription)

    const { data, error } = await supabase
      .from('subscriptions')
      .insert([supabaseData])
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
    const supabaseData = this.transformToSupabase(subscription)

    const { data, error } = await supabase
      .from('subscriptions')
      .update(supabaseData)
      .eq('id', subscription.id)
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
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting subscription:', error)
      throw error
    }
  }

  // 批量同步 - 简单策略：云端数据优先
  static async syncSubscriptions(localSubscriptions: Subscription[]): Promise<Subscription[]> {
    try {
      // 1. 获取云端数据
      const cloudSubscriptions = await this.getSubscriptions()

      // 2. 找出本地独有的订阅（可能是离线时创建的）
      const cloudIds = new Set(cloudSubscriptions.map(s => s.id))
      const localOnlySubscriptions = localSubscriptions.filter(sub => !cloudIds.has(sub.id))

      // 3. 上传本地独有的订阅到云端
      const uploadPromises = localOnlySubscriptions.map(sub =>
        this.createSubscription(sub).catch(error => {
          console.error(`Failed to upload subscription ${sub.name}:`, error)
          return sub // 如果上传失败，保留本地版本
        })
      )

      const uploadedSubscriptions = await Promise.all(uploadPromises)

      // 4. 合并云端数据和上传后的数据
      return [...cloudSubscriptions, ...uploadedSubscriptions]
    } catch (error) {
      console.error('Error syncing subscriptions:', error)
      // 如果同步失败，返回本地数据
      return localSubscriptions
    }
  }

  // 批量上传本地数据到云端
  static async uploadLocalSubscriptions(subscriptions: Subscription[]): Promise<Subscription[]> {
    try {
      const uploadPromises = subscriptions.map(async (sub) => {
        try {
          return await this.createSubscription(sub)
        } catch (error) {
          console.error(`Failed to upload subscription ${sub.name}:`, error)
          return sub // 保留原始数据
        }
      })

      return await Promise.all(uploadPromises)
    } catch (error) {
      console.error('Error uploading subscriptions:', error)
      return subscriptions
    }
  }

  // 数据格式转换：Supabase -> App
  private static transformFromSupabase(data: SupabaseSubscription): Subscription {
    return {
      id: data.id,
      name: data.name,
      category: data.category,
      amount: data.amount,
      currency: data.currency as any,
      period: data.period as any,
      lastPaymentDate: data.last_payment_date,
      nextPaymentDate: data.next_payment_date,
      customDate: data.custom_date
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
      custom_date: subscription.customDate || null
    }
  }

  // 检查用户是否在线
  static async isOnline(): Promise<boolean> {
    try {
      const { error } = await supabase.from('subscriptions').select('id').limit(1)
      return !error
    } catch {
      return false
    }
  }
}