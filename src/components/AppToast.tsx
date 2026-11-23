import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type AppToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface AppToastMessage {
 id: string;
 variant: AppToastVariant;
 message: string;
}

interface AppToastProps {
 toast: AppToastMessage | null;
 onDismiss: () => void;
 dismissLabel: string;
 offsetBottom?: boolean;
}

const VARIANT_STYLES: Record<AppToastVariant, { container: string; icon: string }> = {
 success: {
  container: 'bg-emerald-950/95 dark:bg-emerald-950/95 border-emerald-700/60 text-emerald-50',
  icon: 'text-emerald-400',
 },
 error: {
  container: 'bg-red-950/95 dark:bg-red-950/95 border-red-700/60 text-red-50',
  icon: 'text-red-400',
 },
 warning: {
  container: 'bg-amber-950/95 dark:bg-amber-950/95 border-amber-700/60 text-amber-50',
  icon: 'text-amber-400',
 },
 info: {
  container: 'bg-gray-900/95 dark:bg-[#1a1c1e]/95 border-gray-700/80 text-white',
  icon: 'text-emerald-400',
 },
};

export function AppToast({ toast, onDismiss, dismissLabel, offsetBottom = false }: AppToastProps) {
 if (!toast) return null;

 const style = VARIANT_STYLES[toast.variant];
 const isAlert = toast.variant === 'error' || toast.variant === 'warning';
 const Icon = toast.variant === 'success'
  ? CheckCircle2
  : toast.variant === 'error'
   ? AlertCircle
   : toast.variant === 'warning'
    ? AlertTriangle
    : Info;

 return (
  <div
   className={`fixed inset-x-0 ${offsetBottom ? 'bottom-24' : 'bottom-6'} z-[130] flex justify-center px-4 pointer-events-none animate-drawer-up`}
  >
   <div
    role={isAlert ? 'alert' : 'status'}
    aria-live={isAlert ? 'assertive' : 'polite'}
    className={`pointer-events-auto flex items-center gap-3 border shadow-apple-xl backdrop-blur-xl px-4 py-3 rounded-2xl max-w-md w-full ${style.container}`}
   >
    <Icon className={`w-4 h-4 shrink-0 ${style.icon}`} aria-hidden="true" />
    <p className="min-w-0 flex-1 text-sm font-medium leading-snug break-words">{toast.message}</p>
    <button
     type="button"
     onClick={onDismiss}
     aria-label={dismissLabel}
     className="shrink-0 p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
    >
     <X className="w-4 h-4" />
    </button>
   </div>
  </div>
 );
}
