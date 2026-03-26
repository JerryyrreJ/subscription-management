export const MAX_SUBSCRIPTION_AMOUNT = 999999.99;

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

export const validateSubscriptionAmount = (amountValue: string): string | null => {
 const trimmedAmount = amountValue.trim();

 if (!trimmedAmount) {
  return 'Amount is required';
 }

 if (!AMOUNT_PATTERN.test(trimmedAmount)) {
  return 'Amount must be a valid number with up to 2 decimal places';
 }

 const amount = Number(trimmedAmount);

 if (!Number.isFinite(amount)) {
  return 'Amount must be a finite number';
 }

 if (amount < 0) {
  return 'Amount cannot be negative';
 }

 if (amount > MAX_SUBSCRIPTION_AMOUNT) {
  return `Amount cannot exceed ${MAX_SUBSCRIPTION_AMOUNT}`;
 }

 return null;
};
