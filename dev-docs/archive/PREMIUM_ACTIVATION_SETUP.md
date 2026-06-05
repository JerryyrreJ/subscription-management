# Premium Status Activation Setup Guide

This guide explains how to set up automatic Premium status activation when users complete payment via Stripe.

## Overview

When a user successfully completes payment through Stripe Checkout:
1. Stripe sends a webhook event to your Netlify Function
2. The webhook handler records the payment in the `payments` table
3. The webhook handler updates the user's `user_profiles` table to activate Premium status
4. User immediately gets access to Premium features

---

## Database Setup

### Step 1: Run SQL Migration

You need to run the SQL migration to add Premium tracking fields and create the payments table.

**Option A: Using Supabase Dashboard**

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `supabase/migrations/001_premium_features.sql`
4. Copy the entire content and paste it into the SQL Editor
5. Click **Run** to execute the migration

**Option B: Using Supabase CLI**

```bash
# Make sure you have Supabase CLI installed
npm install -g supabase

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Run the migration
supabase db push
```

### Step 2: Verify Database Schema

After running the migration, verify the following:

#### user_profiles table should have:
- `is_premium` (boolean, default: false)
- `premium_activated_at` (timestamp with time zone)
- `premium_payment_id` (text)

#### payments table should exist with columns:
- `id` (UUID, primary key)
- `user_id` (UUID, references auth.users)
- `stripe_session_id` (text, unique)
- `stripe_payment_intent_id` (text)
- `stripe_customer_id` (text)
- `amount_total` (integer, amount in cents)
- `currency` (text)
- `status` (text: 'completed', 'failed', 'refunded')
- `product_type` (text: 'premium_lifetime')
- `customer_email` (text)
- `metadata` (jsonb)
- `created_at` (timestamp)
- `updated_at` (timestamp)

You can verify by going to **Database → Tables** in Supabase Dashboard.

---

## Environment Variables Setup

### Step 3: Add Supabase Service Role Key to Netlify

The webhook needs admin-level access to update user profiles and create payment records.

1. Go to your Supabase project dashboard
2. Navigate to **Project Settings → API**
3. Copy the **service_role** key (⚠️ Keep this secret!)
4. Go to Netlify Dashboard → Your Site → **Site settings → Environment variables**
5. Add a new variable:
   - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: `eyJhbGc...` (your service role key)
   - **Scopes**: All scopes
   - ⚠️ **Mark as secret**: YES

### Required Environment Variables Summary

Your Netlify environment should now have these variables:

```bash
# Stripe (already configured)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
VITE_STRIPE_PRICE_ID=price_xxxxx
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Supabase (for cloud sync, already configured)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxx

# NEW: Supabase Service Role (for webhook admin operations)
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx  # ⚠️ Keep this secret!
```

---

## Deployment

### Step 4: Deploy Updated Code

1. Commit your changes:
```bash
git add .
git commit -m "Add Premium activation webhook handler"
git push origin main
```

2. Netlify will automatically deploy the updated webhook function

3. Verify deployment in Netlify Dashboard → **Deploys**

---

## Testing

### Step 5: Test Premium Activation Flow

#### Method 1: End-to-End Test (Recommended)

1. **Log in to your application** with a test user account
2. Click **"Upgrade Now"** on the pricing page
3. Complete payment using Stripe test card: `4242 4242 4242 4242`
4. You should be redirected back to your site
5. **Verify Premium status**:
   - Open Supabase Dashboard → **Database → Table Editor**
   - Check `user_profiles` table for your user:
     - `is_premium` should be `true`
     - `premium_activated_at` should have a timestamp
     - `premium_payment_id` should contain the Stripe session ID
   - Check `payments` table:
     - Should have a new record with status `'completed'`

#### Method 2: Webhook Testing with Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local Netlify function
stripe listen --forward-to https://your-app.netlify.app/.netlify/functions/stripe-webhook

# Trigger a test checkout.session.completed event
stripe trigger checkout.session.completed
```

### Step 6: Check Webhook Logs

**In Netlify:**
1. Go to **Functions** tab
2. Click on `stripe-webhook`
3. Check the logs for recent invocations
4. Look for success messages:
   - `"Payment recorded successfully: [payment-id]"`
   - `"Premium activated for user: [user-id]"`

**In Stripe Dashboard:**
1. Go to **Developers → Webhooks**
2. Click on your webhook endpoint
3. Check recent webhook events
4. Verify `checkout.session.completed` events were received successfully

---

## Troubleshooting

### Issue: Webhook returns 500 error

**Possible causes:**
- Missing `SUPABASE_SERVICE_ROLE_KEY` environment variable
- Incorrect Supabase URL or service role key
- Database tables not created (migration not run)

**Solution:**
- Check Netlify environment variables
- Verify database schema in Supabase
- Check Netlify Function logs for specific error messages

### Issue: Payment recorded but Premium not activated

**Possible causes:**
- User ID not passed in checkout session metadata
- RLS policies blocking the update
- User profile doesn't exist in `user_profiles` table

**Solution:**
- Check webhook logs for the userId value
- Verify RLS policies in Supabase
- Ensure user profile exists before payment

### Issue: Guest payments not working

**Expected behavior:**
- Guest payments (userId = 'guest') will not activate Premium status
- This is by design - users must create an account first
- Webhook will log: `"Guest payment - no user account to upgrade"`

**Solution:**
- Redirect users to login/signup before showing payment option
- Consider adding a user creation flow during checkout

---

## Payment Flow Diagram

```
User clicks "Upgrade Now"
       ↓
Create Checkout Session (Netlify Function)
   - Includes userId in metadata
       ↓
Redirect to Stripe Checkout
       ↓
User completes payment
       ↓
Stripe sends webhook: checkout.session.completed
       ↓
Webhook Handler (Netlify Function)
   1. Record payment in payments table
   2. Update user_profiles.is_premium = true
   3. Set premium_activated_at timestamp
       ↓
User now has Premium access
```

---

## Security Considerations

### Service Role Key Protection

⚠️ **NEVER commit the service role key to git!**

The service role key bypasses Row Level Security (RLS) policies and has full database access. It should:
- Only be stored in Netlify environment variables
- Never be exposed in frontend code
- Never be logged or displayed
- Be rotated periodically (every 3-6 months)

### Webhook Signature Verification

The webhook handler already includes signature verification:
```typescript
const stripeEvent = stripe.webhooks.constructEvent(
  event.body!,
  sig,
  webhookSecret
);
```

This ensures only genuine Stripe webhooks can trigger Premium activation.

---

## Next Steps

After successful setup, you can:

1. **Add email notifications** when Premium is activated
2. **Create a user dashboard** to show Premium status and payment history
3. **Implement refund handling** (update webhook for `charge.refunded` event)
4. **Add Premium feature gates** in your frontend based on `is_premium` flag

---

## Monitoring

### Track Premium Activations

Query to see all Premium users:
```sql
SELECT
  id,
  email,
  is_premium,
  premium_activated_at,
  premium_payment_id
FROM user_profiles
WHERE is_premium = true
ORDER BY premium_activated_at DESC;
```

### Track Payment History

Query to see all successful payments:
```sql
SELECT
  id,
  user_id,
  amount_total,
  currency,
  status,
  customer_email,
  created_at
FROM payments
ORDER BY created_at DESC;
```

---

## Support

If you encounter issues:
1. Check Netlify Function logs
2. Check Stripe webhook logs
3. Check Supabase Table Editor for data
4. Review this guide's Troubleshooting section

For Stripe-specific issues, refer to:
- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
