import { useTranslation } from 'react-i18next';
import type { Currency, Period } from '../../types';
import { formatCurrency } from '../../utils/currency';
import { formatDateByLocale, parseDateOnly } from '../../utils/dates';
import { useAppLanguage } from '../../hooks/useAppLanguage';
import { validateSubscriptionAmount } from '../../utils/subscriptionValidation';

interface LiveSummaryStripProps {
 name: string;
 amount: string;
 currency: Currency;
 period: Period;
 customDate: string;
 nextPaymentDate: string;
 isTrial?: boolean;
}

export function LiveSummaryStrip({
 name,
 amount,
 currency,
 period,
 customDate,
 nextPaymentDate,
 isTrial = false,
}: LiveSummaryStripProps) {
 const { t } = useTranslation(['addSubscription', 'subscriptionCard']);
 const { language } = useAppLanguage();

 const displayName = name.trim() || t('addSubscription:summaryUntitled');
 const amountIsValid = !validateSubscriptionAmount(amount, currency);
 const displayAmount = amountIsValid ? formatCurrency(Number(amount), currency, language) : '—';
 const customDays = Number.parseInt(customDate, 10);
 const periodLabel = period === 'monthly'
  ? t('addSubscription:periodMonthly')
  : period === 'yearly'
   ? t('addSubscription:periodYearly')
   : Number.isFinite(customDays) && customDays > 0
    ? t(
     customDays === 1
      ? 'subscriptionCard:customPeriodDaysOne'
      : 'subscriptionCard:customPeriodDaysOther',
     { count: customDays }
    )
    : t('addSubscription:periodCustom');
 const dateLabel = nextPaymentDate
  ? t(isTrial ? 'addSubscription:summaryTrialEnd' : 'addSubscription:summaryNextPayment', {
   date: formatDateByLocale(parseDateOnly(nextPaymentDate), language),
  })
  : '—';

 return (
  <div className="h-14 sm:h-[4.5rem] flex items-center justify-between gap-3 px-3 sm:px-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
   <div className="min-w-0">
    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName}</p>
    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
     {dateLabel}
     <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
     {periodLabel}
    </p>
   </div>
   <p className="shrink-0 text-base sm:text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
    {displayAmount}
   </p>
  </div>
 );
}
