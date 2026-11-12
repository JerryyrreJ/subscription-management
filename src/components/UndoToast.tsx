import { RotateCcw } from 'lucide-react';
import type { UndoableAiAction } from './AiCaptureModal';

interface UndoToastProps {
  undoAction: UndoableAiAction;
  undoError: string | null;
  onUndo: () => void;
}

export function UndoToast({ undoAction, undoError, onUndo }: UndoToastProps) {
  return (
    <div className="fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4 pointer-events-none animate-drawer-up">
      <button
        onClick={onUndo}
        className="pointer-events-auto relative flex items-center justify-between gap-3 bg-gray-900/95 dark:bg-[#1a1c1e]/95 text-white shadow-apple-xl backdrop-blur-xl px-5 py-3 rounded-2xl max-w-sm w-full group transition-all hover:bg-gray-800/95 dark:hover:bg-[#25282c]/95 active:scale-[0.98] focus:outline-none"
        aria-label={undoAction.undoLabel}
        title={undoAction.undoLabel}
      >
        <div className="absolute inset-0 rounded-2xl border border-gray-800/80 dark:border-gray-700/80 pointer-events-none" />

        <svg
          className="absolute inset-px h-[calc(100%-2px)] w-[calc(100%-2px)] pointer-events-none overflow-visible"
          aria-hidden="true"
        >
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="15"
            className="fill-none stroke-emerald-400 opacity-20"
            strokeWidth="2"
          />
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            rx="15"
            className="fill-none stroke-emerald-400 animate-undo-perimeter"
            strokeWidth="2"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset="0"
          />
        </svg>

        <div className="min-w-0 flex-1 text-left relative z-10 pl-1">
          <p className="text-sm font-medium truncate">{undoAction.message}</p>
          {undoError && <p className="text-xs text-red-400 mt-0.5">{undoError}</p>}
        </div>

        <div className="flex items-center gap-1.5 text-emerald-400 relative z-10 font-semibold text-sm pr-1">
          <RotateCcw className="w-4 h-4 group-hover:-rotate-12 transition-transform" />
          {undoAction.undoLabel}
        </div>
      </button>
    </div>
  );
}
