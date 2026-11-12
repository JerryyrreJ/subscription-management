import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DraftSubscription } from '../../services/aiParseService';
import type { Currency, Period } from '../../types';
import { getCategoryDisplayName } from '../../utils/categories';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS } from '../../utils/subscriptionDomain';
import { warnedFields } from './patchMerge';
import { AI_CAPTURE_INPUT_BASE, getAiCaptureFieldBorder, type DraftState } from './types';

interface AiDraftListProps {
  drafts: DraftState[];
  categories: string[];
  onUpdateDraft: (key: string, patch: Partial<DraftSubscription>) => void;
  onSaveDraft: (draft: DraftState) => void;
  onDiscardDraft: (key: string) => void;
}

export function AiDraftList({
  drafts,
  categories,
  onUpdateDraft,
  onSaveDraft,
  onDiscardDraft,
}: AiDraftListProps) {
  const { t } = useTranslation(['aiCapture', 'addSubscription', 'categoryLabels']);
  const remaining = drafts.filter((draft) => draft.status !== 'saved');

  return (
    <>
      {drafts.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          {t('aiCapture:noneFound')}
        </p>
      )}
      {drafts.length > 0 && remaining.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{t('aiCapture:reviewHint')}</p>
      )}
      <div className="space-y-3">
        {remaining.map((draft) => {
          const warned = warnedFields(draft.warnings);
          return (
            <div
              key={draft.key}
              className="border border-gray-200 dark:border-gray-700 rounded-2xl p-3 space-y-2 bg-gray-50/50 dark:bg-gray-800/40"
            >
              <input
                value={draft.name}
                onChange={(e) => onUpdateDraft(draft.key, { name: e.target.value })}
                placeholder={t('addSubscription:nameLabel')}
                className={`${AI_CAPTURE_INPUT_BASE} ${getAiCaptureFieldBorder(false)} font-medium`}
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.amount}
                  onChange={(e) => onUpdateDraft(draft.key, { amount: Number(e.target.value) })}
                  className={`${AI_CAPTURE_INPUT_BASE} ${getAiCaptureFieldBorder(warned.has('amount'))} w-[40%]`}
                />
                <select
                  value={draft.currency}
                  onChange={(e) => onUpdateDraft(draft.key, { currency: e.target.value as Currency })}
                  className={`${AI_CAPTURE_INPUT_BASE} ${getAiCaptureFieldBorder(warned.has('currency'))} w-[30%]`}
                >
                  {SUBSCRIPTION_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
                <select
                  value={draft.period}
                  onChange={(e) => onUpdateDraft(draft.key, { period: e.target.value as Period })}
                  className={`${AI_CAPTURE_INPUT_BASE} ${getAiCaptureFieldBorder(warned.has('period'))} w-[30%]`}
                >
                  {SUBSCRIPTION_PERIODS.map((period) => (
                    <option key={period} value={period}>
                      {t(`addSubscription:period${period.charAt(0).toUpperCase()}${period.slice(1)}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <select
                  value={draft.category}
                  onChange={(e) => onUpdateDraft(draft.key, { category: e.target.value })}
                  aria-label={t('addSubscription:categoryLabel')}
                  className={`${AI_CAPTURE_INPUT_BASE} ${getAiCaptureFieldBorder(warned.has('category'))} flex-1`}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {getCategoryDisplayName(category, t)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={draft.nextPaymentDate}
                  onChange={(e) => onUpdateDraft(draft.key, { nextPaymentDate: e.target.value })}
                  aria-label={t('addSubscription:nextPaymentDateLabel')}
                  className={`${AI_CAPTURE_INPUT_BASE} ${getAiCaptureFieldBorder(warned.has('nextPaymentDate'))} flex-1`}
                />
              </div>
              {draft.period === 'custom' && (
                <input
                  type="number"
                  min="1"
                  value={draft.customDate ?? ''}
                  onChange={(e) => onUpdateDraft(draft.key, { customDate: e.target.value })}
                  placeholder={t('addSubscription:customPeriodLabel')}
                  className={`${AI_CAPTURE_INPUT_BASE} ${getAiCaptureFieldBorder(warned.has('customDate'))}`}
                />
              )}

              {draft.warnings.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {draft.warnings.map((warning) => (
                    <span
                      key={warning}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    >
                      {t([`aiCapture:warnings.${warning}`, 'aiCapture:needsReview'])}
                    </span>
                  ))}
                </div>
              )}
              {draft.error && <p className="text-xs text-red-600 dark:text-red-400">{draft.error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onSaveDraft(draft)}
                  disabled={draft.status === 'saving'}
                  className="flex items-center justify-center gap-1.5 flex-1 bg-emerald-600 dark:bg-emerald-500 text-white py-2 rounded-2xl text-sm font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50"
                >
                  {draft.status === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {draft.status === 'saving' ? t('aiCapture:saving') : t('aiCapture:save')}
                </button>
                <button
                  onClick={() => onDiscardDraft(draft.key)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {t('aiCapture:discard')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
