// Test script for Netlify Scheduled Function (v2 compatible)
// Usage: npx tsx scripts/test-scheduled-function-v2.ts

import { createClient } from '@supabase/supabase-js'
import { sendBarkNotification } from '../src/utils/barkPush'

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:')
  console.error('  - VITE_SUPABASE_URL')
  console.error('  - SUPABASE_SERVICE_ROLE_KEY')
  console.error('\nAdd these to .env.local file')
  process.exit(1)
}

console.log('🧪 Testing Scheduled Notification Function (v2)')
console.log('='.repeat(50))
console.log(`Supabase URL: ${supabaseUrl}`)
console.log(`Service Key: ${supabaseServiceKey.substring(0, 20)}...`)
console.log('')

async function testNotificationLogic() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Test database connection
  console.log('[Step 1] Testing database connection...')
  const { data: testData, error: testError } = await supabase
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
      // 自动续费逻辑：如果订阅已过期，计算最新的续费日期
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      let nextPayment = new Date(sub.next_payment_date)
      nextPayment.setHours(0, 0, 0, 0)

      // 如果已过期，循环续费直到找到未来的日期
      while (nextPayment < today) {
        switch (sub.period) {
          case 'monthly':
            nextPayment.setMonth(nextPayment.getMonth() + 1)
            break
          case 'yearly':
            nextPayment.setFullYear(nextPayment.getFullYear() + 1)
            break
          case 'custom':
            if (sub.custom_date) {
              const customDays = parseInt(sub.custom_date)
              nextPayment.setDate(nextPayment.getDate() + customDays)
            }
            break
        }
      }

      const renewedDateStr = nextPayment.toISOString().split('T')[0]
      const daysUntil = Math.ceil(
        (nextPayment.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
      )

      console.log(`\n  📋 ${sub.name}`)
      console.log(`     Database Date: ${sub.next_payment_date}`)
      if (renewedDateStr !== sub.next_payment_date) {
        console.log(`     Auto-renewed: ${renewedDateStr}`)
      }
      console.log(`     Days Until: ${daysUntil}`)
      console.log(`     Should Remind: ${userSettings.bark_days_before} days before`)

      if (daysUntil === userSettings.bark_days_before) {
        console.log(`     ✅ MATCH! Would send notification`)

        // Test Bark push (optional)
        console.log(`     Testing Bark push...`)

        const periodText = sub.period === 'monthly' ? 'month' : sub.period === 'yearly' ? 'year' : sub.period
        const symbols: Record<string, string> = {
          CNY: '¥', USD: '$', EUR: '€', JPY: '¥', GBP: '£',
          AUD: 'A$', CAD: 'C$', CHF: 'CHF', HKD: 'HK$', SGD: 'S$'
        }
        const symbol = symbols[sub.currency] || sub.currency
        const amount = `${symbol}${sub.amount.toFixed(2)}`

        const success = await sendBarkNotification(
          userSettings.bark_server_url,
          userSettings.bark_device_key,
          'Subscription Manager',
          `${sub.name} expires in ${daysUntil} day${daysUntil > 1 ? 's' : ''}\n${amount}/${periodText}`,
          { sound: 'bell', group: 'Subscription Manager', icon: 'https://i.ibb.co/Z6f84xFY/icon.png' }
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
