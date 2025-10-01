import { supabase } from '../lib/supabase'
import { Subscription } from '../types'
import { config } from '../lib/config'

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
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

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
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    const supabaseData = this.transformToSupabase(subscription)

    // 获取当前用户ID
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) {
      console.error('Auth error:', authError)
      throw new Error(`Authentication failed: ${authError.message}`)
    }
    if (!user) {
      console.error('No authenticated user found')
      throw new Error('User not authenticated')
    }
    console.log('Creating subscription for user:', user.id)

    const { data, error } = await supabase
      .from('subscriptions')
      .insert([{
        ...supabaseData,
        user_id: user.id
      }])
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
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting subscription:', error)
      throw error
    }
  }

  // 批量同步 - 纯下载模式（云端为准）
  static async syncSubscriptions(localSubscriptions: Subscription[]): Promise<Subscription[]> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    try {
      // 直接获取云端数据，以云端为权威数据源
      const cloudSubscriptions = await this.getSubscriptions()

      console.log(`Sync completed: ${cloudSubscriptions.length} subscriptions from cloud (authoritative)`)
      console.log(`Local data (${localSubscriptions.length} items) will be replaced by cloud data`)

      return cloudSubscriptions
    } catch (error) {
      console.error('Error syncing subscriptions:', error)
      // 如果同步失败，返回本地数据作为降级方案
      return localSubscriptions
    }
  }

  // 批量上传本地数据到云端（带去重检查）
  static async uploadLocalSubscriptions(subscriptions: Subscription[]): Promise<Subscription[]> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    try {
      // 获取当前用户ID
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      // 1. 获取云端现有数据进行去重检查
      const cloudSubscriptions = await this.getSubscriptions()

      // 2. 创建内容指纹，用于检测重复内容
      const createContentKey = (sub: Subscription) =>
        `${sub.name}-${sub.amount}-${sub.currency}-${sub.period}`

      // 3. 创建云端数据的内容映射
      const cloudContentKeys = new Set(cloudSubscriptions.map(createContentKey))
      const cloudIds = new Set(cloudSubscriptions.map(s => s.id))

      // 4. 过滤需要上传的订阅（避免重复）
      const subsToUpload = subscriptions.filter(sub => {
        const hasIdDuplicate = cloudIds.has(sub.id)
        const hasContentDuplicate = cloudContentKeys.has(createContentKey(sub))

        if (hasIdDuplicate) {
          console.log(`Skipping upload for ${sub.name}: ID already exists in cloud`)
          return false
        }

        if (hasContentDuplicate) {
          console.log(`Skipping upload for ${sub.name}: Content already exists in cloud`)
          return false
        }

        return true
      })

      console.log(`Uploading ${subsToUpload.length} unique local subscriptions`)

      // 5. 上传独有的订阅
      const uploadPromises = subsToUpload.map(async (sub) => {
        try {
          return await this.createSubscription(sub)
        } catch (error) {
          console.error(`Failed to upload subscription ${sub.name}:`, error)
          return sub // 保留原始数据
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

      return uniqueSubscriptions
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
      currency: data.currency as 'CNY' | 'USD' | 'EUR' | 'JPY' | 'GBP' | 'AUD' | 'CAD' | 'CHF' | 'HKD' | 'SGD',
      period: data.period as 'monthly' | 'yearly' | 'custom',
      lastPaymentDate: data.last_payment_date,
      nextPaymentDate: data.next_payment_date,
      customDate: data.custom_date,
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
      custom_date: subscription.customDate || null
    }
  }

  // 检查用户是否在线
  static async isOnline(): Promise<boolean> {
    if (!config.hasSupabaseConfig || !supabase) {
      return false
    }

    try {
      const { error } = await supabase.from('subscriptions').select('id').limit(1)
      return !error
    } catch {
      return false
    }
  }
}