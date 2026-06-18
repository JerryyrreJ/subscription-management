import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Upload, Loader2, Check, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Subscription, Currency, Period } from '../types';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS, createSubscriptionRecord, getSubscriptionValidationMessage } from '../utils/subscriptionDomain';
import { parseCapture, AiParseError, type DraftSubscription, type ParseQuota } from '../services/aiParseService';

interface AiCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  onCommit: (subscription: Subscription) => Promise<unknown>;
  onManualFallback: () => void;
}

type Phase = 'capture' | 'parsing' | 'review';

interface DraftState extends DraftSubscription {
  key: string;
  status: 'pending' | 'saving' | 'saved';
  error?: string;
}

// Downscale to a long edge of 1568px and re-encode as JPEG before upload — caps
// image tokens (cost) and keeps the request well under platform size limits.
const prepareImage = (file: File): Promise<{ mediaType: string; dataBase64: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode_failed'));
      img.onload = () => {
        const max = 1568;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas_failed'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ mediaType: 'image/jpeg', dataBase64: dataUrl.split(',')[1] ?? '' });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

const warnedFields = (warnings: string[]): Set<string> => {
  const set = new Set<string>();
  for (const w of warnings) {
    if (w.startsWith('amount')) set.add('amount');
    else if (w.startsWith('currency')) set.add('currency');
    else if (w.startsWith('period')) set.add('period');
    else if (w.startsWith('lastPaymentDate')) set.add('lastPaymentDate');
    else if (w.startsWith('category')) set.add('category');
    else if (w.startsWith('customDate')) set.add('customDate');
  }
  return set;
};

let draftCounter = 0;

export function AiCaptureModal({ isOpen, onClose, accessToken, onCommit, onManualFallback }: AiCaptureModalProps) {
  const { t } = useTranslation(['aiCapture', 'addSubscription', 'app']);
  const [phase, setPhase] = useState<Phase>('capture');
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ mediaType: string; dataBase64: string } | null>(null);
  const [drafts, setDrafts] = useState<DraftState[]>([]);
  const [quota, setQuota] = useState<ParseQuota | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPhase('capture');
      setText('');
      setImage(null);
      setDrafts([]);
      setQuota(null);
      setErrorCode(null);
      setSavedCount(0);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const errorMessage = (code: string): string => t([`aiCapture:errors.${code}`, 'aiCapture:errors.generic']);

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImage(await prepareImage(file));
    } catch {
      setErrorCode('image_too_large');
    }
  };

  const handleParse = async () => {
    setErrorCode(null);
    if (!text.trim() && !image) {
      setErrorCode('invalid_capture');
      return;
    }
    setPhase('parsing');
    try {
      const result = await parseCapture(accessToken, {
        text: text.trim() || undefined,
        image: image ?? undefined,
      });
      setQuota(result.quota);
      setDrafts(result.drafts.map((d) => ({ ...d, key: `d${draftCounter++}`, status: 'pending' as const })));
      setPhase('review');
    } catch (error) {
      setErrorCode(error instanceof AiParseError ? error.code : 'generic');
      setPhase('capture');
    }
  };

  const updateDraft = (key: string, patch: Partial<DraftSubscription>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch, error: undefined } : d)));
  };

  const saveDraft = async (draft: DraftState) => {
    updateDraft(draft.key, {});
    setDrafts((prev) => prev.map((d) => (d.key === draft.key ? { ...d, status: 'saving' } : d)));
    try {
      const subscription = createSubscriptionRecord({
        name: draft.name,
        category: draft.category,
        amount: draft.amount,
        currency: draft.currency,
        period: draft.period,
        lastPaymentDate: draft.lastPaymentDate,
        customDate: draft.period === 'custom' ? draft.customDate : undefined,
        notificationEnabled: draft.notificationEnabled,
      });
      await onCommit(subscription);
      setDrafts((prev) => prev.map((d) => (d.key === draft.key ? { ...d, status: 'saved' } : d)));
      setSavedCount((c) => c + 1);
    } catch (error) {
      setDrafts((prev) => prev.map((d) =>
        d.key === draft.key ? { ...d, status: 'pending', error: getSubscriptionValidationMessage(error) } : d
      ));
    }
  };

  const discardDraft = (key: string) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  };

  const remaining = drafts.filter((d) => d.status !== 'saved');
  const inputBase = 'w-full px-3 py-2 border rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm';
  const fieldBorder = (warned: boolean) => warned ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-600';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-lg max-w-lg w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white tracking-tight">{t('aiCapture:title')}</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {errorCode && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage(errorCode)}</span>
            </div>
          )}

          {phase !== 'review' && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('aiCapture:subtitle')}</p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder={t('aiCapture:textPlaceholder')}
                className={`${inputBase} ${fieldBorder(false)} resize-none`}
                disabled={phase === 'parsing'}
              />
              <div className="flex items-center gap-3">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
                {image ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    {t('aiCapture:imageReady')}
                    <button onClick={() => setImage(null)} className="text-gray-400 hover:text-red-500 underline">{t('aiCapture:removeImage')}</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={phase === 'parsing'}
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-2xl text-gray-600 dark:text-gray-300 hover:border-emerald-500"
                  >
                    <Upload className="w-4 h-4" /> {t('aiCapture:uploadImage')}
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500">🔒 {t('aiCapture:privacyNote')}</p>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleParse}
                  disabled={phase === 'parsing' || (!text.trim() && !image)}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 dark:bg-emerald-500 text-white py-2.5 px-4 rounded-2xl font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {phase === 'parsing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {phase === 'parsing' ? t('aiCapture:parsing') : t('aiCapture:parse')}
                </button>
                <button onClick={onManualFallback} className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600">
                  {t('aiCapture:manualFallback')}
                </button>
              </div>
            </>
          )}

          {phase === 'review' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {remaining.length > 0 ? t('aiCapture:reviewTitle', { count: drafts.length }) : t('aiCapture:done', { count: savedCount })}
                </p>
                {quota && <span className="text-xs text-gray-400 dark:text-gray-500">{t('aiCapture:quotaRemaining', { remaining: quota.remaining, limit: quota.limit })}</span>}
              </div>

              {drafts.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">{t('aiCapture:noneFound')}</p>}
              {drafts.length > 0 && remaining.length > 0 && <p className="text-xs text-gray-400 dark:text-gray-500">{t('aiCapture:reviewHint')}</p>}

              <div className="space-y-3">
                {drafts.filter((d) => d.status !== 'saved').map((draft) => {
                  const warned = warnedFields(draft.warnings);
                  return (
                    <div key={draft.key} className="border border-gray-200 dark:border-gray-700 rounded-2xl p-3 space-y-2 bg-gray-50/50 dark:bg-gray-800/40">
                      <input
                        value={draft.name}
                        onChange={(e) => updateDraft(draft.key, { name: e.target.value })}
                        placeholder={t('addSubscription:nameLabel')}
                        className={`${inputBase} ${fieldBorder(false)} font-medium`}
                      />
                      <div className="flex gap-2">
                        <input
                          type="number" step="0.01" min="0"
                          value={draft.amount}
                          onChange={(e) => updateDraft(draft.key, { amount: Number(e.target.value) })}
                          className={`${inputBase} ${fieldBorder(warned.has('amount'))} w-[40%]`}
                        />
                        <select
                          value={draft.currency}
                          onChange={(e) => updateDraft(draft.key, { currency: e.target.value as Currency })}
                          className={`${inputBase} ${fieldBorder(warned.has('currency'))} w-[30%]`}
                        >
                          {SUBSCRIPTION_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select
                          value={draft.period}
                          onChange={(e) => updateDraft(draft.key, { period: e.target.value as Period })}
                          className={`${inputBase} ${fieldBorder(warned.has('period'))} w-[30%]`}
                        >
                          {SUBSCRIPTION_PERIODS.map((p) => <option key={p} value={p}>{t(`addSubscription:period${p.charAt(0).toUpperCase()}${p.slice(1)}`)}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={draft.category}
                          onChange={(e) => updateDraft(draft.key, { category: e.target.value })}
                          placeholder={t('addSubscription:categoryLabel')}
                          className={`${inputBase} ${fieldBorder(warned.has('category'))} flex-1`}
                        />
                        <input
                          type="date"
                          value={draft.lastPaymentDate}
                          onChange={(e) => updateDraft(draft.key, { lastPaymentDate: e.target.value })}
                          className={`${inputBase} ${fieldBorder(warned.has('lastPaymentDate'))} flex-1`}
                        />
                      </div>
                      {draft.period === 'custom' && (
                        <input
                          type="number" min="1"
                          value={draft.customDate ?? ''}
                          onChange={(e) => updateDraft(draft.key, { customDate: e.target.value })}
                          placeholder={t('addSubscription:customPeriodLabel')}
                          className={`${inputBase} ${fieldBorder(warned.has('customDate'))}`}
                        />
                      )}

                      {draft.warnings.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {draft.warnings.map((w) => (
                            <span key={w} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                              {t([`aiCapture:warnings.${w}`, 'aiCapture:needsReview'])}
                            </span>
                          ))}
                        </div>
                      )}
                      {draft.error && <p className="text-xs text-red-600 dark:text-red-400">{draft.error}</p>}

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => saveDraft(draft)}
                          disabled={draft.status === 'saving'}
                          className="flex items-center justify-center gap-1.5 flex-1 bg-emerald-600 dark:bg-emerald-500 text-white py-2 rounded-2xl text-sm font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {draft.status === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          {draft.status === 'saving' ? t('aiCapture:saving') : t('aiCapture:save')}
                        </button>
                        <button onClick={() => discardDraft(draft.key)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl text-sm hover:bg-gray-200 dark:hover:bg-gray-600">
                          {t('aiCapture:discard')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-1">
                {remaining.length === 0 ? (
                  <button onClick={onClose} className="flex-1 bg-emerald-600 dark:bg-emerald-500 text-white py-2.5 rounded-2xl font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600">
                    {t('aiCapture:close')}
                  </button>
                ) : (
                  <button onClick={() => { setPhase('capture'); setErrorCode(null); }} className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-2xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600">
                    {t('aiCapture:retry')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
