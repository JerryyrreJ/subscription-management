import { supabase } from '../lib/supabase'
import { ReminderSettings } from '../types'
import { config } from '../lib/config'

export interface SupabaseNotificationSettings {
  id: string
  user_id: string
  bark_enabled: boolean
  bark_server_url: string
  bark_device_key: string
  bark_days_before: number
  bark_history: Record<string, string>
  created_at: string
  updated_at: string
}

export class NotificationSettingsService {
  // 获取云端通知设置
  static async getSettings(): Promise<ReminderSettings | null> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    const { data, error } = await supabase
      .from('user_notification_settings')
      .select('*')
      .single()

    if (error) {
      // 如果记录不存在（404），返回 null
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Error fetching notification settings:', error)
      throw error
    }

    return this.transformFromSupabase(data)
  }

  // 保存/更新通知设置
  static async saveSettings(settings: ReminderSettings): Promise<ReminderSettings> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('User not authenticated')
    }

    const supabaseData = this.transformToSupabase(settings, user.id)

    // 使用 upsert 自动处理插入/更新
    const { data, error } = await supabase
      .from('user_notification_settings')
      .upsert(supabaseData, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      console.error('Error saving notification settings:', error)
      throw error
    }

    return this.transformFromSupabase(data)
  }

  // 更新推送历史记录（用于后端定时任务）
  static async updateHistory(subscriptionId: string, timestamp: string): Promise<void> {
    if (!config.hasSupabaseConfig || !supabase) {
      throw new Error('Cloud sync not available')
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw new Error('User not authenticated')
    }

    // 获取当前历史记录
    const settings = await this.getSettings()
    if (!settings) {
      throw new Error('Notification settings not found')
    }

    // 更新历史记录
    const updatedHistory = {
      ...settings.barkPush.notificationHistory,
      [subscriptionId]: timestamp
    }

    // 保存回云端
    const { error } = await supabase
      .from('user_notification_settings')
      .update({ bark_history: updatedHistory })
      .eq('user_id', user.id)

    if (error) {
      console.error('Error updating notification history:', error)
      throw error
    }
  }

  // 数据格式转换：Supabase -> App
  private static transformFromSupabase(data: SupabaseNotificationSettings): ReminderSettings {
    return {
      barkPush: {
        enabled: data.bark_enabled,
        serverUrl: data.bark_server_url,
        deviceKey: data.bark_device_key,
        daysBefore: data.bark_days_before,
        notificationHistory: data.bark_history || {}
      }
    }
  }

  // 数据格式转换：App -> Supabase
  private static transformToSupabase(settings: ReminderSettings, userId: string): Omit<SupabaseNotificationSettings, 'id' | 'created_at' | 'updated_at'> {
    return {
      user_id: userId,
      bark_enabled: settings.barkPush.enabled,
      bark_server_url: settings.barkPush.serverUrl,
      bark_device_key: settings.barkPush.deviceKey,
      bark_days_before: settings.barkPush.daysBefore,
      bark_history: settings.barkPush.notificationHistory || {}
    }
  }

  // 检查用户是否配置了通知设置
  static async hasSettings(): Promise<boolean> {
    if (!config.hasSupabaseConfig || !supabase) {
      return false
    }

    try {
      const { data, error } = await supabase
        .from('user_notification_settings')
        .select('id')
        .single()

      return !error && !!data
    } catch {
      return false
    }
  }
}
