-- Preserve the minimum payment ledger when an Auth account is permanently deleted.
-- All other user-owned rows continue to use ON DELETE CASCADE.

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_user_id_fkey;

ALTER TABLE public.payments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.payments.user_id IS
  'Owning Auth user while the account exists. Set to NULL when the account is deleted so the payment ledger is retained.';

COMMENT ON COLUMN public.payments.customer_email IS
  'Payment email retained for financial reconciliation, refunds, disputes, and applicable record-keeping obligations.';
