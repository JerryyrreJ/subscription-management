import https from 'node:https'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BARK_NOTIFICATION_ICON_URL,
  sendBarkCiphertextNotification,
  sendBarkNotification,
  validateBarkConfig,
} from '../../src/utils/barkPush'
import {
  defaultDnsLookup,
  resolveValidatedBarkAddresses,
  sendPinnedBarkCiphertextNotification,
  sendPinnedBarkNotification,
  type DnsAddressLookup,
  type HttpsRequestFn,
} from './_shared/barkServerPush'
import { formatDateOnly, getTodayDateOnly, normalizeTimeZone } from '../../src/utils/dates'
import { cleanupNotificationHistoryEntries, mergeNotificationHistoryEntries, wasNotifiedToday } from '../../src/utils/notificationHistory'
import { buildSubscriptionReminderContent } from '../../src/utils/notificationContent'
import { DEFAULT_LOCALE } from '../../src/i18n/types'
import { normalizeLocale } from '../../src/utils/locale'
import { hasValidBarkConfig } from '../../src/utils/barkSettings'
import { resolveSubscriptionRenewal } from '../../src/utils/subscriptionRenewal'
import { isSubscriptionReminderEligible, isTrialSubscription } from '../../src/utils/subscriptionReminder'
import type { Currency, Period } from '../../src/types'
import type { Config } from '@netlify/functions'
import { getSupabaseAdminConfig } from './_shared/env'
import { createSupabaseAdminClient } from './_shared/supabase'
import { runtimeEnvironment } from './_shared/webHandler'

