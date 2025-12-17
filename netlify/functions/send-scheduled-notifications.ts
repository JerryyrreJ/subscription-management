import { createClient } from '@supabase/supabase-js'
import { sendBarkNotification } from '../../src/utils/barkPush'

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
  next_payment_date: string
  notification_enabled: boolean
}

interface NotificationSettings {
  user_id: string
  bark_enabled: boolean
  bark_server_url: string
  bark_device_key: string
  bark_days_before: number
  bark_history: Record<string, string>
}

/**
 * 计算距离下次付款的天数
 */
function getDaysUntilPayment(nextPaymentDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const paymentDate = new Date(nextPaymentDate)
  paymentDate.setHours(0, 0, 0, 0)

  const diffTime = paymentDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

/**
 * 检查今天是否已经推送过该订阅
 */
function wasNotifiedToday(
  subscriptionId: string,
  notificationHistory: Record<string, string>
): boolean {
  const lastNotificationDate = notificationHistory[subscriptionId]
  if (!lastNotificationDate) {
    return false
  }

  const today = new Date().toDateString()
  const lastDate = new Date(lastNotificationDate).toDateString()

  return today === lastDate
}

/**
 * 格式化货币显示
 */
function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = {
    CNY: '¥',
    USD: '$',
    EUR: '€',
    JPY: '¥',
    GBP: '£',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'CHF',
    HKD: 'HK$',
    SGD: 'S$'
  }

  const symbol = symbols[currency] || currency
  return `${symbol}${amount.toFixed(2)}`
}

/**
 * Netlify Scheduled Function
 * 每小时运行一次，检查所有用户的订阅并发送 Bark 推送
 */
export default async () => {
  console.log('[Scheduled Notifications] Starting notification check...', new Date().toISOString())

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

      console.log(`[Scheduled Notifications] Processing user: ${user_id}`)

      // 3. 获取该用户的所有启用了通知的订阅
      const { data: subscriptions, error: subscriptionsError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user_id)
        .eq('notification_enabled', true)

      if (subscriptionsError) {
        console.error(`[Scheduled Notifications] Error fetching subscriptions for user ${user_id}:`, subscriptionsError)
        totalErrors++
        continue
      }

      if (!subscriptions || subscriptions.length === 0) {
        console.log(`[Scheduled Notifications] No subscriptions with notifications enabled for user ${user_id}`)
        continue
      }

      console.log(`[Scheduled Notifications] Found ${subscriptions.length} subscriptions for user ${user_id}`)

      const updatedHistory = { ...bark_history }
      let userNotificationsSent = 0

      // 4. 检查每个订阅
      for (const subscription of subscriptions as Subscription[]) {
        const daysUntil = getDaysUntilPayment(subscription.next_payment_date)

        // 跳过已过期或距离太远的订阅
        if (daysUntil < 0 || daysUntil > 14) {
          continue
        }

        // 检查是否需要发送推送
        if (daysUntil === bark_days_before && !wasNotifiedToday(subscription.id, bark_history)) {
          console.log(`[Scheduled Notifications] Sending notification for subscription: ${subscription.name} (${daysUntil} days until renewal)`)

          const title = 'Subscription Manager'
          const periodText = subscription.period === 'monthly' ? 'month' : subscription.period === 'yearly' ? 'year' : subscription.period
          const body = `${subscription.name} expires in ${daysUntil} day${daysUntil > 1 ? 's' : ''}\n${formatCurrency(subscription.amount, subscription.currency)}/${periodText}`

          try {
            // 发送 Bark 推送
            const success = await sendBarkNotification(
              bark_server_url,
              bark_device_key,
              title,
              body,
              {
                sound: 'bell',
                group: 'Subscription Manager',
                icon: 'https://i.ibb.co/Z6f84xFY/icon.png'
              }
            )

            if (success) {
              // 记录推送历史
              updatedHistory[subscription.id] = new Date().toISOString()
              userNotificationsSent++
              totalNotificationsSent++
              console.log(`[Scheduled Notifications] Successfully sent notification for: ${subscription.name}`)
            } else {
              console.error(`[Scheduled Notifications] Failed to send notification for: ${subscription.name}`)
              totalErrors++
            }
          } catch (error) {
            console.error(`[Scheduled Notifications] Error sending notification for ${subscription.name}:`, error)
            totalErrors++
          }
        }
      }

      // 5. 更新用户的推送历史记录
      if (userNotificationsSent > 0) {
        const { error: updateError } = await supabase
          .from('user_notification_settings')
          .update({ bark_history: updatedHistory })
          .eq('user_id', user_id)

        if (updateError) {
          console.error(`[Scheduled Notifications] Error updating notification history for user ${user_id}:`, updateError)
          totalErrors++
        } else {
          console.log(`[Scheduled Notifications] Updated notification history for user ${user_id}`)
        }
      }
    }

    // 6. 清理过期的通知历史（超过 30 天）
    console.log('[Scheduled Notifications] Cleaning up old notification history...')
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    for (const settings of notificationSettingsList as NotificationSettings[]) {
      const { user_id, bark_history } = settings
      const cleanedHistory: Record<string, string> = {}

      Object.entries(bark_history || {}).forEach(([id, dateStr]) => {
        const date = new Date(dateStr)
        if (date >= thirtyDaysAgo) {
          cleanedHistory[id] = dateStr
        }
      })

      if (Object.keys(cleanedHistory).length !== Object.keys(bark_history || {}).length) {
        await supabase
          .from('user_notification_settings')
          .update({ bark_history: cleanedHistory })
          .eq('user_id', user_id)

        console.log(`[Scheduled Notifications] Cleaned up old history for user ${user_id}`)
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

// Netlify Scheduled Function 配置
// 导出 schedule 字符串来定义执行频率
export const schedule = '@hourly' // 每小时运行一次
