import { useTranslation } from 'react-i18next';
import type { Period } from '../../types';

interface PeriodSegmentedProps {
 value: Period;
 onChange: (value: Period) => void;
}

const PERIODS: Period[] = ['monthly', 'yearly', 'custom'];

export function PeriodSegmented({ value, onChange }: PeriodSegmentedProps) {
 const { t } = useTranslation(['addSubscription']);

 const labelFor = (period: Period) => {
  if (period === 'monthly') return t('addSubscription:periodMonthlyShort');
  if (period === 'yearly') return t('addSubscription:periodYearlyShort');
  return t('addSubscription:periodCustomShort');
 };

 return (
  <div>
   <p className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
    {t('addSubscription:paymentPeriodLabel')}
   </p>
   <div
    role="radiogroup"
    aria-label={t('addSubscription:paymentPeriodLabel')}
    className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 dark:bg-zinc-800 p-1"
   >
    {PERIODS.map(period => {
     const selected = value === period;
     return (
      <button
       key={period}
       type="button"
       role="radio"
       aria-checked={selected}
       onClick={() => onChange(period)}
       className={`rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
        selected
         ? 'bg-white dark:bg-zinc-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
         : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
       }`}
      >
       {labelFor(period)}
      </button>
     );
    })}
   </div>
   {value === 'monthly' && (
    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
     {t('addSubscription:monthlyPeriodHint')}
    </p>
   )}
   {value === 'custom' && (
    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
     {t('addSubscription:customPeriodHint')}
    </p>
   )}
  </div>
 );
}
