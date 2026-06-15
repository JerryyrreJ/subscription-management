-- Production schema baseline captured from project uikhflwvhhgifvbuhebi.
-- Existing environments must mark this migration as applied; never execute it
-- against the production database that was used to create the baseline.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, nickname)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nickname', 'User'));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_notification_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE public.notification_delivery_locks (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  channel TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT notification_delivery_locks_pkey PRIMARY KEY (id),
  CONSTRAINT notification_delivery_locks_user_id_subscription_id_channel_key
    UNIQUE (user_id, subscription_id, channel, delivery_date)
);

CREATE TABLE public.payments (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  stripe_session_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  amount_total INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  product_type TEXT NOT NULL,
  customer_email TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_stripe_session_id_key UNIQUE (stripe_session_id)
);

CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'CNY' NOT NULL,
  period TEXT NOT NULL,
  last_payment_date DATE NOT NULL,
  next_payment_date DATE NOT NULL,
  custom_date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notification_enabled BOOLEAN DEFAULT TRUE,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_period_check CHECK (period IN ('monthly', 'yearly', 'custom'))
);

CREATE TABLE public.user_categories (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  "order" INTEGER DEFAULT 0 NOT NULL,
  is_built_in BOOLEAN DEFAULT FALSE NOT NULL,
  is_hidden BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_categories_pkey PRIMARY KEY (id),
  CONSTRAINT user_categories_user_id_category_id_key UNIQUE (user_id, category_id)
);

CREATE TABLE public.user_notification_settings (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID NOT NULL,
  bark_enabled BOOLEAN DEFAULT FALSE,
  bark_server_url TEXT DEFAULT 'https://api.day.app',
  bark_device_key TEXT DEFAULT '',
  bark_days_before INTEGER DEFAULT 3,
  bark_history JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  time_zone TEXT,
  CONSTRAINT user_notification_settings_pkey PRIMARY KEY (id),
  CONSTRAINT user_notification_settings_user_id_key UNIQUE (user_id)
);

CREATE TABLE public.user_profiles (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  user_id UUID,
  nickname TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_premium BOOLEAN DEFAULT FALSE,
  premium_activated_at TIMESTAMPTZ,
  premium_payment_id TEXT,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_user_id_key UNIQUE (user_id)
);

COMMENT ON TABLE public.notification_delivery_locks IS 'Bark 等通知渠道的每日去重发送锁';
COMMENT ON COLUMN public.notification_delivery_locks.channel IS '通知渠道，例如 bark';
COMMENT ON COLUMN public.notification_delivery_locks.delivery_date IS '通知去重日期，按 UTC 日期维度去重';
COMMENT ON TABLE public.payments IS 'Tracks all Stripe payment transactions';
COMMENT ON COLUMN public.payments.amount_total IS 'Payment amount in smallest currency unit (e.g., cents for USD)';
COMMENT ON COLUMN public.payments.status IS 'Payment status: completed, failed, or refunded';
COMMENT ON COLUMN public.payments.product_type IS 'Type of product purchased (e.g., premium_lifetime)';
COMMENT ON COLUMN public.subscriptions.notification_enabled IS '是否为该订阅启用通知提醒（默认 true）';
COMMENT ON TABLE public.user_notification_settings IS '用户通知设置表（简化版 - 只保留 Bark 推送）';
COMMENT ON COLUMN public.user_notification_settings.bark_history IS '存储已发送推送的记录，格式: {"subscription_id": "2024-01-01T00:00:00.000Z"}';
COMMENT ON COLUMN public.user_notification_settings.time_zone IS '用户通知计算时区，使用 IANA 时区标识，例如 Asia/Shanghai';

ALTER TABLE public.notification_delivery_locks
  ADD CONSTRAINT notification_delivery_locks_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public.notification_delivery_locks
  ADD CONSTRAINT notification_delivery_locks_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_categories
  ADD CONSTRAINT user_categories_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_notification_settings
  ADD CONSTRAINT user_notification_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_notification_delivery_locks_created_at ON public.notification_delivery_locks(created_at);
CREATE INDEX idx_notification_delivery_locks_lookup ON public.notification_delivery_locks(user_id, subscription_id, channel, delivery_date);
CREATE INDEX idx_notification_settings_bark_enabled ON public.user_notification_settings(bark_enabled) WHERE bark_enabled = TRUE;
CREATE INDEX idx_notification_settings_user_id ON public.user_notification_settings(user_id);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_stripe_session_id ON public.payments(stripe_session_id);
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_subscriptions_notification_enabled ON public.subscriptions(notification_enabled);
CREATE INDEX idx_subscriptions_user_notification ON public.subscriptions(user_id, notification_enabled);
CREATE INDEX idx_user_categories_order ON public.user_categories("order");
CREATE INDEX idx_user_categories_user_id ON public.user_categories(user_id);

CREATE TRIGGER notification_settings_updated_at
BEFORE UPDATE ON public.user_notification_settings
FOR EACH ROW EXECUTE FUNCTION public.update_notification_settings_updated_at();
CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_categories_updated_at
BEFORE UPDATE ON public.user_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.notification_delivery_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can insert payments" ON public.payments FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Service can update payments" ON public.payments FOR UPDATE USING (TRUE);
CREATE POLICY "Service role can manage notification delivery locks" ON public.notification_delivery_locks
  USING (auth.jwt()->>'role' = 'service_role') WITH CHECK (auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Service role can read all notification settings" ON public.user_notification_settings
  FOR SELECT USING (auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Service role can update all notification settings" ON public.user_notification_settings
  FOR UPDATE USING (auth.jwt()->>'role' = 'service_role');
CREATE POLICY "Users can delete own categories" ON public.user_categories FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own subscriptions" ON public.subscriptions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notification settings" ON public.user_notification_settings FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON public.user_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscriptions" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can insert their own notification settings" ON public.user_notification_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own profile" ON public.user_profiles USING (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON public.user_categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own subscriptions" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notification settings" ON public.user_notification_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own categories" ON public.user_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own notification settings" ON public.user_notification_settings FOR SELECT USING (auth.uid() = user_id);

GRANT ALL ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.update_notification_settings_updated_at() TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.notification_delivery_locks TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.payments TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.subscriptions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_categories TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_notification_settings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_profiles TO anon, authenticated, service_role;
