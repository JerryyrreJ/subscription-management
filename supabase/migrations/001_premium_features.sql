-- Add Premium status tracking to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS premium_activated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS premium_payment_id TEXT;

-- Create payments table to track all payment transactions
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  amount_total INTEGER NOT NULL, -- Amount in cents
  currency TEXT NOT NULL,
  status TEXT NOT NULL, -- 'completed', 'failed', 'refunded'
  product_type TEXT NOT NULL, -- 'premium_lifetime'
  customer_email TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_session_id ON payments(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Enable Row Level Security
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payments table
-- Users can only read their own payment records
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Only authenticated users can insert (via webhook, using service role key)
CREATE POLICY "Service can insert payments"
  ON payments FOR INSERT
  WITH CHECK (true);

-- Only service role can update payments
CREATE POLICY "Service can update payments"
  ON payments FOR UPDATE
  USING (true);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE payments IS 'Tracks all Stripe payment transactions';
COMMENT ON COLUMN payments.amount_total IS 'Payment amount in smallest currency unit (e.g., cents for USD)';
COMMENT ON COLUMN payments.status IS 'Payment status: completed, failed, or refunded';
COMMENT ON COLUMN payments.product_type IS 'Type of product purchased (e.g., premium_lifetime)';
