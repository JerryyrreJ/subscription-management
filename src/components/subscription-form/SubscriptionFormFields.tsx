import { useEffect, useState, type FormEvent } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Currency, Period, Subscription } from '../../types';
import {
 addCustomCategory,
 getAllCategories,
 getAllCategoriesWithDetails,
} from '../../utils/categories';
import { getDateOnlyDay } from '../../utils/dates';
import { createSubscriptionRecord, getSubscriptionValidationMessage, updateSubscriptionRecord } from '../../utils/subscriptionDomain';
import { rememberSubscriptionCurrency } from '../../utils/subscriptionCurrencyPreference';
import { validateSubscriptionAmount } from '../../utils/subscriptionValidation';
import { translateSubscriptionFormError } from '../../utils/subscriptionFormErrors';
import { CustomDatePicker } from '../CustomDatePicker';
import { AmountHero } from './AmountHero';
import { CategoryChips } from './CategoryChips';
import { LiveSummaryStrip } from './LiveSummaryStrip';
import { PeriodSegmented } from './PeriodSegmented';
import type { CategorySyncMethods, SubscriptionFormMode } from './types';

interface FormValues {
 name: string;
 category: string;
 amount: string;
 currency: Currency;
 period: Period;
 nextPaymentDate: string;
 billingAnchorDay?: number;
 customDate: string;
 notificationEnabled: boolean;
}

interface FieldErrors {
 name?: string;
 amount?: string;
 category?: string;
 nextPaymentDate?: string;
 customDate?: string;
}

interface SubscriptionFormFieldsProps {
 mode: SubscriptionFormMode;
 initialValues: FormValues;
 onSubmit: (subscription: Subscription) => Promise<void>;
 onSubmittingChange: (submitting: boolean) => void;
 categorySync?: CategorySyncMethods;
 isNotificationReady: boolean;
 onOpenNotificationSettings?: () => void;
 existingSubscription?: Subscription;
}

const CUSTOM_PERIOD_PATTERN = /^[1-9]\d*$/;

