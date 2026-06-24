import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Subscription, Currency, Period } from '../types';
import {
  SUBSCRIPTION_CURRENCIES,
  SUBSCRIPTION_PERIODS,
  createSubscriptionRecord,
  getSubscriptionValidationMessage,
} from '../utils/subscriptionDomain';
import { buildAiSubscriptionContext, type AiCommand } from '../utils/aiCommand';
import { formatCurrency } from '../utils/currency';
import { parseCapture, AiParseError, type DraftSubscription, type ParseQuota } from '../services/aiParseService';

export interface UndoableAiAction {
  id: string;
  message: string;
  undoLabel: string;
  undo: () => Promise<void>;
  onRestored?: () => void;
}

interface AiCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  subscriptions: Subscription[];
  onCreate: (subscription: Subscription) => Promise<Subscription>;
  onUpdate: (subscription: Subscription) => Promise<Subscription>;
  onDelete: (subscriptionId: string) => Promise<void>;
  onShowUndo: (action: UndoableAiAction) => void;
  onManualFallback: () => void;
}

type Phase = 'capture' | 'parsing' | 'review';
type ActionStatus = 'pending' | 'saving' | 'done';

interface DraftState extends DraftSubscription {
  key: string;
  status: 'pending' | 'saving' | 'saved';
  error?: string;
}

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

const isPositiveWholeDays = (value: unknown): boolean =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value);

let draftCounter = 0;

