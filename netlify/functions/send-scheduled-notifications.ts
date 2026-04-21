import { createClient } from '@supabase/supabase-js'
import { sendBarkNotification } from '../../src/utils/barkPush'
import { formatDateOnly, getTodayDateOnly, normalizeTimeZone } from '../../src/utils/dates'
import { cleanupNotificationHistoryEntries, mergeNotificationHistoryEntries, wasNotifiedToday } from '../../src/utils/notificationHistory'
import { buildSubscriptionReminderContent } from '../../src/utils/notificationContent'
import { DEFAULT_LOCALE } from '../../src/i18n/types'
import { normalizeLocale } from '../../src/utils/locale'
import { hasValidBarkConfig } from '../../src/utils/barkSettings'
import { resolveSubscriptionRenewal } from '../../src/utils/subscriptionRenewal'
import type { Config } from '@netlify/functions'

// Supabase 配置（使用 Service Role Key 绕过 RLS）
const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface Subscription {
  id: string
  user_id: string
  name: string
  amount: number
  currency: string
  period: string
  last_payment_date: string
  next_payment_date: string
  notification_enabled: boolean
  custom_date?: string
}

interface NotificationSettings {
  user_id: string
  bark_enabled: boolean
  time_zone?: string | null
  locale?: string | null
  bark_server_url: string
  bark_device_key: string
  bark_days_before: number
  bark_history: Record<string, string>
}

function buildUserLogContext(
  userId: string,
  details?: Record<string, string | number | boolean>
): string {
  const parts = [`user_id=${userId}`]

  Object.entries(details || {}).forEach(([key, value]) => {
    parts.push(`${key}=${String(value)}`)
  })

  return parts.join(' ')
}

function buildSubscriptionLogContext(
  userId: string,
  subscription: Pick<Subscription, 'id' | 'name'>,
  details?: Record<string, string | number | boolean>
): string {
  return buildUserLogContext(userId, {
    subscription_id: subscription.id,
    subscription_name: subscription.name,
    ...details
  })
}