export function SubscriptionFormFields({
 mode,
 initialValues,
 onSubmit,
 onSubmittingChange,
 categorySync,
 isNotificationReady,
 onOpenNotificationSettings,
 existingSubscription,
}: SubscriptionFormFieldsProps) {
 const { t } = useTranslation(['addSubscription', 'editSubscription', 'app', 'categoryLabels']);
 const [formData, setFormData] = useState<FormValues>(initialValues);
 const [categories, setCategories] = useState<string[]>(() => mergeCurrentCategory(getAllCategories(), initialValues.category));
 const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
 const [formError, setFormError] = useState<string | null>(null);
 const [categoryNotice, setCategoryNotice] = useState<string | null>(null);
 const [notificationValidationError, setNotificationValidationError] = useState(false);
 const [isSubmitting, setIsSubmitting] = useState(false);

 useEffect(() => {
  setFormData(initialValues);
  setCategories(mergeCurrentCategory(getAllCategories(), initialValues.category));
  setFieldErrors({});
  setFormError(null);
  setCategoryNotice(null);
  setNotificationValidationError(false);
 }, [initialValues]);

 const clearFieldError = (field: keyof FieldErrors) => {
  setFieldErrors(prev => {
   if (!prev[field]) return prev;
   const next = { ...prev };
   delete next[field];
   return next;
  });
 };

 const updateForm = (patch: Partial<FormValues>) => {
  setFormData(prev => ({ ...prev, ...patch }));
  setFormError(null);
 };

 const validate = (): FieldErrors => {
  const errors: FieldErrors = {};

  if (!formData.name.trim()) {
   errors.name = t('addSubscription:nameRequired');
  }

  if (!formData.category.trim()) {
   errors.category = t('addSubscription:categoryRequired');
  }

  const amountError = validateSubscriptionAmount(formData.amount);
  if (amountError) {
   errors.amount = translateSubscriptionFormError(amountError, t);
  }

  if (!formData.nextPaymentDate) {
   errors.nextPaymentDate = t('addSubscription:nextPaymentDateRequired');
  }

  if (formData.period === 'custom') {
   const customDate = formData.customDate.trim();
   if (!customDate) {
    errors.customDate = t('addSubscription:customPeriodRequired');
   } else if (!CUSTOM_PERIOD_PATTERN.test(customDate)) {
    errors.customDate = t('addSubscription:customPeriodInvalid');
   }
  }

  return errors;
 };

 const handleCreateCategory = async (rawName: string): Promise<boolean> => {
  const trimmed = rawName.trim();
  if (!trimmed) {
   return false;
  }

  const success = addCustomCategory(trimmed);
  if (!success) {
   setCategoryNotice(null);
   setFieldErrors(prev => ({ ...prev, category: t('addSubscription:failedToAddCategory') }));
   return false;
  }

  let notice: string | null = null;
  if (categorySync) {
   const allCategories = getAllCategoriesWithDetails();
   const newCategory = allCategories.find(cat => cat.name === trimmed);
   if (newCategory) {
    try {
     const result = await categorySync.createCategory(newCategory);
     if (!result.cloudSynced && result.queuedForRetry) {
      notice = t('addSubscription:categoryCloudSyncPending');
     }
    } catch (error) {
     console.error('Failed to sync new category to cloud:', error);
     notice = t('addSubscription:categoryCloudSyncPending');
    }
   }
  }

  setCategories(mergeCurrentCategory(getAllCategories(), trimmed));
  updateForm({ category: trimmed });
  clearFieldError('category');
  setCategoryNotice(notice);
  return true;
 };

 const handleNotificationToggle = () => {
  if (isSubmitting) {
   return;
  }

  setNotificationValidationError(false);

  if (formData.notificationEnabled) {
   updateForm({ notificationEnabled: false });
   return;
  }

  if (isNotificationReady) {
   updateForm({ notificationEnabled: true });
   return;
  }

  if (mode === 'add') {
   setNotificationValidationError(true);
   onOpenNotificationSettings?.();
  }
 };

 const handleSubmit = async (event: FormEvent) => {
  event.preventDefault();
  if (isSubmitting) {
   return;
  }

  const errors = validate();
  setFieldErrors(errors);
  setFormError(null);

  if (Object.keys(errors).length > 0) {
   return;
  }

  const payload = {
   ...formData,
   name: formData.name.trim(),
   amount: Number(formData.amount),
   customDate: formData.period === 'custom' ? formData.customDate.trim() : undefined,
   billingAnchorDay: formData.period === 'monthly'
    ? formData.billingAnchorDay ?? getDateOnlyDay(formData.nextPaymentDate)
    : undefined,
  };

  setIsSubmitting(true);
  onSubmittingChange(true);

  try {
   const record = existingSubscription
    ? updateSubscriptionRecord(existingSubscription, payload)
    : createSubscriptionRecord(payload);
   await onSubmit(record);
  } catch (error) {
   setFormError(translateSubscriptionFormError(getSubscriptionValidationMessage(error), t));
  } finally {
   setIsSubmitting(false);
   onSubmittingChange(false);
  }
 };

 const chipCategories = mergeCurrentCategory(categories, formData.category);
 const canEnableNotifications = mode === 'add' || isNotificationReady || formData.notificationEnabled;

 return (
  <form noValidate onSubmit={handleSubmit} className="space-y-5">
   {formError && (
    <p className="text-sm text-red-600 dark:text-red-400" role="alert">{formError}</p>
   )}

   <LiveSummaryStrip
    name={formData.name}
    amount={formData.amount}
    currency={formData.currency}
    period={formData.period}
    customDate={formData.customDate}
    nextPaymentDate={formData.nextPaymentDate}
   />

   <div>
    <label htmlFor="subscription-name" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
     {t('addSubscription:nameLabel')}
    </label>
    <input
     id="subscription-name"
     type="text"
     value={formData.name}
     maxLength={120}
     onChange={(e) => {
      updateForm({ name: e.target.value });
      clearFieldError('name');
     }}
     placeholder={t('addSubscription:namePlaceholder')}
     aria-invalid={Boolean(fieldErrors.name)}
     className={`w-full px-3 py-2.5 text-sm sm:text-base border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
      fieldErrors.name ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
     }`}
    />
    {fieldErrors.name && (
     <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.name}</p>
    )}
   </div>

   <AmountHero
    amount={formData.amount}
    currency={formData.currency}
    error={fieldErrors.amount}
    onAmountChange={(value) => {
     updateForm({ amount: value });
     clearFieldError('amount');
    }}
    onCurrencyChange={(currency) => {
     if (mode === 'add') {
      rememberSubscriptionCurrency(currency);
     }
     updateForm({ currency });
    }}
   />

   <div>
    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
     {t('addSubscription:nextPaymentDateLabel')}
    </label>
    <CustomDatePicker
     value={formData.nextPaymentDate}
     invalid={Boolean(fieldErrors.nextPaymentDate)}
     onChange={(value) => {
      updateForm({
       nextPaymentDate: value,
       billingAnchorDay: formData.period === 'monthly' ? getDateOnlyDay(value) : undefined,
      });
      clearFieldError('nextPaymentDate');
     }}
     required
    />
    {fieldErrors.nextPaymentDate && (
     <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.nextPaymentDate}</p>
    )}
   </div>

   <div className="space-y-5 pt-1">
    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
     {t('addSubscription:detailsSection')}
    </p>

    <PeriodSegmented
     value={formData.period}
     onChange={(period) => {
      updateForm({
       period,
       customDate: period === 'custom' ? formData.customDate : '',
       billingAnchorDay: period === 'monthly' && formData.nextPaymentDate
        ? getDateOnlyDay(formData.nextPaymentDate)
        : undefined,
      });
      if (period !== 'custom') {
       clearFieldError('customDate');
      }
     }}
    />

    {formData.period === 'custom' && (
     <div>
      <label htmlFor="subscription-custom-period" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
       {t('addSubscription:customPeriodLabel')}
      </label>
      <input
       id="subscription-custom-period"
       type="number"
       min="1"
       value={formData.customDate}
       onChange={(e) => {
        updateForm({ customDate: e.target.value });
        clearFieldError('customDate');
       }}
       placeholder={t('addSubscription:customPeriodPlaceholder')}
       aria-invalid={Boolean(fieldErrors.customDate)}
       className={`w-full px-3 py-2.5 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
        fieldErrors.customDate ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
       }`}
      />
      {fieldErrors.customDate && (
       <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.customDate}</p>
      )}
     </div>
    )}

    <CategoryChips
     categories={chipCategories}
     value={formData.category}
     onChange={(category) => {
      updateForm({ category });
      clearFieldError('category');
      setCategoryNotice(null);
     }}
     onCreateCategory={handleCreateCategory}
     error={fieldErrors.category}
     notice={categoryNotice ?? undefined}
    />

    {/*
     TODO(trial): Wire `isTrial` + `trialEndsOn` when those fields exist on the
     starting schema/types (historically PR #5 / feat/trial-reminders). Do not
     invent API or persist fake trial flags. When available, add a Tier 2
     emerald toggle here and highlight trial-end copy on the date field /
     summary strip; pass the flags into createSubscriptionRecord / updateSubscriptionRecord.
    */}

    <div className="flex items-start gap-3 pt-1">
     <div className="flex-shrink-0 mt-0.5">
      {formData.notificationEnabled ? (
       <Bell className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
      ) : (
       <BellOff className="w-5 h-5 text-gray-400 dark:text-gray-500" />
      )}
     </div>
     <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-3">
       <label className="text-sm font-medium text-gray-900 dark:text-white">
        {t('addSubscription:notificationsLabel')}
       </label>
       <button
        type="button"
        onClick={handleNotificationToggle}
        disabled={isSubmitting || !canEnableNotifications}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
         formData.notificationEnabled ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-600'
        } ${isSubmitting || !canEnableNotifications ? 'opacity-50 cursor-not-allowed' : ''}`}
       >
        <span
         className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          formData.notificationEnabled ? 'translate-x-6' : 'translate-x-1'
         }`}
        />
       </button>
      </div>
      {mode === 'edit' && !isNotificationReady ? (
       <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
        {t('editSubscription:globalNotificationsDisabled')}
       </p>
      ) : (
       <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {formData.notificationEnabled
         ? t('addSubscription:notificationsEnabledHint')
         : t('addSubscription:notificationsDisabledHint')}
       </p>
      )}
      {notificationValidationError && (
       <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
        {t('addSubscription:notificationSetupValidation')}
       </p>
      )}
     </div>
    </div>
   </div>

   <div className="pt-1 pb-1">
    <button
     type="submit"
     disabled={isSubmitting}
     className="w-full bg-emerald-600 dark:bg-emerald-500 text-white py-3 px-4 rounded-xl hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors duration-200 disabled:bg-zinc-400 disabled:cursor-not-allowed font-medium"
    >
     {isSubmitting
      ? (mode === 'add' ? t('addSubscription:submitting') : t('editSubscription:submitting'))
      : (mode === 'add' ? t('addSubscription:submit') : t('editSubscription:saveChanges'))}
    </button>
   </div>
  </form>
 );
}

function mergeCurrentCategory(categories: string[], current: string): string[] {
 if (!current || categories.includes(current)) {
  return categories;
 }
 return [current, ...categories];
}

export type { FormValues };
