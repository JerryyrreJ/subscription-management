import { useEffect, useRef } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Subscription } from '../types';
import { formatDate, getDaysUntil, getAutoRenewedDates, parseDateOnly, getTodayDateOnly } from '../utils/dates';
import { formatCurrency } from '../utils/currency';

interface SubscriptionCardProps {
 subscription: Subscription;
 index: number;
 onClick: () => void;
 onAutoRenew: (subscriptionId: string, newDates: { lastPaymentDate: string; nextPaymentDate: string }) => void;
}

export function SubscriptionCard({ subscription, index, onClick, onAutoRenew }: SubscriptionCardProps) {
 const { t } = useTranslation(['subscriptionCard', 'addSubscription']);

 // 检查是否需要自动续期
 const renewedDates = getAutoRenewedDates(
 subscription.lastPaymentDate,
 subscription.nextPaymentDate,
 subscription.period,
 subscription.period === 'custom' ? subscription.customDate : undefined
 );
 const shouldAutoRenew = renewedDates.nextPaymentDate !== subscription.nextPaymentDate;
 const autoRenewKey = `${subscription.id}:${renewedDates.lastPaymentDate}:${renewedDates.nextPaymentDate}`;
 const lastAutoRenewKeyRef = useRef<string | null>(null);

 useEffect(() => {
 if (!shouldAutoRenew) {
 lastAutoRenewKeyRef.current = null;
 return;
 }

 if (lastAutoRenewKeyRef.current === autoRenewKey) {
 return;
 }

 lastAutoRenewKeyRef.current = autoRenewKey;
 onAutoRenew(subscription.id, renewedDates);
 }, [autoRenewKey, onAutoRenew, renewedDates, shouldAutoRenew, subscription.id]);

 const daysUntil = getDaysUntil(renewedDates.nextPaymentDate);
 const isUpcoming = daysUntil <= 7 && daysUntil >= 0;

 // Calculate progress
 const lastPaymentDate = parseDateOnly(renewedDates.lastPaymentDate);
 const nextPaymentDate = parseDateOnly(renewedDates.nextPaymentDate);
 const today = getTodayDateOnly();
 const totalDays = (nextPaymentDate.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24);
 const daysElapsed = (today.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24);
 const progress = Math.min(Math.max((daysElapsed / totalDays) * 100, 0), 100);
 const roundedDaysElapsed = Math.round(daysElapsed);
 const roundedTotalDays = Math.round(totalDays);
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

 return (
 <div
 onClick={onClick}
 className="h-[200px] sm:h-[250px] bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-fey p-4 sm:p-6 transform transition-all duration-300 hover:scale-105 hover:shadow-apple-lg cursor-pointer app-dark-card"
 style={{
 animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both`,
 }}
 >
 <div className="flex justify-between items-start mb-3 sm:mb-4">
 <div className="flex-1 min-w-0 pr-2">
 <h3 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-white truncate app-dark-text-primary">{subscription.name}</h3>
 <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 app-dark-text-muted">{subscription.category}</span>
 </div>
 <div className="text-right flex-shrink-0">
 <div className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight app-dark-text-primary">
 {formatCurrency(subscription.amount, subscription.currency || 'CNY')}
 </div>
 <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 app-dark-text-muted">{periodLabel}</span>
 </div>
 </div>

 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2 sm:space-y-0 app-dark-divider">
 <div className="flex items-center space-x-2">
 <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 app-dark-text-muted"/>
 <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 app-dark-text-secondary">
 {t('subscriptionCard:nextPayment', { date: formatDate(renewedDates.nextPaymentDate) })}
 </span>
 </div>

 {isUpcoming && (
 <div className="flex items-center space-x-1 text-amber-600">
 <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4"/>
 <span className="text-xs sm:text-sm font-medium">
 {daysUntil === 0
  ? t('subscriptionCard:dueToday')
  : t(
   daysUntil === 1
    ? 'subscriptionCard:dueInDaysOne'
    : 'subscriptionCard:dueInDaysOther',
   { count: daysUntil }
  )}
 </span>
 </div>
 )}
 </div>

 <div className="mt-3 sm:mt-4">
 <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 sm:h-2 overflow-hidden app-dark-progress-track">
 <div
 className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full transition-all duration-500"
 style={{ width: `${progress}%` }}
 />
 </div>
 <div className="flex justify-between mt-1">
 <span className="text-xs text-gray-500 dark:text-gray-400 app-dark-text-muted">
 {t(
  roundedDaysElapsed === 1
   ? 'subscriptionCard:daysUsedOne'
   : 'subscriptionCard:daysUsedOther',
  { count: roundedDaysElapsed }
 )}
 </span>
 <span className="text-xs text-gray-500 dark:text-gray-400 app-dark-text-muted">
 {t(
  roundedTotalDays === 1
   ? 'subscriptionCard:daysTotalOne'
   : 'subscriptionCard:daysTotalOther',
  { count: roundedTotalDays }
 )}
 </span>
 </div>
 </div>
 </div>
 );
}
