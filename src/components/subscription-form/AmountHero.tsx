import { useTranslation } from 'react-i18next';
import type { Currency } from '../../types';
import { CURRENCIES, formatCurrencyOptionLabel } from '../../utils/currency';
import { CustomSelect } from '../CustomSelect';

interface AmountHeroProps {
 amount: string;
 currency: Currency;
 onAmountChange: (value: string) => void;
 onCurrencyChange: (value: Currency) => void;
 error?: string;
}

export function AmountHero({
 amount,
 currency,
 onAmountChange,
 onCurrencyChange,
 error,
}: AmountHeroProps) {
 const { t } = useTranslation(['addSubscription', 'currency']);

 return (
  <div>
   <label htmlFor="subscription-amount" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
    {t('addSubscription:amountLabel')}
   </label>
   <div className={`flex items-end gap-3 border-b pb-1.5 transition-colors ${
    error
     ? 'border-red-400 dark:border-red-500'
     : 'border-gray-200 dark:border-gray-700 focus-within:border-emerald-500'
   }`}>
    <div className="w-[4.75rem] shrink-0 pb-1">
     <CustomSelect
      compact
      value={currency}
      onChange={(value) => onCurrencyChange(value as Currency)}
      options={CURRENCIES.map(item => ({
       value: item.code,
       selectedLabel: item.code,
       label: formatCurrencyOptionLabel(item.code, t),
      }))}
      required
     />
    </div>
    <input
     id="subscription-amount"
     type="text"
     inputMode="decimal"
     autoComplete="off"
     value={amount}
     onChange={(e) => onAmountChange(e.target.value)}
     placeholder={t('addSubscription:amountPlaceholder')}
     aria-invalid={Boolean(error)}
     className="min-w-0 flex-1 bg-transparent py-1 text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
    />
   </div>
   {error && (
    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
   )}
  </div>
 );
}
