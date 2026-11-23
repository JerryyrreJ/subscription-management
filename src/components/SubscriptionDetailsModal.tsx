import { useEffect, useState } from 'react';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { X, Calendar, Tag, DollarSign, AlertTriangle, Loader2, CheckCircle2, Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Subscription } from '../types';
import { formatDate } from '../utils/dates';
import { formatCurrency } from '../utils/currency';
import { getCategoryDisplayName } from '../utils/categories';
import { resolveSubscriptionRenewal, resolveTrialConversionDates } from '../utils/subscriptionRenewal';
import { isTrialSubscription } from '../utils/subscriptionReminder';

interface SubscriptionDetailsModalProps {
 subscription: Subscription | null;
 isOpen: boolean;
 onClose: () => void;
 onEdit: () => void;
 onDelete: () => void | Promise<void>;
 onConvertTrialToPaid?: (subscription: Subscription) => void | Promise<void>;
}

export function SubscriptionDetailsModal({
 subscription,
 isOpen,
 onClose,
 onEdit,
 onDelete,
 onConvertTrialToPaid,
}: SubscriptionDetailsModalProps) {
 useModalScrollLock(isOpen && Boolean(subscription));
 const { t } = useTranslation(['subscriptionDetails', 'subscriptionCard', 'addSubscription', 'categoryLabels', 'app']);
 const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
 const [isDeleting, setIsDeleting] = useState(false);
 const [isConverting, setIsConverting] = useState(false);

 useEffect(() => {
  setIsConfirmingDelete(false);
  setIsDeleting(false);
  setIsConverting(false);
 }, [isOpen, subscription?.id]);

 useEffect(() => {
  if (!isOpen || !subscription) {
   return undefined;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
   if (event.key !== 'Escape' || isDeleting || isConverting) {
    return;
   }
   // Ignore Escape if an edit sheet or another modal is stacked on top.
   if (document.querySelector('[aria-modal="true"]:not([data-subscription-details-dialog])')) {
    return;
   }
   if (isConfirmingDelete) {
    setIsConfirmingDelete(false);
    return;
   }
   onClose();
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
 }, [isConfirmingDelete, isConverting, isDeleting, isOpen, onClose, subscription]);

 if (!isOpen || !subscription) return null;

 const renewal = resolveSubscriptionRenewal(subscription);
 const isTrial = isTrialSubscription(subscription);
 const isTrialExpired = isTrial && renewal.daysUntilEffectiveNextPayment < 0;
 const convertedDates = isTrial ? resolveTrialConversionDates(subscription) : null;
 const busy = isDeleting || isConverting;

 const customDays = Number.parseInt(subscription.customDate || '', 10);
 const periodLabel = subscription.period === 'monthly'
  ? t('addSubscription:periodMonthly')
  : subscription.period === 'yearly'
   ? t('addSubscription:periodYearly')
   : Number.isFinite(customDays) && customDays > 0
    ? t(
     customDays === 1
      ? 'subscriptionCard:customPeriodDaysOne'
      : 'subscriptionCard:customPeriodDaysOther',
     { count: customDays }
    )
    : t('addSubscription:periodCustom');
 const notificationsEnabled = subscription.notificationEnabled ?? true;

 const handleConfirmDelete = async () => {
  if (busy) return;
  setIsDeleting(true);
  try {
   await onDelete();
  } finally {
   setIsDeleting(false);
   setIsConfirmingDelete(false);
  }
 };

 const handleConvertTrial = async () => {
  if (busy || !onConvertTrialToPaid) return;
  setIsConverting(true);
  try {
   await onConvertTrialToPaid(subscription);
  } finally {
   setIsConverting(false);
  }
 };

 return (
 <div
  className="fixed inset-0 mobile-modal-viewport bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-4 z-50 modal-overlay"
  onMouseDown={event => {
   if (event.target === event.currentTarget && !busy) {
    onClose();
   }
  }}
 >
 <div
  role="dialog"
  aria-modal="true"
  aria-labelledby="subscription-details-title"
  data-subscription-details-dialog
  className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-lg max-w-md w-full mobile-modal-panel modal-content"
 >
 <div className="p-6">
 <div className="flex justify-between items-start gap-3 mb-6">
 <div className="min-w-0 flex flex-wrap items-center gap-2">
  <h2 id="subscription-details-title" className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight break-words">{subscription.name}</h2>
  {isTrial && (
   <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${
    isTrialExpired
     ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50'
     : 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
   }`}>
    {isTrialExpired ? t('subscriptionCard:trialExpiredBadge') : t('subscriptionCard:trialBadge')}
   </span>
  )}
 </div>
 <button
 type="button"
 onClick={onClose}
 disabled={busy}
 aria-label={t('addSubscription:closeForm')}
 className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50 shrink-0"
 >
 <X className="w-6 h-6"/>
 </button>
 </div>

 <div className="space-y-4">
 <div className="flex items-center space-x-3">
 <Tag className="w-5 h-5 text-gray-400 dark:text-gray-500"/>
 <span className="text-gray-600 dark:text-gray-300">{getCategoryDisplayName(subscription.category, t)}</span>
 </div>

 <div className="flex items-center space-x-3">
 <DollarSign className="w-5 h-5 text-gray-400 dark:text-gray-500"/>
 <span className="text-gray-600 dark:text-gray-300">
 {formatCurrency(subscription.amount, subscription.currency || 'CNY')} / {periodLabel}
 </span>
 </div>

 <div className="flex items-center space-x-3">
 <Calendar className="w-5 h-5 text-gray-400 dark:text-gray-500"/>
 <div className="space-y-1">
 <div className="text-gray-600 dark:text-gray-300">
 {t(isTrial ? 'subscriptionDetails:trialEndsOn' : 'subscriptionDetails:nextPayment', {
  date: formatDate(renewal.effectiveNextPaymentDate),
 })}
 </div>
 {renewal.isAutoRenewed && (
  <div className="text-xs text-amber-600 dark:text-amber-400">
   {t('subscriptionDetails:autoRenewedHint', {
    storedDate: formatDate(renewal.storedNextPaymentDate),
   })}
  </div>
 )}
 </div>
 </div>

 <div className="flex items-center space-x-3">
  {notificationsEnabled ? (
   <Bell className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
  ) : (
   <BellOff className="w-5 h-5 text-gray-400 dark:text-gray-500" />
  )}
  <span className="text-gray-600 dark:text-gray-300">
   {t(notificationsEnabled ? 'subscriptionDetails:notificationsEnabled' : 'subscriptionDetails:notificationsDisabled')}
  </span>
 </div>
</div>

 {isTrial && onConvertTrialToPaid && convertedDates && !isConfirmingDelete && (
  <div className={`mt-5 rounded-2xl border p-4 space-y-3 ${
   isTrialExpired
    ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
    : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/50'
  }`}>
   <div className="flex items-start gap-2.5">
    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
     isTrialExpired ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
    }`} />
    <div className="space-y-1 text-sm">
     <p className={`font-semibold ${
      isTrialExpired ? 'text-rose-800 dark:text-rose-200' : 'text-amber-900 dark:text-amber-200'
     }`}>
      {t(isTrialExpired ? 'subscriptionDetails:trialExpiredTitle' : 'subscriptionDetails:trialActiveTitle')}
     </p>
     <p className={`text-xs leading-relaxed ${
      isTrialExpired ? 'text-rose-700 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300'
     }`}>
      {t(isTrialExpired ? 'subscriptionDetails:trialExpiredBody' : 'subscriptionDetails:trialConvertHint', {
       date: formatDate(renewal.effectiveNextPaymentDate),
       nextDate: formatDate(convertedDates.nextPaymentDate),
      })}
     </p>
    </div>
   </div>
   <button
    type="button"
    onClick={() => void handleConvertTrial()}
    disabled={busy}
    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
   >
    {isConverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
    {isConverting ? t('subscriptionDetails:convertingTrial') : t('subscriptionDetails:convertToPaid')}
   </button>
  </div>
 )}

 {isConfirmingDelete ? (
  <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
   <div className="flex items-start gap-2.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200/80 dark:border-red-900/60 p-3 text-sm text-red-700 dark:text-red-300">
    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
    <span>{t('subscriptionDetails:deleteConfirmMessage', { name: subscription.name })}</span>
   </div>
   <div className="flex justify-end gap-2.5">
    <button
     type="button"
     onClick={() => setIsConfirmingDelete(false)}
     disabled={busy}
     className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50"
    >
     {t('app:cancel')}
    </button>
    <button
     type="button"
     onClick={() => void handleConfirmDelete()}
     disabled={busy}
     className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 font-medium"
    >
     {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
     {isDeleting ? t('subscriptionDetails:deleting') : t('subscriptionDetails:confirmDelete')}
    </button>
   </div>
  </div>
 ) : (
  <div className="flex justify-between mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
  <button
  type="button"
  onClick={() => setIsConfirmingDelete(true)}
  disabled={busy}
  className="px-4 py-2 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 rounded-2xl hover:bg-red-200 dark:hover:bg-red-950/70 transition-colors duration-200 disabled:opacity-50"
  >
  {isTrialExpired ? t('subscriptionDetails:deleteExpiredTrial') : t('subscriptionDetails:delete')}
  </button>
  <button
  type="button"
  onClick={onEdit}
  disabled={busy}
  className="px-4 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-2xl hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors duration-200 disabled:opacity-50"
  >
  {t('subscriptionDetails:edit')}
  </button>
  </div>
 )}
 </div>
 </div>
 </div>
 );
}
