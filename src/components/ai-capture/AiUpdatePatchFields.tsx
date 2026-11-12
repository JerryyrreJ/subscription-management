import { useTranslation } from 'react-i18next';
import type { Currency, Period, Subscription } from '../../types';
import type { AiUpdateOperation } from '../../utils/aiCommand';
import { coerceToExistingCategory, getCategoryDisplayName } from '../../utils/categories';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS } from '../../utils/subscriptionDomain';
import { AI_CAPTURE_INPUT_BASE, getAiCaptureFieldBorder } from './types';

interface AiUpdatePatchFieldsProps {
  update: AiUpdateOperation;
  targetSubscription: Subscription | null;
  categories: string[];
  keyPrefix: string;
  onPatchChange: (patch: AiUpdateOperation['patch']) => void;
}

export function AiUpdatePatchFields({
  update,
  targetSubscription,
  categories,
  keyPrefix,
  onPatchChange,
}: AiUpdatePatchFieldsProps) {
  const { t } = useTranslation(['aiCapture', 'addSubscription', 'categoryLabels']);
  const showCustomDateInput =
    update.patch.period === 'custom' || (update.missingFields ?? []).includes('customDate');
  const customDateValue = update.patch.customDate ?? targetSubscription?.customDate ?? '';
  const hasMissingFields = (update.missingFields ?? []).length > 0;
  const patchEntries = Object.entries(update.patch).filter(
    ([field]) => !(showCustomDateInput && field === 'customDate')
  );
  const editorClass =
    'min-w-0 flex-1 px-3 py-2 rounded-xl border border-transparent bg-gray-100/90 dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium text-right focus:text-left focus:ring-2 focus:ring-emerald-500 focus:border-transparent';

  const renderPatchEditor = (field: string, value: unknown) => {
    const label = t(`aiCapture:fields.${field}`);
    const rowClass = 'flex items-center gap-3 rounded-xl bg-white/80 dark:bg-gray-800/60 px-3 py-2 text-sm';
    const labelClass = 'w-24 shrink-0 text-gray-500 dark:text-gray-400';

    if (field === 'amount') {
      return (
        <div key={`${keyPrefix}-${field}`} className={rowClass}>
          <label className={labelClass} htmlFor={`${keyPrefix}-${field}`}>{label}</label>
          <input
            id={`${keyPrefix}-${field}`}
            type="number"
            step="0.01"
            min="0"
            value={Number(value)}
            onChange={(e) => onPatchChange({ amount: Number(e.target.value) })}
            className={editorClass}
          />
        </div>
      );
    }

    if (field === 'currency') {
      return (
        <div key={`${keyPrefix}-${field}`} className={rowClass}>
          <label className={labelClass} htmlFor={`${keyPrefix}-${field}`}>{label}</label>
          <select
            id={`${keyPrefix}-${field}`}
            value={String(value)}
            onChange={(e) => onPatchChange({ currency: e.target.value as Currency })}
            className={editorClass}
          >
            {SUBSCRIPTION_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </div>
      );
    }

    if (field === 'period') {
      return (
        <div key={`${keyPrefix}-${field}`} className={rowClass}>
          <label className={labelClass} htmlFor={`${keyPrefix}-${field}`}>{label}</label>
          <select
            id={`${keyPrefix}-${field}`}
            value={String(value)}
            onChange={(e) => {
              const period = e.target.value as Period;
              onPatchChange({
                period,
                customDate: period === 'custom' ? update.patch.customDate : undefined,
              });
            }}
            className={editorClass}
          >
            {SUBSCRIPTION_PERIODS.map((period) => (
              <option key={period} value={period}>
                {t(`addSubscription:period${period.charAt(0).toUpperCase()}${period.slice(1)}`)}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field === 'nextPaymentDate') {
      return (
        <div key={`${keyPrefix}-${field}`} className={rowClass}>
          <label className={labelClass} htmlFor={`${keyPrefix}-${field}`}>{label}</label>
          <input
            id={`${keyPrefix}-${field}`}
            type="date"
            value={String(value)}
            onChange={(e) => onPatchChange({ nextPaymentDate: e.target.value })}
            className={editorClass}
          />
        </div>
      );
    }

    if (field === 'notificationEnabled') {
      return (
        <div key={`${keyPrefix}-${field}`} className={rowClass}>
          <span className={labelClass}>{label}</span>
          <label className="ml-auto inline-flex items-center gap-2 text-gray-900 dark:text-white">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onPatchChange({ notificationEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm font-medium">
              {value ? t('aiCapture:enabled') : t('aiCapture:disabled')}
            </span>
          </label>
        </div>
      );
    }

    if (field === 'category') {
      const categoryOptions = categories.length > 0 ? categories : [String(value)];
      const selected = coerceToExistingCategory(String(value), categoryOptions).category;
      return (
        <div key={`${keyPrefix}-${field}`} className={rowClass}>
          <label className={labelClass} htmlFor={`${keyPrefix}-${field}`}>{label}</label>
          <select
            id={`${keyPrefix}-${field}`}
            value={selected}
            onChange={(e) => onPatchChange({ category: e.target.value })}
            className={editorClass}
          >
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {getCategoryDisplayName(category, t)}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <div key={`${keyPrefix}-${field}`} className={rowClass}>
        <label className={labelClass} htmlFor={`${keyPrefix}-${field}`}>{label}</label>
        <input
          id={`${keyPrefix}-${field}`}
          value={String(value)}
          onChange={(e) => onPatchChange({ [field]: e.target.value } as AiUpdateOperation['patch'])}
          className={editorClass}
        />
      </div>
    );
  };

  return (
    <>
      <div className="space-y-2">
        {patchEntries.map(([field, value]) => renderPatchEditor(field, value))}
      </div>
      {showCustomDateInput && (
        <div className="rounded-xl bg-white/80 dark:bg-gray-800/60 px-3 py-3 space-y-2">
          <label
            className="text-xs font-medium text-gray-500 dark:text-gray-400"
            htmlFor={`${keyPrefix}-custom-date`}
          >
            {t('aiCapture:fields.customDate')}
          </label>
          <input
            id={`${keyPrefix}-custom-date`}
            type="number"
            min="1"
            value={customDateValue}
            onChange={(e) => onPatchChange({ customDate: e.target.value })}
            placeholder={t('addSubscription:customPeriodLabel')}
            className={`${AI_CAPTURE_INPUT_BASE} ${getAiCaptureFieldBorder(hasMissingFields)}`}
          />
          {hasMissingFields && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('aiCapture:missingFieldsHint')}
            </p>
          )}
        </div>
      )}
    </>
  );
}
