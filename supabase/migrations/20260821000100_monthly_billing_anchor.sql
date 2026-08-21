-- Preserve the original day-of-month for monthly subscriptions so a short
-- month does not permanently move a Jan 30/31 subscription to the 28th.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_anchor_day SMALLINT;

UPDATE public.subscriptions
SET billing_anchor_day = GREATEST(
  EXTRACT(DAY FROM last_payment_date)::SMALLINT,
  EXTRACT(DAY FROM next_payment_date)::SMALLINT
)
WHERE period = 'monthly'
  AND billing_anchor_day IS NULL;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_anchor_day_check
  CHECK (
    (period = 'monthly' AND billing_anchor_day BETWEEN 1 AND 31)
    OR (period <> 'monthly' AND billing_anchor_day IS NULL)
  );

CREATE OR REPLACE FUNCTION public.normalize_subscription_billing_anchor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.period = 'monthly' THEN
    IF NEW.billing_anchor_day IS NULL THEN
      NEW.billing_anchor_day := EXTRACT(DAY FROM COALESCE(NEW.next_payment_date, NEW.last_payment_date));
    ELSIF TG_OP = 'UPDATE'
      AND NEW.last_payment_date IS DISTINCT FROM OLD.last_payment_date
      AND NEW.billing_anchor_day IS NOT DISTINCT FROM OLD.billing_anchor_day
    THEN
      -- Compatibility for older clients that still update last_payment_date.
      NEW.billing_anchor_day := EXTRACT(DAY FROM NEW.last_payment_date);
    END IF;
  ELSE
    NEW.billing_anchor_day := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER normalize_subscription_billing_anchor
BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.normalize_subscription_billing_anchor();

COMMENT ON COLUMN public.subscriptions.billing_anchor_day IS
  'Original day-of-month for monthly billing. Short months clamp temporarily and later return to this day.';

COMMENT ON COLUMN public.subscriptions.last_payment_date IS
  'Compatibility field derived from the authoritative next_payment_date and recurrence rule.';
