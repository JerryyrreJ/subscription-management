import { supabase } from '../lib/supabase'
import { ReminderSettings } from '../types'
import { config } from '../lib/config'
import { cleanupNotificationHistory } from '../utils/notificationChecker'
import { getCurrentTimeZone, normalizeTimeZone } from '../utils/dates'
import { getCurrentLocale, normalizeLocale } from '../utils/locale'
import { buildNotificationContextPayload, buildNotificationSettingsConfigPayload, NotificationSettingsConfigPayload } from '../utils/notificationSettingsPayload'
import { scopeNotificationSettingsQueryToUser } from '../utils/notificationSettingsTenantScope'

export interface SupabaseNotificationSettings {
 id: string
 user_id: string
 bark_enabled: boolean
 time_zone: string | null
 locale: string | null
 bark_server_url: string
 bark_device_key: string
 bark_days_before: number
 bark_history: Record<string, string>
 created_at: string
 updated_at: string
}

export class NotificationSettingsService {
 private static async getAuthenticatedUserId(expectedUserId?: string): Promise<string> {
  if (!supabase) {
   throw new Error('Cloud sync not available')
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
   throw new Error('User not authenticated')
  }

  if (expectedUserId && user.id !== expectedUserId) {
   throw new Error('Authenticated user changed during notification settings operation')
  }

  return user.id
 }

 // 获取云端通知设置
 static async getSettings(expectedUserId?: string): Promise<ReminderSettings | null> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const userId = await NotificationSettingsService.getAuthenticatedUserId(expectedUserId)
  const selectQuery = supabase
   .from('user_notification_settings')
   .select('*')
  const { data, error } = await scopeNotificationSettingsQueryToUser(selectQuery, userId).single()

  if (error) {
   // 如果记录不存在（404），返回 null
   if (error.code === 'PGRST116') {
    return null
   }
   console.error('Error fetching notification settings:', error)
   throw error
  }

  const settings = cleanupNotificationHistory(NotificationSettingsService.transformFromSupabase(data))

  if (!NotificationSettingsService.hasSameHistory(data.bark_history || {}, settings.barkPush.notificationHistory)) {
   await NotificationSettingsService.persistHistory(userId, settings.barkPush.notificationHistory)
  }

  if (data.time_zone !== settings.timeZone) {
   await NotificationSettingsService.persistTimeZone(userId, settings.timeZone)
  }

  if (normalizeLocale(data.locale) !== settings.locale) {
   await NotificationSettingsService.persistLocale(userId, settings.locale || getCurrentLocale())
  }

  return settings
 }

 // Automatic locale/time-zone sync must never overwrite API-managed preferences.
 static async updateContext(
  context: { locale?: string; timeZone?: string },
  expectedUserId?: string
 ): Promise<void> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const userId = await NotificationSettingsService.getAuthenticatedUserId(expectedUserId)
  const payload = buildNotificationContextPayload(context)
  if (Object.keys(payload).length === 0) return
  const { error } = await scopeNotificationSettingsQueryToUser(
   supabase
    .from('user_notification_settings')
    .update(payload),
   userId
  )
  if (error) throw error
 }

 // 保存/更新通知设置
 static async saveSettings(settings: ReminderSettings, expectedUserId?: string): Promise<ReminderSettings> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const userId = await NotificationSettingsService.getAuthenticatedUserId(expectedUserId)

  const cleanedSettings = cleanupNotificationHistory(settings)
  const supabaseData: NotificationSettingsConfigPayload = buildNotificationSettingsConfigPayload(cleanedSettings, userId)

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

  return cleanupNotificationHistory(NotificationSettingsService.transformFromSupabase(data))
 }

 // 更新推送历史记录（用于后端定时任务）
 static async updateHistory(subscriptionId: string, timestamp: string, expectedUserId?: string): Promise<void> {
  if (!config.hasSupabaseConfig || !supabase) {
   throw new Error('Cloud sync not available')
  }

  const userId = await NotificationSettingsService.getAuthenticatedUserId(expectedUserId)

  // 获取当前历史记录
  const settings = await NotificationSettingsService.getSettings(userId)
  if (!settings) {
   throw new Error('Notification settings not found')
  }

  // 更新历史记录
  const updatedSettings = cleanupNotificationHistory({
   ...settings,
   barkPush: {
    ...settings.barkPush,
    notificationHistory: {
     ...settings.barkPush.notificationHistory,
     [subscriptionId]: timestamp
    }
   }
  })

  await NotificationSettingsService.persistHistory(userId, updatedSettings.barkPush.notificationHistory)
 }

 // 数据格式转换：Supabase -> App
 private static transformFromSupabase(data: SupabaseNotificationSettings): ReminderSettings {
  return {
   timeZone: normalizeTimeZone(data.time_zone, getCurrentTimeZone()),
   locale: normalizeLocale(data.locale ?? getCurrentLocale()),
   barkPush: {
    enabled: data.bark_enabled,
    serverUrl: data.bark_server_url,
    deviceKey: data.bark_device_key,
    daysBefore: data.bark_days_before,
    notificationHistory: data.bark_history || {}
   }
  }
 }

 private static async persistLocale(userId: string, locale: string): Promise<void> {
  await NotificationSettingsService.getAuthenticatedUserId(userId)
  if (!supabase) {
   throw new Error('Cloud sync not available')
  }

  const { error } = await scopeNotificationSettingsQueryToUser(
   supabase
    .from('user_notification_settings')
    .update({ locale: normalizeLocale(locale) }),
   userId
  )

  if (error) {
   console.error('Error updating notification locale:', error)
   throw error
  }
 }

 private static hasSameHistory(
  left: Record<string, string>,
  right: Record<string, string>
 ): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
   return false
  }

  return leftKeys.every(key => left[key] === right[key])
 }

 private static async persistTimeZone(userId: string, timeZone: string): Promise<void> {
  await NotificationSettingsService.getAuthenticatedUserId(userId)
  if (!supabase) {
   throw new Error('Cloud sync not available')
  }

  const { error } = await scopeNotificationSettingsQueryToUser(
   supabase
    .from('user_notification_settings')
    .update({ time_zone: timeZone }),
   userId
  )

  if (error) {
   console.error('Error updating notification time zone:', error)
   throw error
  }
 }

 private static async persistHistory(userId: string, history: Record<string, string>): Promise<void> {
  await NotificationSettingsService.getAuthenticatedUserId(userId)
  if (!supabase) {
   throw new Error('Cloud sync not available')
  }

  const { error } = await scopeNotificationSettingsQueryToUser(
   supabase
    .from('user_notification_settings')
    .update({ bark_history: history }),
   userId
  )

  if (error) {
   console.error('Error updating notification history:', error)
   throw error
  }
 }

 // 检查用户是否配置了通知设置
 static async hasSettings(expectedUserId?: string): Promise<boolean> {
  if (!config.hasSupabaseConfig || !supabase) {
   return false
  }

  try {
   const userId = await NotificationSettingsService.getAuthenticatedUserId(expectedUserId)
   const existsQuery = supabase
    .from('user_notification_settings')
    .select('id')
   const { data, error } = await scopeNotificationSettingsQueryToUser(existsQuery, userId).single()

   return !error && !!data
  } catch {
   return false
  }
 }
}