function hasSameHistory(
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

async function reserveNotificationDelivery(
  userId: string,
  subscriptionId: string,
  deliveryDate: string
): Promise<boolean> {
  const { error } = await supabase
    .from('notification_delivery_locks')
    .insert({
      user_id: userId,
      subscription_id: subscriptionId,
      channel: 'bark',
      delivery_date: deliveryDate
    })

  if (!error) {
    return true
  }

  if (error.code === '23505') {
    return false
  }

  throw error
}

async function releaseNotificationDelivery(
  userId: string,
  subscriptionId: string,
  deliveryDate: string
): Promise<void> {
  const { error } = await supabase
    .from('notification_delivery_locks')
    .delete()
    .eq('user_id', userId)
    .eq('subscription_id', subscriptionId)
    .eq('channel', 'bark')
    .eq('delivery_date', deliveryDate)

  if (error) {
    throw error
  }
}

/**
 * Netlify Scheduled Function (v2 格式)
 * 每小时运行一次，检查所有用户的订阅并发送 Bark 推送
 */
export default async (req: Request): Promise<Response> => {
  console.log('[Scheduled Notifications] Starting notification check...', new Date().toISOString())

  // Parse scheduled event payload (optional, contains next_run timestamp)
  try {
    const body = await req.text()
    if (body) {
      const payload = JSON.parse(body)
      if (payload.next_run) {
        console.log('[Scheduled Notifications] Next scheduled run:', payload.next_run)
      }
    }
  } catch (e) {
    // Ignore parsing errors (e.g., when testing locally without payload)
  }

  try {
    // 1. 获取所有启用了 Bark 推送的用户
    const { data: notificationSettingsList, error: settingsError } = await supabase
      .from('user_notification_settings')
      .select('*')
      .eq('bark_enabled', true)

    if (settingsError) {
      console.error('[Scheduled Notifications] Error fetching notification settings:', settingsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch notification settings' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!notificationSettingsList || notificationSettingsList.length === 0) {
      console.log('[Scheduled Notifications] No users with Bark enabled')
      return new Response(
        JSON.stringify({ message: 'No users with notifications enabled' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Scheduled Notifications] Found ${notificationSettingsList.length} users with Bark enabled`)

    let totalNotificationsSent = 0
    let totalErrors = 0

    // 2. 遍历每个用户
    for (const settings of notificationSettingsList as NotificationSettings[]) {
      const { user_id, bark_server_url, bark_device_key, bark_days_before, bark_history } = settings
      const userTimeZone = normalizeTimeZone(settings.time_zone, 'UTC')
      const userLocale = normalizeLocale(settings.locale ?? DEFAULT_LOCALE)
      const barkDaysBeforeValid = [1, 3, 7, 14].includes(bark_days_before)

      console.log(`[Scheduled Notifications] Processing user ${buildUserLogContext(user_id)}`)
      console.log(`[Scheduled Notifications] User time zone ${buildUserLogContext(user_id, { time_zone: userTimeZone })}`)

      if (!hasValidBarkConfig({
        barkPush: {
          enabled: true,
          serverUrl: bark_server_url,
          deviceKey: bark_device_key,
          daysBefore: bark_days_before,
          notificationHistory: bark_history || {}
        }
      })) {
        console.error(`[Scheduled Notifications] Invalid Bark configuration, skipping user ${buildUserLogContext(user_id)}`)
        totalErrors++
        continue
      }

      if (!barkDaysBeforeValid) {
        console.error(`[Scheduled Notifications] Invalid bark_days_before, skipping user ${buildUserLogContext(user_id, { bark_days_before: bark_days_before })}`)
        totalErrors++
        continue
      }

      // 3. 获取该用户的所有启用了通知的订阅
      const { data: subscriptions, error: subscriptionsError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user_id)
        .eq('notification_enabled', true)

      if (subscriptionsError) {
        console.error(`[Scheduled Notifications] Error fetching subscriptions ${buildUserLogContext(user_id)}:`, subscriptionsError)
        totalErrors++
        continue
      }

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`[Scheduled Notifications] No subscriptions with notifications enabled ${buildUserLogContext(user_id)}`)
        continue
      }

      console.log(`[Scheduled Notifications] Found subscriptions ${buildUserLogContext(user_id, { count: subscriptions.length })}`)

      const updatedHistory = { ...cleanupNotificationHistoryEntries(bark_history || {}, userTimeZone) }
      const newHistoryEntries: Record<string, string> = {}
      let userNotificationsSent = 0

      // 4. 检查每个订阅
      for (const subscription of subscriptions as Subscription[]) {
        const renewal = resolveSubscriptionRenewal({
          lastPaymentDate: subscription.last_payment_date,
          nextPaymentDate: subscription.next_payment_date,
          period: subscription.period as Subscription['period'],
          customDate: subscription.custom_date
        }, userTimeZone)
        const renewedDate = renewal.effectiveNextPaymentDate
        const daysUntil = renewal.daysUntilEffectiveNextPayment

        // 🔍 调试日志: 输出每个订阅的详细信息
        console.log(`[Scheduled Notifications] Subscription evaluation ${buildSubscriptionLogContext(user_id, subscription, {
          stored_last_payment_date: renewal.storedLastPaymentDate,
          stored_next_payment_date: renewal.storedNextPaymentDate,
          effective_next_payment_date: renewedDate,
          days_until: daysUntil,
          bark_days_before: bark_days_before,
          notified_today: wasNotifiedToday(subscription.id, updatedHistory, userTimeZone),
          is_auto_renewed: renewal.isAutoRenewed
        })}`)

        // 跳过已过期或距离太远的订阅
        if (daysUntil < 0 || daysUntil > 14) {
          console.log(`[Scheduled Notifications] Skipping subscription outside reminder window ${buildSubscriptionLogContext(user_id, subscription, { days_until: daysUntil })}`)
          continue
        }

        // 检查是否需要发送推送
        if (daysUntil === bark_days_before && !wasNotifiedToday(subscription.id, updatedHistory, userTimeZone)) {
          console.log(`[Scheduled Notifications] Subscription matched reminder condition ${buildSubscriptionLogContext(user_id, subscription, { days_until: daysUntil })}`)
          console.log(`[Scheduled Notifications] Sending notification ${buildSubscriptionLogContext(user_id, subscription, { days_until: daysUntil })}`)

          const { title, body, group } = buildSubscriptionReminderContent(
            {
              id: subscription.id,
              name: subscription.name,
              category: '',
              amount: subscription.amount,
              currency: subscription.currency as Subscription['currency'],
              period: subscription.period as Subscription['period'],
              lastPaymentDate: renewedDate,
              nextPaymentDate: renewedDate,
              customDate: subscription.custom_date
            },
            daysUntil,
            userLocale
          )
          const deliveryDate = formatDateOnly(getTodayDateOnly(userTimeZone))
          let deliveryReserved = false

          try {
            const reserved = await reserveNotificationDelivery(user_id, subscription.id, deliveryDate)

            if (!reserved) {
              console.log(`[Scheduled Notifications] Delivery already reserved for today ${buildSubscriptionLogContext(user_id, subscription, { delivery_date: deliveryDate })}`)
              continue
            }

            deliveryReserved = true

            // 发送 Bark 推送
            const success = await sendBarkNotification(
                bark_server_url,
                bark_device_key,
                title,
                body,
                {
                  sound: 'bell',
                  group,
                  icon: 'https://i.ibb.co/Z6f84xFY/icon.png'
                }
              )

            if (success) {
              // 记录推送历史
              const sentAt = new Date().toISOString()
              updatedHistory[subscription.id] = sentAt
              newHistoryEntries[subscription.id] = sentAt
              userNotificationsSent++
              totalNotificationsSent++
              console.log(`[Scheduled Notifications] Successfully sent notification ${buildSubscriptionLogContext(user_id, subscription, { sent_at: sentAt })}`)
            } else {
              await releaseNotificationDelivery(user_id, subscription.id, deliveryDate)
              console.error(`[Scheduled Notifications] Failed to send notification ${buildSubscriptionLogContext(user_id, subscription, { delivery_date: deliveryDate })}`)
              totalErrors++
            }
          } catch (error) {
            if (deliveryReserved) {
              try {
                await releaseNotificationDelivery(user_id, subscription.id, deliveryDate)
              } catch (releaseError) {
                console.error(`[Scheduled Notifications] Error releasing delivery lock ${buildSubscriptionLogContext(user_id, subscription, { delivery_date: deliveryDate })}:`, releaseError)
              }
            }
            console.error(`[Scheduled Notifications] Error sending notification ${buildSubscriptionLogContext(user_id, subscription, { delivery_date: deliveryDate })}:`, error)
            totalErrors++
          }
        } else {
          // 不满足推送条件，输出原因
          if (daysUntil !== bark_days_before) {
            console.log(`[Scheduled Notifications] Subscription does not match reminder day ${buildSubscriptionLogContext(user_id, subscription, {
              days_until: daysUntil,
              bark_days_before: bark_days_before
            })}`)
          } else if (wasNotifiedToday(subscription.id, updatedHistory, userTimeZone)) {
            console.log(`[Scheduled Notifications] Subscription already notified today ${buildSubscriptionLogContext(user_id, subscription)}`)
          }
        }
      }

      // 5. 更新用户的推送历史记录
      const cleanedUpdatedHistory = mergeNotificationHistoryEntries(
        bark_history || {},
        newHistoryEntries,
        userTimeZone
      )
      if (userNotificationsSent > 0 || !hasSameHistory(bark_history || {}, cleanedUpdatedHistory)) {
        const { error: updateError } = await supabase
          .from('user_notification_settings')
          .update({ bark_history: cleanedUpdatedHistory })
          .eq('user_id', user_id)

        if (updateError) {
          console.error(`[Scheduled Notifications] Error updating notification history ${buildUserLogContext(user_id)}:`, updateError)
          totalErrors++
        } else {
          console.log(`[Scheduled Notifications] Updated notification history ${buildUserLogContext(user_id, { notifications_sent: userNotificationsSent })}`)
        }
      }
    }

    const summary = {
      message: 'Notification check completed',
      totalUsers: notificationSettingsList.length,
      totalNotificationsSent,
      totalErrors,
      timestamp: new Date().toISOString()
    }

    console.log('[Scheduled Notifications] Summary:', summary)

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Scheduled Notifications] Fatal error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Netlify Scheduled Function 配置 (v2 格式)
// 使用 Config 类型导出来定义执行频率
export const config: Config = {
  schedule: '@hourly' // 每小时运行一次
}
