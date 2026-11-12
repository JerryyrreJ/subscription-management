import './AiCaptureModal.css';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Subscription } from '../types';
import {
  createSubscriptionRecord,
  getSubscriptionValidationMessage,
} from '../utils/subscriptionDomain';
import { buildAiSubscriptionContext, type AiCommand, type AiUpdateOperation } from '../utils/aiCommand';
import { parseCapture, AiParseError, type DraftSubscription, type ParseQuota } from '../services/aiParseService';
import { getDateOnlyDay } from '../utils/dates';
import { coerceToExistingCategory, getAllCategories } from '../utils/categories';
import { constrainDraftCategories } from '../utils/subscriptionDraft';
import { AiDraftList } from './ai-capture/AiDraftList';
import { AiUpdatePatchFields } from './ai-capture/AiUpdatePatchFields';
import { prepareCaptureImage } from './ai-capture/imagePrep';
import {
  buildUpdatedSubscriptionFromPatch,
  updateMissingFields,
} from './ai-capture/patchMerge';
import {
  AI_CAPTURE_INPUT_BASE,
  getAiCaptureFieldBorder,
  type ActionStatus,
  type CompletionState,
  type CreatedRecord,
  type DraftState,
  type Phase,
  type UndoableAiAction,
} from './ai-capture/types';

