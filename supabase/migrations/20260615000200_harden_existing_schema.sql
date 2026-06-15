-- Apply only after supabase/audit/preflight.sql returns zero rows.
-- This migration does not delete customer rows or silently repair invalid data.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en';

COMMENT ON COLUMN public.user_notification_settings.locale IS
  'Notification copy locale. Supported values: en and zh-CN.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_nickname TEXT := btrim(COALESCE(NEW.raw_user_meta_data->>'nickname', ''));
BEGIN
  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (
    NEW.id,
    CASE
      WHEN char_length(requested_nickname) BETWEEN 2 AND 30 THEN requested_nickname
      ELSE 'User'
    END
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
DROP TRIGGER IF EXISTS user_profiles_set_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_user_categories_updated_at ON public.user_categories;
DROP TRIGGER IF EXISTS user_categories_set_updated_at ON public.user_categories;
CREATE TRIGGER user_categories_set_updated_at
BEFORE UPDATE ON public.user_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS notification_settings_updated_at ON public.user_notification_settings;
DROP TRIGGER IF EXISTS notification_settings_set_updated_at ON public.user_notification_settings;
CREATE TRIGGER notification_settings_set_updated_at
BEFORE UPDATE ON public.user_notification_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP FUNCTION IF EXISTS public.update_notification_settings_updated_at();
DROP FUNCTION IF EXISTS public.update_updated_at_column();

ALTER TABLE public.user_profiles
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN is_premium SET NOT NULL;

ALTER TABLE public.subscriptions
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN notification_enabled SET NOT NULL;

ALTER TABLE public.user_categories
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.user_notification_settings
  ALTER COLUMN bark_enabled SET NOT NULL,
  ALTER COLUMN bark_server_url SET NOT NULL,
  ALTER COLUMN bark_device_key SET NOT NULL,
  ALTER COLUMN bark_days_before SET NOT NULL,
  ALTER COLUMN bark_history SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN locale SET NOT NULL;

ALTER TABLE public.notification_delivery_locks
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.payments
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_profiles'::regclass
      AND conname = 'user_profiles_nickname_valid'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_nickname_valid
      CHECK (char_length(btrim(nickname)) BETWEEN 2 AND 30) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_name_valid'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_name_valid
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 120) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_category_valid'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_category_valid
      CHECK (char_length(btrim(category)) BETWEEN 1 AND 80) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_amount_range'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_amount_range
      CHECK (amount >= 0 AND amount <= 999999.99 AND amount = round(amount, 2)) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_currency_allowed'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_currency_allowed
      CHECK (currency IN ('CNY', 'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_custom_period'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_custom_period
      CHECK (
        (period <> 'custom' AND custom_date IS NULL)
        OR (period = 'custom' AND custom_date ~ '^[1-9][0-9]*$')
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_notification_settings'::regclass
      AND conname = 'notification_locale_allowed'
  ) THEN
    ALTER TABLE public.user_notification_settings
      ADD CONSTRAINT notification_locale_allowed
      CHECK (locale IN ('en', 'zh-CN')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_notification_settings'::regclass
      AND conname = 'notification_days_allowed'
  ) THEN
    ALTER TABLE public.user_notification_settings
      ADD CONSTRAINT notification_days_allowed
      CHECK (bark_days_before IN (1, 3, 7, 14)) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_notification_settings'::regclass
      AND conname = 'notification_history_object'
  ) THEN
    ALTER TABLE public.user_notification_settings
      ADD CONSTRAINT notification_history_object
      CHECK (jsonb_typeof(bark_history) = 'object') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname = 'payments_amount_nonnegative'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_amount_nonnegative
      CHECK (amount_total >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname = 'payments_status_allowed'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_status_allowed
      CHECK (status IN ('completed', 'failed', 'refunded')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname = 'payments_product_type_allowed'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_product_type_allowed
      CHECK (product_type = 'premium_lifetime') NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.user_profiles VALIDATE CONSTRAINT user_profiles_nickname_valid;
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_name_valid;
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_category_valid;
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_amount_range;
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_currency_allowed;
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_custom_period;
ALTER TABLE public.user_notification_settings VALIDATE CONSTRAINT notification_locale_allowed;
ALTER TABLE public.user_notification_settings VALIDATE CONSTRAINT notification_days_allowed;
ALTER TABLE public.user_notification_settings VALIDATE CONSTRAINT notification_history_object;
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_amount_nonnegative;
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_status_allowed;
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_product_type_allowed;

DROP POLICY IF EXISTS "Service can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Service can update payments" ON public.payments;
DROP POLICY IF EXISTS "Service role can manage notification delivery locks" ON public.notification_delivery_locks;
DROP POLICY IF EXISTS "Service role can read all notification settings" ON public.user_notification_settings;
DROP POLICY IF EXISTS "Service role can update all notification settings" ON public.user_notification_settings;
DROP POLICY IF EXISTS "Users can delete own categories" ON public.user_categories;
DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can delete their own notification settings" ON public.user_notification_settings;
DROP POLICY IF EXISTS "Users can insert own categories" ON public.user_categories;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert their own notification settings" ON public.user_notification_settings;
DROP POLICY IF EXISTS "Users can manage own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own categories" ON public.user_categories;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own notification settings" ON public.user_notification_settings;
DROP POLICY IF EXISTS "Users can view own categories" ON public.user_categories;
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view their own notification settings" ON public.user_notification_settings;

DROP POLICY IF EXISTS user_profiles_select_own ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert_own ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_own ON public.user_profiles;
CREATE POLICY user_profiles_select_own ON public.user_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_profiles_insert_own ON public.user_profiles
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND is_premium = FALSE
    AND premium_activated_at IS NULL
    AND premium_payment_id IS NULL
  );
CREATE POLICY user_profiles_update_own ON public.user_profiles
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_insert_own ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_delete_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY subscriptions_insert_own ON public.subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY subscriptions_update_own ON public.subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY subscriptions_delete_own ON public.subscriptions
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_categories_select_own ON public.user_categories;
DROP POLICY IF EXISTS user_categories_insert_own ON public.user_categories;
DROP POLICY IF EXISTS user_categories_update_own ON public.user_categories;
DROP POLICY IF EXISTS user_categories_delete_own ON public.user_categories;
CREATE POLICY user_categories_select_own ON public.user_categories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_categories_insert_own ON public.user_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_categories_update_own ON public.user_categories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_categories_delete_own ON public.user_categories
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notification_settings_select_own ON public.user_notification_settings;
DROP POLICY IF EXISTS notification_settings_insert_own ON public.user_notification_settings;
DROP POLICY IF EXISTS notification_settings_update_own ON public.user_notification_settings;
DROP POLICY IF EXISTS notification_settings_delete_own ON public.user_notification_settings;
CREATE POLICY notification_settings_select_own ON public.user_notification_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notification_settings_insert_own ON public.user_notification_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY notification_settings_update_own ON public.user_notification_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY notification_settings_delete_own ON public.user_notification_settings
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS payments_select_own ON public.payments;
CREATE POLICY payments_select_own ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

REVOKE ALL PRIVILEGES ON public.notification_delivery_locks FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.payments FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.subscriptions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.user_categories FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.user_notification_settings FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.user_profiles FROM anon, authenticated;

GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_settings TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT INSERT (user_id, nickname) ON public.user_profiles TO authenticated;
GRANT UPDATE (nickname) ON public.user_profiles TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS user_categories_user_id_idx ON public.user_categories(user_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments(user_id);

CREATE OR REPLACE FUNCTION public.complete_premium_purchase(
  purchase_user_id UUID,
  purchase_stripe_session_id TEXT,
  purchase_payment_intent_id TEXT,
  purchase_customer_id TEXT,
  purchase_price_id TEXT,
  purchase_amount_total INTEGER,
  purchase_currency TEXT,
  purchase_customer_email TEXT,
  purchase_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  persisted_payment public.payments%ROWTYPE;
BEGIN
  IF purchase_user_id IS NULL
    OR NULLIF(btrim(purchase_stripe_session_id), '') IS NULL
    OR NULLIF(btrim(purchase_price_id), '') IS NULL
    OR purchase_amount_total IS NULL
    OR purchase_amount_total < 0
    OR NULLIF(btrim(purchase_currency), '') IS NULL
  THEN
    RAISE EXCEPTION 'Invalid premium purchase payload';
  END IF;

  INSERT INTO public.payments (
    user_id,
    stripe_session_id,
    stripe_payment_intent_id,
    stripe_customer_id,
    stripe_price_id,
    amount_total,
    currency,
    status,
    product_type,
    customer_email,
    metadata
  ) VALUES (
    purchase_user_id,
    purchase_stripe_session_id,
    purchase_payment_intent_id,
    purchase_customer_id,
    purchase_price_id,
    purchase_amount_total,
    lower(purchase_currency),
    'completed',
    'premium_lifetime',
    purchase_customer_email,
    COALESCE(purchase_metadata, '{}'::jsonb)
  )
  ON CONFLICT (stripe_session_id) DO NOTHING;

  SELECT *
  INTO persisted_payment
  FROM public.payments
  WHERE stripe_session_id = purchase_stripe_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premium payment could not be persisted';
  END IF;

  IF persisted_payment.user_id <> purchase_user_id
    OR persisted_payment.product_type <> 'premium_lifetime'
    OR persisted_payment.amount_total <> purchase_amount_total
    OR lower(persisted_payment.currency) <> lower(purchase_currency)
    OR (
      persisted_payment.stripe_price_id IS NOT NULL
      AND persisted_payment.stripe_price_id <> purchase_price_id
    )
  THEN
    RAISE EXCEPTION 'Stripe session is already associated with a different purchase';
  END IF;

  UPDATE public.payments
  SET stripe_price_id = COALESCE(stripe_price_id, purchase_price_id)
  WHERE id = persisted_payment.id;

  INSERT INTO public.user_profiles (
    user_id,
    nickname,
    is_premium,
    premium_activated_at,
    premium_payment_id
  ) VALUES (
    purchase_user_id,
    'User',
    TRUE,
    NOW(),
    purchase_stripe_session_id
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_premium = TRUE,
    premium_activated_at = COALESCE(
      public.user_profiles.premium_activated_at,
      EXCLUDED.premium_activated_at
    ),
    premium_payment_id = EXCLUDED.premium_payment_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_premium_purchase(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_premium_purchase(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, JSONB)
  TO service_role;
