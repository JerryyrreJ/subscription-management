-- Free-trial expiry reminders: one-shot trial end / first-charge date that is
-- not advanced by monthly/yearly auto-renew the way next_payment_date is.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_on DATE;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_trial_ends_on_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_trial_ends_on_check
  CHECK (
    (is_trial = false AND trial_ends_on IS NULL)
    OR (is_trial = true AND trial_ends_on IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS subscriptions_user_trial_idx
  ON public.subscriptions(user_id, is_trial)
  WHERE is_trial = true;

COMMENT ON COLUMN public.subscriptions.is_trial IS
  'True when this record is a free trial rather than a recurring paid subscription.';

COMMENT ON COLUMN public.subscriptions.trial_ends_on IS
  'One-shot trial end / first-charge date. Not advanced by monthly/yearly auto-renew.';