interface Subscription {
  id: string
  user_id: string
  name: string
  amount: number
  currency: string
  period: string
  last_payment_date: string
  next_payment_date: string
  billing_anchor_day?: number | null
  notification_enabled: boolean
  custom_date?: string
  status?: string | null
  is_trial?: boolean | null
  trial_ends_on?: string | null
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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

export type { DnsAddressLookup } from './_shared/barkServerPush'

export const createServerBarkSender = (
  resolveAddresses: DnsAddressLookup = defaultDnsLookup,
  sendPush?: typeof sendBarkNotification,
  requestImpl: HttpsRequestFn = https.request
): typeof sendBarkNotification => async (
  serverUrl,
  deviceKey,
  title,
  body,
  options,
  timeoutMs
) => {
  const validation = validateBarkConfig(serverUrl, deviceKey)
  if (!validation.valid) {
    console.error('[Scheduled Notifications] Blocked invalid Bark configuration before dispatch:', validation.error)
    return false
  }

  const resolved = await resolveValidatedBarkAddresses(serverUrl, resolveAddresses)
  if (!resolved) {
    return false
  }

  if (sendPush) {
    return sendPush(serverUrl, deviceKey, title, body, options, timeoutMs)
  }

  return sendPinnedBarkNotification(
    serverUrl,
    deviceKey,
    title,
    body,
    resolved.addresses,
    options,
    timeoutMs,
    requestImpl
  )
}

export const createServerBarkCiphertextSender = (
  resolveAddresses: DnsAddressLookup = defaultDnsLookup,
  sendCiphertext?: typeof sendBarkCiphertextNotification,
  requestImpl: HttpsRequestFn = https.request
): typeof sendBarkCiphertextNotification => async (
  serverUrl,
  deviceKey,
  ciphertext,
  iv,
  iconUrl,
  timeoutMs
) => {
  const validation = validateBarkConfig(serverUrl, deviceKey)
  if (!validation.valid) {
    console.error('[Scheduled Notifications] Blocked invalid Bark configuration before encrypted dispatch:', validation.error)
    return false
  }

  const resolved = await resolveValidatedBarkAddresses(serverUrl, resolveAddresses)
  if (!resolved) {
    return false
  }

  if (sendCiphertext) {
    return sendCiphertext(serverUrl, deviceKey, ciphertext, iv, iconUrl, timeoutMs)
  }

  return sendPinnedBarkCiphertextNotification(
    serverUrl,
    deviceKey,
    ciphertext,
    iv,
    resolved.addresses,
    iconUrl,
    timeoutMs,
    requestImpl
  )
}

interface EncryptedPushScheduleRow {
  id: string
  user_id: string
  subscription_hash: string
  trigger_date: string
  payload_mode: 'bark_ciphertext' | 'generic'
  bark_ciphertext: string | null
  bark_iv: string | null
  dispatched_at: string | null
}

function buildGenericEncryptedReminderCopy(locale: string): { title: string; body: string } {
  if (locale.toLowerCase().startsWith('zh')) {
    return {
      title: '订阅续费提醒',
      body: '您有一项端到端加密订阅即将续费，请打开 SteadyRenew 查看详情。',
    }
  }
  return {
    title: 'Subscription Renewal Reminder',
    body: 'One of your encrypted subscriptions is due soon. Open SteadyRenew to review details.',
  }
}

export interface ScheduledNotificationsDependencies {
  createSupabase?: () => SupabaseClient
  sendNotification?: typeof sendBarkNotification
  sendCiphertextNotification?: typeof sendBarkCiphertextNotification
}

/**
 * Netlify Scheduled Function (v2 格式)
 * 每小时运行一次，检查所有用户的订阅并发送 Bark 推送
 */
export const createScheduledNotificationsHandler = (
  dependencies: ScheduledNotificationsDependencies = {}
) => async (req: Request): Promise<Response> => {
  console.log('[Scheduled Notifications] Starting notification check...', new Date().toISOString())

  const getSupabase = dependencies.createSupabase
    ?? (() => createSupabaseAdminClient(getSupabaseAdminConfig(runtimeEnvironment)))
  const deliverBarkNotification = dependencies.sendNotification ?? createServerBarkSender()
  const deliverBarkCiphertext = dependencies.sendCiphertextNotification ?? createServerBarkCiphertextSender()

  let supabase: SupabaseClient
  try {
    supabase = getSupabase()
  } catch {
    console.error('[Scheduled Notifications] Missing or incomplete Supabase server configuration')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Parse scheduled event payload (optional, contains next_run timestamp)
  try {
    const body = await req.text()
    if (body) {
      const payload = JSON.parse(body)
      if (payload.next_run) {
        console.log('[Scheduled Notifications] Next scheduled run:', payload.next_run)
      }
    }
  } catch {
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
      const storedTimeZone = settings.time_zone
      const userTimeZone = normalizeTimeZone(storedTimeZone, 'UTC')
      const timeZoneSource = storedTimeZone && storedTimeZone === userTimeZone ? 'cloud' : 'fallback_utc'
      const userLocale = normalizeLocale(settings.locale ?? DEFAULT_LOCALE)
      const barkDaysBeforeValid = [1, 3, 7, 14].includes(bark_days_before)

      console.log(`[Scheduled Notifications] Processing user ${buildUserLogContext(user_id)}`)
      console.log(`[Scheduled Notifications] User time zone ${buildUserLogContext(user_id, {
        stored_time_zone: storedTimeZone ?? 'null',
        effective_time_zone: userTimeZone,
        time_zone_source: timeZoneSource
      })}`)

      if (timeZoneSource === 'fallback_utc') {
        console.warn(`[Scheduled Notifications] Falling back to UTC because user time zone is missing or invalid ${buildUserLogContext(user_id, {
          stored_time_zone: storedTimeZone ?? 'null'
        })}`)
      }

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
        // Check E2EE account bark_mode before dispatching encrypted push schedules
        const { data: e2eeAccount, error: e2eeAccountError } = await supabase
          .from('e2ee_accounts')
          .select('bark_mode')
          .eq('user_id', user_id)
          .maybeSingle<{ bark_mode: string }>()

        if (e2eeAccountError) {
          const code = (e2eeAccountError as { code?: string }).code ?? ''
          const msg = e2eeAccountError.message ?? ''
          if (code !== '42P01' && code !== 'PGRST205' && !msg.includes('Unexpected query:')) {
            console.error(`[Scheduled Notifications] Error fetching E2EE account mode ${buildUserLogContext(user_id)}:`, e2eeAccountError)
            totalErrors++
            continue
          }
        } else if (e2eeAccount?.bark_mode === 'off') {
          console.log(`[Scheduled Notifications] Skipping encrypted schedules because E2EE bark_mode is off ${buildUserLogContext(user_id)}`)
          continue
        }

        // Check pre-computed encrypted push schedules for E2EE accounts
        const userToday = formatDateOnly(getTodayDateOnly(userTimeZone))
        const { data: encryptedSchedules, error: encryptedError } = await supabase
          .from('encrypted_push_schedules')
          .select('*')
          .eq('user_id', user_id)
          .eq('trigger_date', userToday)
          .is('dispatched_at', null)

        if (encryptedError) {
          const code = (encryptedError as { code?: string }).code ?? ''
          const msg = encryptedError.message ?? ''
          if (code !== '42P01' && code !== 'PGRST205' && !msg.includes('Unexpected query:')) {
            console.error(`[Scheduled Notifications] Error fetching encrypted push schedules ${buildUserLogContext(user_id)}:`, encryptedError)
            totalErrors++
          }
          continue
        }

        if (!encryptedSchedules || encryptedSchedules.length === 0) {
          console.log(`[Scheduled Notifications] No subscriptions with notifications enabled ${buildUserLogContext(user_id)}`)
          continue
        }

        for (const schedule of encryptedSchedules as EncryptedPushScheduleRow[]) {
          const claimedAt = new Date().toISOString()
          const { data: claimedSchedule, error: claimError } = await supabase
            .from('encrypted_push_schedules')
            .update({ dispatched_at: claimedAt })
            .eq('id', schedule.id)
            .is('dispatched_at', null)
            .select('id')
            .maybeSingle()

          if (claimError) {
            console.error(`[Scheduled Notifications] Failed to reserve encrypted schedule ${schedule.id}:`, claimError)
            totalErrors++
            continue
          }

          if (!claimedSchedule) {
            console.log(`[Scheduled Notifications] Encrypted schedule already claimed by another worker: ${schedule.id}`)
            continue
          }

          let delivered = false
          try {
            if (
              schedule.payload_mode === 'bark_ciphertext'
              && schedule.bark_ciphertext
              && schedule.bark_iv
            ) {
              delivered = await deliverBarkCiphertext(
                bark_server_url,
                bark_device_key,
                schedule.bark_ciphertext,
                schedule.bark_iv,
                BARK_NOTIFICATION_ICON_URL
              )
            } else {
              const genericCopy = buildGenericEncryptedReminderCopy(userLocale)
              delivered = await deliverBarkNotification(
                bark_server_url,
                bark_device_key,
                genericCopy.title,
                genericCopy.body,
                {
                  sound: 'bell',
                  group: 'SteadyRenew',
                  icon: BARK_NOTIFICATION_ICON_URL,
                }
              )
            }
          } catch (dispatchError) {
            console.error(`[Scheduled Notifications] Error dispatching encrypted schedule ${schedule.id}:`, dispatchError)
            delivered = false
          }

          if (delivered) {
            totalNotificationsSent++
          } else {
            totalErrors++
            const { error: releaseError } = await supabase
              .from('encrypted_push_schedules')
              .update({ dispatched_at: null })
              .eq('id', schedule.id)
              .eq('dispatched_at', claimedAt)
            if (releaseError) {
              console.error(`[Scheduled Notifications] Failed to release encrypted schedule claim ${schedule.id}:`, releaseError)
            }
          }
        }
        continue
      }

      console.log(`[Scheduled Notifications] Found subscriptions ${buildUserLogContext(user_id, { count: subscriptions.length })}`)

      const updatedHistory = { ...cleanupNotificationHistoryEntries(bark_history || {}, userTimeZone) }
      const newHistoryEntries: Record<string, string> = {}
      let userNotificationsSent = 0

      // 4. 检查每个订阅
      for (const subscription of subscriptions as Subscription[]) {
        if (!isSubscriptionReminderEligible({
          notification_enabled: subscription.notification_enabled,
          status: subscription.status
        })) {
          console.log(`[Scheduled Notifications] Skipping inactive subscription ${buildSubscriptionLogContext(user_id, subscription, {
            status: subscription.status ?? 'active',
            notification_enabled: subscription.notification_enabled
          })}`)
          continue
        }

        const isTrial = isTrialSubscription(subscription)
        const renewal = resolveSubscriptionRenewal({
          nextPaymentDate: subscription.next_payment_date,
          period: subscription.period as Period,
          customDate: subscription.custom_date,
          billingAnchorDay: subscription.billing_anchor_day ?? undefined,
          isTrial,
          trialEndsOn: subscription.trial_ends_on ?? undefined
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
          is_auto_renewed: renewal.isAutoRenewed,
          is_trial: isTrial,
          trial_ends_on: subscription.trial_ends_on ?? 'null'
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
              currency: subscription.currency as Currency,
              period: subscription.period as Period,
              lastPaymentDate: renewal.effectiveLastPaymentDate,
              nextPaymentDate: renewedDate,
              billingAnchorDay: subscription.billing_anchor_day ?? undefined,
              customDate: subscription.custom_date,
              isTrial,
              trialEndsOn: subscription.trial_ends_on ?? undefined
            },
            daysUntil,
            userLocale
          )
          const deliveryDate = formatDateOnly(getTodayDateOnly(userTimeZone))
          let deliveryReserved = false

          try {
            const reserved = await reserveNotificationDelivery(supabase, user_id, subscription.id, deliveryDate)

            if (!reserved) {
              console.log(`[Scheduled Notifications] Delivery already reserved for today ${buildSubscriptionLogContext(user_id, subscription, { delivery_date: deliveryDate })}`)
              continue
            }

            deliveryReserved = true

            // 发送 Bark 推送
            const success = await deliverBarkNotification(
                bark_server_url,
                bark_device_key,
                title,
                body,
                {
                  sound: 'bell',
                  group,
                  icon: BARK_NOTIFICATION_ICON_URL
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
              await releaseNotificationDelivery(supabase, user_id, subscription.id, deliveryDate)
              console.error(`[Scheduled Notifications] Failed to send notification ${buildSubscriptionLogContext(user_id, subscription, { delivery_date: deliveryDate })}`)
              totalErrors++
            }
          } catch (error) {
            if (deliveryReserved) {
              try {
                await releaseNotificationDelivery(supabase, user_id, subscription.id, deliveryDate)
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
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export default createScheduledNotificationsHandler()

// Netlify Scheduled Function 配置 (v2 格式)
// 使用 Config 类型导出来定义执行频率
export const config: Config = {
  schedule: '@hourly' // 每小时运行一次
}