export type { UndoableAiAction } from './ai-capture/types';

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
  useModalScrollLock(isOpen);
  const { t } = useTranslation(['aiCapture', 'addSubscription', 'app', 'categoryLabels']);
  const [phase, setPhase] = useState<Phase>('capture');
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ mediaType: string; dataBase64: string } | null>(null);
  const [command, setCommand] = useState<AiCommand | null>(null);
  const [drafts, setDrafts] = useState<DraftState[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [quota, setQuota] = useState<ParseQuota | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [actionStatus, setActionStatus] = useState<ActionStatus>('pending');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSnapshot, setActionSnapshot] = useState<Subscription | null>(null);
  const [batchSnapshots, setBatchSnapshots] = useState<Subscription[]>([]);
  const [createdRecords, setCreatedRecords] = useState<CreatedRecord[]>([]);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [inlineUndoStatus, setInlineUndoStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const input = textRef.current;
    if (!input) return;
    const resize = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [text, phase, isOpen]);

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
      setCategories(getAllCategories());
      setQuota(null);
      setErrorCode(null);
      setSavedCount(0);
      setActionStatus('pending');
      setActionError(null);
      setActionSnapshot(null);
      setBatchSnapshots([]);
      setCreatedRecords([]);
      setCompletion(null);
      setInlineUndoStatus('idle');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const errorMessage = (code: string): string => t([`aiCapture:errors.${code}`, 'aiCapture:errors.generic']);

  const showUndoAction = (action: UndoableAiAction) => {
    setCompletion((prev) => (prev ? { ...prev, undoAction: action } : prev));
    setInlineUndoStatus('idle');
    onShowUndo(action);
  };

  const createUndoAction = (action: UndoableAiAction): UndoableAiAction => {
    let didRun = false;
    let didRestore = false;

    return {
      ...action,
      undo: async () => {
        if (didRun) {
          return;
        }
        didRun = true;
        await action.undo();
      },
      onRestored: () => {
        if (didRestore) {
          return;
        }
        didRestore = true;
        action.onRestored?.();
      },
    };
  };

  const handleInlineUndo = async () => {
    if (!completion?.undoAction || inlineUndoStatus === 'running' || inlineUndoStatus === 'done') {
      return;
    }

    setInlineUndoStatus('running');
    setActionError(null);
    try {
      await completion.undoAction.undo();
      completion.undoAction.onRestored?.();
      setInlineUndoStatus('done');
      setCompletion(null);
    } catch (error) {
      setInlineUndoStatus('idle');
      setActionError(getSubscriptionValidationMessage(error));
    }
  };

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImage(await prepareCaptureImage(file));
    } catch {
      setErrorCode('image_too_large');
    }
  };

  const handleParse = async () => {
    setErrorCode(null);
    setActionError(null);
    setCompletion(null);
    setCreatedRecords([]);
    setInlineUndoStatus('idle');
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
      const allowedCategories = getAllCategories();
      setCategories(allowedCategories);

      let nextCommand = result.command;
      if (nextCommand.type === 'update' && nextCommand.patch.category) {
        nextCommand = {
          ...nextCommand,
          patch: {
            ...nextCommand.patch,
            category: coerceToExistingCategory(nextCommand.patch.category, allowedCategories).category,
          },
        };
      } else if (nextCommand.type === 'batchUpdate') {
        nextCommand = {
          ...nextCommand,
          updates: nextCommand.updates.map((update) => {
            if (!update.patch.category) {
              return update;
            }
            return {
              ...update,
              patch: {
                ...update.patch,
                category: coerceToExistingCategory(update.patch.category, allowedCategories).category,
              },
            };
          }),
        };
      }

      setCommand(nextCommand);
      setDrafts(
        nextCommand.type === 'create'
          ? constrainDraftCategories(nextCommand.drafts, allowedCategories).map((draft) => ({
              ...draft,
              key: `d${draftCounter++}`,
              status: 'pending' as const,
            }))
          : []
      );
      setActionStatus('pending');
      setActionSnapshot(null);
      setPhase('review');
    } catch (error) {
      setErrorCode(error instanceof AiParseError ? error.code : 'generic');
      setPhase('capture');
    }
  };

  const updateDraft = (key: string, patch: Partial<DraftSubscription>) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, ...patch, error: undefined } : draft)));
  };

  const findTargetForCommand = (candidate: AiCommand | null): Subscription | null => {
    if (!candidate || (candidate.type !== 'update' && candidate.type !== 'delete')) {
      return null;
    }
    return subscriptions.find((subscription) => subscription.id === candidate.subscriptionId) ?? actionSnapshot;
  };

  const findTargetForUpdate = (update: AiUpdateOperation): Subscription | null =>
    subscriptions.find((subscription) => subscription.id === update.subscriptionId) ??
    batchSnapshots.find((subscription) => subscription.id === update.subscriptionId) ??
    null;

  const updateCommandPatch = (patch: Extract<AiCommand, { type: 'update' }>['patch']) => {
    setCommand((prev) => {
      if (!prev || prev.type !== 'update') {
        return prev;
      }

      const nextCommand = {
        ...prev,
        patch: { ...prev.patch, ...patch },
      };

      return {
        type: 'update',
        ...updateMissingFields(nextCommand, findTargetForCommand(prev)),
      };
    });
    setActionError(null);
  };

  const updateBatchPatch = (index: number, patch: AiUpdateOperation['patch']) => {
    setCommand((prev) => {
      if (!prev || prev.type !== 'batchUpdate') {
        return prev;
      }

      const updates = prev.updates.map((update, currentIndex) => {
        if (currentIndex !== index) {
          return update;
        }

        const nextUpdate = {
          ...update,
          patch: { ...update.patch, ...patch },
        };

        return updateMissingFields(nextUpdate, findTargetForUpdate(update));
      });

      return { ...prev, updates };
    });
    setActionError(null);
  };

  const restoreReview = (snapshot?: Subscription | null, draftKey?: string) => {
    if (!mountedRef.current) return;
    setPhase('review');
    setActionStatus('pending');
    setActionError(null);
    setCompletion(null);
    setInlineUndoStatus('idle');
    if (snapshot) {
      setActionSnapshot(snapshot);
    }
    if (draftKey) {
      setDrafts((prev) =>
        prev.map((draft) => (draft.key === draftKey ? { ...draft, status: 'pending', error: undefined } : draft))
      );
      setSavedCount((count) => Math.max(0, count - 1));
    }
  };

  const restoreBatchReview = (snapshots: Subscription[]) => {
    if (!mountedRef.current) return;
    setPhase('review');
    setActionStatus('pending');
    setActionError(null);
    setCompletion(null);
    setInlineUndoStatus('idle');
    setBatchSnapshots(snapshots);
  };

  const restoreCreateReview = (records: CreatedRecord[]) => {
    if (!mountedRef.current) return;
    const restoredKeys = new Set(records.map((record) => record.draftKey));
    setPhase('review');
    setActionStatus('pending');
    setActionError(null);
    setCompletion(null);
    setInlineUndoStatus('idle');
    setDrafts((prev) =>
      prev.map((draft) => (restoredKeys.has(draft.key) ? { ...draft, status: 'pending', error: undefined } : draft))
    );
    setCreatedRecords((prev) => prev.filter((record) => !restoredKeys.has(record.draftKey)));
    setSavedCount((count) => Math.max(0, count - records.length));
  };

  const saveDraft = async (draft: DraftState) => {
    updateDraft(draft.key, {});
    setDrafts((prev) => prev.map((item) => (item.key === draft.key ? { ...item, status: 'saving' } : item)));
    try {
      const subscription = createSubscriptionRecord({
        name: draft.name,
        category: draft.category,
        amount: draft.amount,
        currency: draft.currency,
        period: draft.period,
        nextPaymentDate: draft.nextPaymentDate,
        billingAnchorDay: draft.period === 'monthly' ? getDateOnlyDay(draft.nextPaymentDate) : undefined,
        customDate: draft.period === 'custom' ? draft.customDate : undefined,
        notificationEnabled: draft.notificationEnabled,
      });
      const created = await onCreate(subscription);
      const nextCreatedRecords = [...createdRecords, { draftKey: draft.key, subscription: created }];
      const willComplete = drafts.filter((item) => item.status !== 'saved' && item.key !== draft.key).length === 0;
      setDrafts((prev) => prev.map((item) => (item.key === draft.key ? { ...item, status: 'saved' } : item)));
      setSavedCount((count) => count + 1);
      setCreatedRecords(nextCreatedRecords);
      if (willComplete) {
        const undoAction = createUndoAction({
          id: crypto.randomUUID(),
          message: t('aiCapture:undo.batchCreated', { count: nextCreatedRecords.length }),
          undoLabel: t('aiCapture:undo.action'),
          undo: async () => {
            for (const record of [...nextCreatedRecords].reverse()) {
              await onDelete(record.subscription.id);
            }
          },
          onRestored: () => restoreCreateReview(nextCreatedRecords),
        });
        setCompletion({
          title: t('aiCapture:completeTitle'),
          detail: t('aiCapture:createCompleteDetail', { count: nextCreatedRecords.length }),
          undoAction,
        });
        showUndoAction(undoAction);
      }
    } catch (error) {
      setDrafts((prev) =>
        prev.map((item) =>
          item.key === draft.key ? { ...item, status: 'pending', error: getSubscriptionValidationMessage(error) } : item
        )
      );
    }
  };

  const discardDraft = (key: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.key !== key));
  };

  const target = findTargetForCommand(command);

  const confirmDelete = async () => {
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
      const undoAction = createUndoAction({
        id: crypto.randomUUID(),
        message: t('aiCapture:undo.deleted', { name: target.name }),
        undoLabel: t('aiCapture:undo.action'),
        undo: async () => {
          await onCreate(target);
        },
        onRestored: () => restoreReview(target),
      });
      setCompletion({
        title: t('aiCapture:completeTitle'),
        detail: t('aiCapture:deleteCompleteDetail', { name: target.name }),
        undoAction,
      });
      showUndoAction(undoAction);
    } catch (error) {
      setActionStatus('pending');
      setActionError(getSubscriptionValidationMessage(error));
    }
  };

  const confirmUpdate = async () => {
    if (!target || !command || command.type !== 'update') {
      setActionError(t('aiCapture:targetMissing'));
      return;
    }
    if ((command.missingFields ?? []).length > 0) {
      setActionError(t('aiCapture:missingFieldsHint'));
      return;
    }

    const updated = buildUpdatedSubscriptionFromPatch(target, command.patch);
    setActionStatus('saving');
    setActionError(null);
    try {
      await onUpdate(updated);
      setActionSnapshot(target);
      setActionStatus('done');
      const undoAction = createUndoAction({
        id: crypto.randomUUID(),
        message: t('aiCapture:undo.updated', { name: target.name }),
        undoLabel: t('aiCapture:undo.action'),
        undo: async () => {
          await onUpdate(target);
        },
        onRestored: () => restoreReview(target),
      });
      setCompletion({
        title: t('aiCapture:completeTitle'),
        detail: t('aiCapture:updateCompleteDetail', { name: target.name }),
        undoAction,
      });
      showUndoAction(undoAction);
    } catch (error) {
      setActionStatus('pending');
      setActionError(getSubscriptionValidationMessage(error));
    }
  };

  const confirmBatchUpdate = async () => {
    if (!command || command.type !== 'batchUpdate') {
      setActionError(t('aiCapture:targetMissing'));
      return;
    }

    const updatePlans = command.updates.map((update) => ({
      update,
      target: findTargetForUpdate(update),
    }));
    if (updatePlans.some((plan) => !plan.target)) {
      setActionError(t('aiCapture:targetMissing'));
      return;
    }
    if (command.updates.some((update) => (update.missingFields ?? []).length > 0)) {
      setActionError(t('aiCapture:missingFieldsHint'));
      return;
    }

    const snapshots = updatePlans.map((plan) => plan.target as Subscription);
    setActionStatus('saving');
    setActionError(null);
    try {
      for (const plan of updatePlans) {
        await onUpdate(buildUpdatedSubscriptionFromPatch(plan.target as Subscription, plan.update.patch));
      }
      setBatchSnapshots(snapshots);
      setActionStatus('done');
      const undoAction = createUndoAction({
        id: crypto.randomUUID(),
        message: t('aiCapture:undo.batchUpdated', { count: snapshots.length }),
        undoLabel: t('aiCapture:undo.action'),
        undo: async () => {
          for (const snapshot of snapshots) {
            await onUpdate(snapshot);
          }
        },
        onRestored: () => restoreBatchReview(snapshots),
      });
      setCompletion({
        title: t('aiCapture:completeTitle'),
        detail: t('aiCapture:batchUpdateCompleteDetail', { count: snapshots.length }),
        undoAction,
      });
      showUndoAction(undoAction);
    } catch (error) {
      setActionStatus('pending');
      setActionError(getSubscriptionValidationMessage(error));
    }
  };

  const remaining = drafts.filter((draft) => draft.status !== 'saved');

  const renderCompletion = () => (
    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/25 p-5 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-600 dark:bg-emerald-500 text-white flex items-center justify-center shadow-sm">
        <CheckCircle2 className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-gray-900 dark:text-white">
          {completion?.title ?? t('aiCapture:completeTitle')}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {completion?.detail ?? t('aiCapture:completeDetail')}
        </p>
      </div>
      {completion?.undoAction && (
        <button
          type="button"
          onClick={handleInlineUndo}
          disabled={inlineUndoStatus === 'running' || inlineUndoStatus === 'done'}
          className="w-full flex items-center justify-center gap-2 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 bg-white/70 dark:bg-emerald-950/20 py-2.5 rounded-2xl font-medium hover:bg-white dark:hover:bg-emerald-900/30 disabled:opacity-50"
        >
          {inlineUndoStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          {inlineUndoStatus === 'running' ? t('aiCapture:undoing') : t('aiCapture:undo.action')}
        </button>
      )}
      {actionError && <p className="text-xs text-red-600 dark:text-red-300">{actionError}</p>}
    </div>
  );

  const renderCommandReview = () => {
    if (completion && (command?.type === 'create' ? remaining.length === 0 : actionStatus === 'done')) {
      return renderCompletion();
    }

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

    if (command.type === 'batchUpdate') {
      const hasMissingFields = command.updates.some((update) => (update.missingFields ?? []).length > 0);
      return (
        <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {actionStatus === 'done'
                  ? t('aiCapture:batchUpdateDone', { count: batchSnapshots.length || command.updates.length })
                  : t('aiCapture:batchUpdateTitle', { count: command.updates.length })}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t('aiCapture:updateHint')}</p>
            </div>
          </div>

          <div className="space-y-3">
            {command.updates.map((update, index) => {
              const updateTarget = findTargetForUpdate(update);
              return (
                <div
                  key={`${update.subscriptionId}-${index}`}
                  className="rounded-2xl border border-emerald-100/80 dark:border-emerald-900/40 bg-white/55 dark:bg-gray-900/20 p-3 space-y-3"
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {updateTarget?.name ?? t('aiCapture:unknownTarget')}
                  </p>
                  <AiUpdatePatchFields
                    update={update}
                    targetSubscription={updateTarget}
                    categories={categories}
                    keyPrefix={`ai-batch-update-${index}`}
                    onPatchChange={(patch) => updateBatchPatch(index, patch)}
                  />
                </div>
              );
            })}
          </div>

          {actionError && <p className="text-xs text-red-600 dark:text-red-300">{actionError}</p>}
          {actionStatus !== 'done' && (
            <button
              onClick={confirmBatchUpdate}
              disabled={actionStatus === 'saving' || hasMissingFields}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 dark:bg-emerald-500 text-white py-2.5 rounded-2xl font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50"
            >
              {actionStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {actionStatus === 'saving' ? t('aiCapture:updating') : t('aiCapture:confirmBatchUpdate', { count: command.updates.length })}
            </button>
          )}
        </div>
      );
    }

    if (command.type === 'update') {
      const hasMissingFields = (command.missingFields ?? []).length > 0;
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
          <AiUpdatePatchFields
            update={command}
            targetSubscription={target}
            categories={categories}
            keyPrefix="ai-update"
            onPatchChange={updateCommandPatch}
          />
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
      <AiDraftList
        drafts={drafts}
        categories={categories}
        onUpdateDraft={updateDraft}
        onSaveDraft={saveDraft}
        onDiscardDraft={discardDraft}
      />
    );
  };

  return (
    <div className="fixed inset-0 mobile-modal-viewport ai-capture-overlay bg-black bg-opacity-50 dark:bg-opacity-70 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="ai-capture-title" className="ai-capture-panel shadow-apple-lg">
        <div className="ai-capture-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 id="ai-capture-title" className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-white tracking-tight">
              {t('aiCapture:title')}
            </h2>
          </div>
          <button onClick={onClose} aria-label={t('aiCapture:close')} className="ai-capture-close text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="ai-capture-body space-y-4">
          {errorCode && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage(errorCode)}</span>
            </div>
          )}

          {phase !== 'review' && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="hidden sm:inline">{t('aiCapture:subtitle')}</span>
                <span className="sm:hidden">{t('aiCapture:mobileSubtitle')}</span>
              </p>
              <textarea
                ref={textRef}
                aria-label={t('aiCapture:inputLabel')}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder={t('aiCapture:shortPlaceholder')}
                className={`${AI_CAPTURE_INPUT_BASE} ${getAiCaptureFieldBorder(false)} ai-capture-input resize-none`}
                disabled={phase === 'parsing'}
              />
              <details className="text-sm text-gray-500 dark:text-gray-400">
                <summary className="cursor-pointer py-1">{t('aiCapture:examplesLabel')}</summary>
                <p className="pt-2">{t('aiCapture:textPlaceholder')}</p>
              </details>
              <div className="flex items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImage(e.target.files?.[0])}
                />
                {image ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <ImageIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    {t('aiCapture:imageReady')}
                    <button onClick={() => setImage(null)} className="text-gray-400 hover:text-red-500 underline">
                      {t('aiCapture:removeImage')}
                    </button>
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
                {quota && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {t('aiCapture:quotaRemaining', { remaining: quota.remaining, limit: quota.limit })}
                  </span>
                )}
              </div>

              {renderCommandReview()}

              <div className="flex gap-3 pt-1">
                {(command?.type === 'create' ? remaining.length === 0 : actionStatus === 'done') ? (
                  <button
                    onClick={onClose}
                    className="flex-1 bg-emerald-600 dark:bg-emerald-500 text-white py-2.5 rounded-2xl font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600"
                  >
                    {t('aiCapture:close')}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setPhase('capture');
                      setErrorCode(null);
                      setActionError(null);
                    }}
                    className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-2xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    {t('aiCapture:retry')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {phase !== 'review' && (
          <div className="ai-capture-actions">
            <button
              onClick={() => {
                textRef.current?.blur();
                void handleParse();
              }}
              disabled={phase === 'parsing' || (!text.trim() && !image)}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 dark:bg-emerald-500 text-white py-2.5 px-4 rounded-2xl font-medium hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === 'parsing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {phase === 'parsing' ? t('aiCapture:parsing') : t('aiCapture:parse')}
            </button>
            <button onClick={onManualFallback} className="ai-capture-manual text-gray-600 dark:text-gray-300">
              {t('aiCapture:manualFallback')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
