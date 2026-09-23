import { useModalScrollLock } from '../../hooks/useModalScrollLock';
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getNewSubscriptionCurrency } from '../../utils/subscriptionCurrencyPreference';
import { SubscriptionFormFields, type FormValues } from './SubscriptionFormFields';
import type { SubscriptionFormSheetProps } from './types';

function buildAddFormValues(isNotificationReady: boolean): FormValues {
 return {
  name: '',
  category: '',
  amount: '',
  currency: getNewSubscriptionCurrency(),
  period: 'monthly',
  nextPaymentDate: '',
  customDate: '',
  isTrial: false,
  notificationEnabled: isNotificationReady,
 };
}

export function SubscriptionFormSheet({
 mode,
 isOpen,
 onClose,
 onSubmit,
 categorySync,
 isNotificationReady,
 onOpenNotificationSettings,
 subscription,
}: SubscriptionFormSheetProps) {
 useModalScrollLock(isOpen);
 const { t } = useTranslation(['addSubscription', 'editSubscription']);
 const [isSubmitting, setIsSubmitting] = useState(false);

 const initialValues = useMemo<FormValues>(() => {
  if (mode === 'edit' && subscription) {
   return {
    name: subscription.name,
    category: subscription.category,
    amount: subscription.amount.toString(),
    currency: subscription.currency || 'CNY',
    period: subscription.period,
    nextPaymentDate: (subscription.isTrial ? subscription.trialEndsOn : undefined)
     || subscription.nextPaymentDate,
    billingAnchorDay: subscription.billingAnchorDay,
    customDate: subscription.customDate || '',
    isTrial: subscription.isTrial ?? false,
    notificationEnabled: subscription.notificationEnabled ?? true,
   };
  }

  return buildAddFormValues(isNotificationReady);
 }, [isNotificationReady, mode, subscription]);

 useEffect(() => {
  if (!isOpen) {
   return undefined;
  }


  const handleKeyDown = (event: KeyboardEvent) => {
   if (event.key === 'Escape' && !isSubmitting) {
    onClose();
   }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => {
   document.removeEventListener('keydown', handleKeyDown);
  };
 }, [isOpen, isSubmitting, onClose]);

 if (!isOpen) {
  return null;
 }

 const title = mode === 'add' ? t('addSubscription:title') : t('editSubscription:title');

 const handleClose = () => {
  if (!isSubmitting) {
   onClose();
  }
 };

 return (
  <div className="fixed inset-0 mobile-modal-viewport z-50 modal-overlay">
   <div
    className="absolute inset-0 bg-black/50 dark:bg-black/70"
    onClick={handleClose}
   />
   <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 pointer-events-none">
    <div
     role="dialog"
     aria-modal="true"
     aria-labelledby="subscription-form-title"
     className="subscription-form-sheet pointer-events-auto w-full max-w-md max-h-[calc(var(--app-viewport-height,100dvh)*0.9)] overflow-y-auto bg-white dark:bg-[#1a1c1e] rounded-t-2xl sm:rounded-2xl shadow-apple-lg pb-[env(safe-area-inset-bottom)]"
    >
     <div className="sm:hidden flex justify-center pt-2">
      <span className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
     </div>
     <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
       <h2 id="subscription-form-title" className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white tracking-tight">
        {title}
       </h2>
       <button
        type="button"
        onClick={handleClose}
        disabled={isSubmitting}
        aria-label={t('addSubscription:closeForm')}
        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 disabled:opacity-50"
       >
        <X className="w-5 h-5" />
       </button>
      </div>
      <SubscriptionFormFields
       key={`${mode}-${subscription?.id ?? 'new'}`}
       mode={mode}
       initialValues={initialValues}
       onSubmit={onSubmit}
       onSubmittingChange={setIsSubmitting}
       categorySync={categorySync}
       isNotificationReady={isNotificationReady}
       onOpenNotificationSettings={onOpenNotificationSettings}
       existingSubscription={subscription}
      />
     </div>
    </div>
   </div>
  </div>
 );
}
