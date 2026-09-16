import type { TFunction } from 'i18next';
import { MAX_SUBSCRIPTION_AMOUNT } from './subscriptionValidation';

export function translateSubscriptionFormError(message: string, t: TFunction): string {
 if (message === 'Amount is required') {
  return t('addSubscription:amountRequired');
 }

 if (message === 'Amount must be a valid number with up to 2 decimal places') {
  return t('addSubscription:amountInvalid');
 }

 if (message === 'Amount must be a finite number') {
  return t('addSubscription:amountFinite');
 }

 if (message === 'Amount cannot be negative') {
  return t('addSubscription:amountNegative');
 }

 if (message.startsWith('Amount cannot exceed')) {
  return t('addSubscription:amountExceedsMax', { max: MAX_SUBSCRIPTION_AMOUNT });
 }

 if (message === 'Name is required') {
  return t('addSubscription:nameRequired');
 }

 if (message === 'Category is required') {
  return t('addSubscription:categoryRequired');
 }

 if (message === 'Custom period is required') {
  return t('addSubscription:customPeriodRequired');
 }

 if (message === 'Custom period must be a positive whole number') {
  return t('addSubscription:customPeriodInvalid');
 }

 if (message === 'Next payment date is required') {
  return t('addSubscription:nextPaymentDateRequired');
 }

 return message;
}
