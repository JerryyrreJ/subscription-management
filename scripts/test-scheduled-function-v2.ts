// Test script for Netlify Scheduled Function (v2 compatible)
// Usage: npx tsx scripts/test-scheduled-function-v2.ts

import { createClient } from '@supabase/supabase-js'
import { BARK_NOTIFICATION_ICON_URL, sendBarkNotification } from '../src/utils/barkPush'
import { buildSubscriptionReminderContent } from '../src/utils/notificationContent'
import { resolveSubscriptionRenewal } from '../src/utils/subscriptionRenewal'
import { isSubscriptionReminderEligible, isTrialSubscription } from '../src/utils/subscriptionReminder'
import type { Currency, Period } from '../src/types'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:')
  console.error('  - SUPABASE_URL (or VITE_SUPABASE_URL)')
  console.error('  - SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)')
  console.error('\nAdd these to .env.local file')
  process.exit(1)
}

console.log('🧪 Testing Scheduled Notification Function (v2)')
console.log('='.repeat(50))
console.log(`Supabase URL: ${supabaseUrl}`)
console.log('')

async function testNotificationLogic() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Test database connection
  console.log('[Step 1] Testing database connection...')
  const { error: testError } = await supabase
    .from('user_notification_settings')
    .select('count')

  if (testError) {
    console.error('❌ Database connection failed:', testError)
    return
  }
  console.log('✅ Database connection successful')
  console.log('')

  // 2. Get users with Bark enabled
  console.log('[Step 2] Fetching users with Bark enabled...')
  const { data: settings, error: settingsError } = await supabase
    .from('user_notification_settings')
    .select('*')
    .eq('bark_enabled', true)

  if (settingsError) {
    console.error('❌ Error fetching settings:', settingsError)
    return
  }

  console.log(`✅ Found ${settings?.length || 0} users with Bark enabled`)
  console.log('')

  if (!settings || settings.length === 0) {
    console.log('ℹ️  No users to test. Enable Bark in the app first.')
    return
  }

  // 3. Process each user
  for (const userSettings of settings) {
    console.log(`[Step 3] Processing user: ${userSettings.user_id}`)
    console.log(`  Bark Server: ${userSettings.bark_server_url}`)
    console.log(`  Days Before: ${userSettings.bark_days_before}`)

    // Get subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userSettings.user_id)
      .eq('notification_enabled', true)

    if (subError) {
      console.error('❌ Error fetching subscriptions:', subError)
      continue
    }

    console.log(`  Found ${subscriptions?.length || 0} subscriptions`)

    if (!subscriptions || subscriptions.length === 0) {
      console.log('  ℹ️  No subscriptions with notifications enabled')
      continue
    }

    // Check each subscription
    for (const sub of subscriptions) {
      if (!isSubscriptionReminderEligible({
        notification_enabled: sub.notification_enabled,
        status: sub.status,
      })) {
        console.log(`\n  📋 ${sub.name}`)
        console.log(`     ⏭️  Skip: status=${sub.status ?? 'active'} (paused/cancelled are not reminded)`)
        continue
      }

      const isTrial = isTrialSubscription(sub)
      const renewal = resolveSubscriptionRenewal({
        nextPaymentDate: sub.next_payment_date,
        period: sub.period,
        customDate: sub.custom_date,
        billingAnchorDay: sub.billing_anchor_day,
        isTrial,
        trialEndsOn: sub.trial_ends_on,
      })
      const daysUntil = renewal.daysUntilEffectiveNextPayment

      console.log(`\n  📋 ${sub.name}`)
      console.log(`     Kind: ${isTrial ? 'trial' : 'subscription'}`)
      console.log(`     Stored date: ${isTrial ? (sub.trial_ends_on || sub.next_payment_date) : sub.next_payment_date}`)
      if (renewal.isAutoRenewed) {
        console.log(`     Auto-renewed: ${renewal.effectiveNextPaymentDate}`)
      }
      console.log(`     Days Until: ${daysUntil}`)
      console.log(`     Should Remind: ${userSettings.bark_days_before} days before`)

      if (daysUntil === userSettings.bark_days_before) {
        console.log(`     ✅ MATCH! Would send notification`)

        console.log(`     Testing Bark push...`)
        const content = buildSubscriptionReminderContent(
          {
            id: sub.id,
            name: sub.name,
            category: '',
            amount: Number(sub.amount),
            currency: sub.currency as Currency,
            period: sub.period as Period,
            lastPaymentDate: renewal.effectiveLastPaymentDate,
            nextPaymentDate: renewal.effectiveNextPaymentDate,
            isTrial,
            trialEndsOn: sub.trial_ends_on,
          },
          daysUntil,
          userSettings.locale
        )

        const success = await sendBarkNotification(
          userSettings.bark_server_url,
          userSettings.bark_device_key,
          content.title,
          content.body,
          { sound: 'bell', group: content.group, icon: BARK_NOTIFICATION_ICON_URL }
        )

        if (success) {
          console.log(`     ✅ Bark push sent successfully`)
        } else {
          console.log(`     ❌ Bark push failed`)
        }
      } else {
        console.log(`     ⏭️  Skip: ${daysUntil} ≠ ${userSettings.bark_days_before}`)
      }
    }
  }

  console.log('')
  console.log('✅ Test completed')
}

testNotificationLogic().catch(console.error)