export function AiCaptureModal({
  isOpen,
  onClose,
  accessToken,
  subscriptions,
  onCreate,
  onUpdate,
  onDelete,
  onShowUndo,
  onManualFallback,
}: AiCaptureModalProps) {
  const { t } = useTranslation(['aiCapture', 'addSubscription', 'app']);
  const [phase, setPhase] = useState<Phase>('capture');
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ mediaType: string; dataBase64: string } | null>(null);
  const [command, setCommand] = useState<AiCommand | null>(null);
  const [drafts, setDrafts] = useState<DraftState[]>([]);
  const [quota, setQuota] = useState<ParseQuota | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [actionStatus, setActionStatus] = useState<ActionStatus>('pending');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSnapshot, setActionSnapshot] = useState<Subscription | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPhase('capture');
      setText('');
      setImage(null);
      setCommand(null);
      setDrafts([]);
      setQuota(null);
      setErrorCode(null);
      setSavedCount(0);
      setActionStatus('pending');
      setActionError(null);
      setActionSnapshot(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const errorMessage = (code: string): string => t([`aiCapture:errors.${code}`, 'aiCapture:errors.generic']);
  const inputBase = 'w-full px-3 py-2 border rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm';
  const fieldBorder = (warned: boolean) => warned ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-600';

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
    setActionError(null);
    if (!text.trim() && !image) {
      setErrorCode('invalid_capture');
      return;
    }
    setPhase('parsing');
    try {
      const result = await parseCapture(accessToken, {
        text: text.trim() || undefined,
        image: image ?? undefined,
        subscriptions: buildAiSubscriptionContext(subscriptions),
      });
      setQuota(result.quota);
      setCommand(result.command);
      setDrafts(result.command.type === 'create'
        ? result.command.drafts.map((d) => ({ ...d, key: `d${draftCounter++}`, status: 'pending' as const }))
        : []);
      setActionStatus('pending');
      setActionSnapshot(null);
      setPhase('review');
    } catch (error) {
      setErrorCode(error instanceof AiParseError ? error.code : 'generic');
      setPhase('capture');
    }
  };

  const updateDraft = (key: string, patch: Partial<DraftSubscription>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch, error: undefined } : d)));
  };

  const findTargetForCommand = (candidate: AiCommand | null): Subscription | null => {
    if (!candidate || (candidate.type !== 'update' && candidate.type !== 'delete')) {
      return null;
    }
    return subscriptions.find(subscription => subscription.id === candidate.subscriptionId) ?? actionSnapshot;
  };

  const updateMissingFields = (
    nextCommand: Extract<AiCommand, { type: 'update' }>,
    targetSubscription: Subscription | null
  ): Extract<AiCommand, { type: 'update' }> => {
    const period = nextCommand.patch.period ?? targetSubscription?.period;
    const customDate = nextCommand.patch.customDate ?? targetSubscription?.customDate;
    const missingFields = period === 'custom' && !isPositiveWholeDays(customDate)
      ? ['customDate' as const]
      : [];

    return {
      ...nextCommand,
      ...(missingFields.length > 0 ? { missingFields } : { missingFields: undefined }),
    };
  };

  const updateCommandPatch = (patch: Extract<AiCommand, { type: 'update' }>['patch']) => {
    setCommand((prev) => {
      if (!prev || prev.type !== 'update') {
        return prev;
      }

      const nextCommand = {
        ...prev,
        patch: { ...prev.patch, ...patch },
      };

      return updateMissingFields(nextCommand, findTargetForCommand(prev));
    });
    setActionError(null);
  };

  const findTarget = (): Subscription | null => {
    return findTargetForCommand(command);
  };

  const restoreReview = (snapshot?: Subscription | null, draftKey?: string) => {
    if (!mountedRef.current) return;
    setPhase('review');
    setActionStatus('pending');
    setActionError(null);
    if (snapshot) {
      setActionSnapshot(snapshot);
    }
    if (draftKey) {
      setDrafts((prev) => prev.map((draft) =>
        draft.key === draftKey ? { ...draft, status: 'pending', error: undefined } : draft
      ));
      setSavedCount((count) => Math.max(0, count - 1));
    }
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
      const created = await onCreate(subscription);
      setDrafts((prev) => prev.map((d) => (d.key === draft.key ? { ...d, status: 'saved' } : d)));
      setSavedCount((c) => c + 1);
      onShowUndo({
        id: crypto.randomUUID(),
        message: t('aiCapture:undo.created', { name: created.name }),
        undoLabel: t('aiCapture:undo.action'),
        undo: async () => {
          await onDelete(created.id);
        },
        onRestored: () => restoreReview(null, draft.key),
      });
    } catch (error) {
      setDrafts((prev) => prev.map((d) =>
        d.key === draft.key ? { ...d, status: 'pending', error: getSubscriptionValidationMessage(error) } : d
      ));
    }
  };

  const discardDraft = (key: string) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  };

  const confirmDelete = async () => {
    const target = findTarget();
    if (!target) {
      setActionError(t('aiCapture:targetMissing'));
      return;
    }

    setActionStatus('saving');
    setActionError(null);
    try {
      await onDelete(target.id);
      setActionSnapshot(target);
      setActionStatus('done');
      onShowUndo({
        id: crypto.randomUUID(),
        message: t('aiCapture:undo.deleted', { name: target.name }),
        undoLabel: t('aiCapture:undo.action'),
        undo: async () => {
          await onCreate(target);
        },
        onRestored: () => restoreReview(target),
      });
    } catch (error) {
      setActionStatus('pending');
      setActionError(getSubscriptionValidationMessage(error));
    }
  };

  const confirmUpdate = async () => {
    const target = findTarget();
    if (!target || !command || command.type !== 'update') {
      setActionError(t('aiCapture:targetMissing'));
      return;
    }
    if ((command.missingFields ?? []).length > 0) {
      setActionError(t('aiCapture:missingFieldsHint'));
      return;
    }

    const updated = {
      ...target,
      ...command.patch,
      customDate: command.patch.period && command.patch.period !== 'custom'
        ? undefined
        : command.patch.customDate ?? target.customDate,
    };
    setActionStatus('saving');
    setActionError(null);
    try {
      await onUpdate(updated);
      setActionSnapshot(target);
      setActionStatus('done');
      onShowUndo({
        id: crypto.randomUUID(),
        message: t('aiCapture:undo.updated', { name: target.name }),
        undoLabel: t('aiCapture:undo.action'),
        undo: async () => {
          await onUpdate(target);
        },
        onRestored: () => restoreReview(target),
      });
    } catch (error) {
      setActionStatus('pending');
      setActionError(getSubscriptionValidationMessage(error));
    }
  };

  const remaining = drafts.filter((d) => d.status !== 'saved');
  const target = findTarget();

  const renderCommandReview = () => {
    if (!command || command.type === 'none') {
      return (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 p-5 text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('aiCapture:noneAction')}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {command?.type === 'none' && command.reason ? command.reason : t('aiCapture:noneFound')}
          </p>
        </div>
      );
    }

    if (command.type === 'delete') {
      return (
        <div className="rounded-2xl border border-red-100 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/20 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-300" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {actionStatus === 'done'
                  ? t('aiCapture:deleteDone', { name: actionSnapshot?.name ?? target?.name ?? '' })
                  : t('aiCapture:deleteTitle', { name: target?.name ?? t('aiCapture:unknownTarget') })}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t('aiCapture:deleteHint')}</p>
            </div>
          </div>
          {actionError && <p className="text-xs text-red-600 dark:text-red-300">{actionError}</p>}
          {actionStatus !== 'done' && (
            <button
              onClick={confirmDelete}
              disabled={actionStatus === 'saving' || !target}
              className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-2xl font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {actionStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {actionStatus === 'saving' ? t('aiCapture:deleting') : t('aiCapture:confirmDelete')}
            </button>
          )}
        </div>
      );
    }

    if (command.type === 'update') {
      const showCustomDateInput = command.patch.period === 'custom' || (command.missingFields ?? []).includes('customDate');
      const customDateValue = command.patch.customDate ?? target?.customDate ?? '';
      const hasMissingFields = (command.missingFields ?? []).length > 0;
      const patchEntries = Object.entries(command.patch).filter(([field]) => !(showCustomDateInput && field === 'customDate'));
      return (
        <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {actionStatus === 'done'
                  ? t('aiCapture:updateDone', { name: actionSnapshot?.name ?? target?.name ?? '' })
                  : t('aiCapture:updateTitle', { name: target?.name ?? t('aiCapture:unknownTarget') })}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t('aiCapture:updateHint')}</p>
            </div>
          </div>
          <div className="space-y-2">
            {patchEntries.map(([field, value]) => (
              <div key={field} className="flex items-center justify-between gap-3 rounded-xl bg-white/80 dark:bg-gray-800/60 px-3 py-2 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t(`aiCapture:fields.${field}`)}</span>
                <span className="font-medium text-gray-900 dark:text-white text-right">
                  {field === 'amount' && target
                    ? formatCurrency(Number(value), (command.patch.currency ?? target.currency) as Currency)
                    : String(value)}
                </span>
              </div>
            ))}
          </div>
          {showCustomDateInput && (
            <div className="rounded-xl bg-white/80 dark:bg-gray-800/60 px-3 py-3 space-y-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400" htmlFor="ai-update-custom-date">
                {t('aiCapture:fields.customDate')}
              </label>
              <input
                id="ai-update-custom-date"
                type="number"
                min="1"
                value={customDateValue}
                onChange={(e) => updateCommandPatch({ customDate: e.target.value })}
                placeholder={t('addSubscription:customPeriodLabel')}
                className={`${inputBase} ${fieldBorder(hasMissingFields)}`}
              />
              {hasMissingFields && (
                <p className="text-xs text-amber-700 dark:text-amber-300">{t('aiCapture:missingFieldsHint')}</p>
              )}
            </div>
          )}
          {actionError && <p className="text-xs text-red-600 dark:text-red-300">{actionError}</p>}
          {actionStatus !== 'done' && (
            <button
              onClick={confirmUpdate}
              disabled={actionStatus === 'saving' || !target || hasMissingFields}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 dark:bg-emerald-500 text-white py-2.5 rounded-2xl font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50"
            >
              {actionStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {actionStatus === 'saving' ? t('aiCapture:updating') : t('aiCapture:confirmUpdate')}
            </button>
          )}
        </div>
      );
    }

    return (
      <>
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
      </>
    );
  };

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

              <p className="text-xs text-gray-400 dark:text-gray-500">{t('aiCapture:privacyNote')}</p>

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
                  {command?.type === 'create'
                    ? (remaining.length > 0 ? t('aiCapture:reviewTitle', { count: drafts.length }) : t('aiCapture:done', { count: savedCount }))
                    : t('aiCapture:commandReviewTitle')}
                </p>
                {quota && <span className="text-xs text-gray-400 dark:text-gray-500">{t('aiCapture:quotaRemaining', { remaining: quota.remaining, limit: quota.limit })}</span>}
              </div>

              {renderCommandReview()}

              <div className="flex gap-3 pt-1">
                {(command?.type === 'create' ? remaining.length === 0 : actionStatus === 'done') ? (
                  <button onClick={onClose} className="flex-1 bg-emerald-600 dark:bg-emerald-500 text-white py-2.5 rounded-2xl font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600">
                    {t('aiCapture:close')}
                  </button>
                ) : (
                  <button onClick={() => { setPhase('capture'); setErrorCode(null); setActionError(null); }} className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-2xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600">
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
