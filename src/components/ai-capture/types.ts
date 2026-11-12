import type { DraftSubscription } from '../../services/aiParseService';
import type { Subscription } from '../../types';

export interface UndoableAiAction {
  id: string;
  message: string;
  undoLabel: string;
  undo: () => Promise<void>;
  onRestored?: () => void;
}

export type Phase = 'capture' | 'parsing' | 'review';
export type ActionStatus = 'pending' | 'saving' | 'done';

export interface DraftState extends DraftSubscription {
  key: string;
  status: 'pending' | 'saving' | 'saved';
  error?: string;
}

export interface CreatedRecord {
  draftKey: string;
  subscription: Subscription;
}

export interface CompletionState {
  title: string;
  detail: string;
  undoAction?: UndoableAiAction;
}

export const AI_CAPTURE_INPUT_BASE =
  'w-full px-3 py-2 border rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm';

export const getAiCaptureFieldBorder = (warned: boolean): string =>
  warned ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-gray-600';
