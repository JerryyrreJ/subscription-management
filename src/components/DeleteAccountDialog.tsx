import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

interface DeleteAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteAccountDialog({
  isOpen,
  onClose,
  onConfirm,
}: DeleteAccountDialogProps) {
  const { t } = useTranslation(['accountModals']);
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const confirmationPhrase = t('accountModals:deleteAccountConfirmationPhrase');
  const isConfirmed = confirmation.trim() === confirmationPhrase;

  useEffect(() => {
    if (!isOpen) {
      setConfirmation('');
      setError('');
      setIsDeleting(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDeleting, isOpen, onClose]);

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;

    setIsDeleting(true);
    setError('');

    try {
      await onConfirm();
    } catch {
      setError(t('accountModals:deleteAccountFailed'));
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-stone-950/70 p-3 backdrop-blur-xl sm:p-6"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isDeleting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="relative w-full max-w-xl overflow-hidden rounded-[1.75rem] border border-red-200/80 bg-[#fffdf9] shadow-[0_32px_100px_-28px_rgba(69,10,10,0.7)] dark:border-red-900/60 dark:bg-[#171313]"
      >
        <div className="h-1.5 bg-gradient-to-r from-red-700 via-red-500 to-orange-400" />
        <button
          type="button"
          onClick={onClose}
          disabled={isDeleting}
          aria-label={t('accountModals:deleteAccountClose')}
          className="absolute right-4 top-5 rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-stone-100"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="max-h-[90vh] overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
          <div className="mb-6 flex items-start gap-4 pr-10">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/20">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                {t('accountModals:dangerZoneTitle')}
              </p>
              <h2 id="delete-account-title" className="text-2xl font-semibold tracking-tight text-stone-950 dark:text-white">
                {t('accountModals:deleteAccountTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">
                {t('accountModals:deleteAccountLead')}
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-stone-200 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.035]">
            <p className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
              {t('accountModals:deleteAccountRemovesTitle')}
            </p>
            <ul className="space-y-2.5 text-sm text-stone-600 dark:text-stone-300">
              {[
                'deleteAccountRemovesIdentity',
                'deleteAccountRemovesCloudData',
                'deleteAccountRemovesLocalData',
                'deleteAccountRemovesPremium',
              ].map(key => (
                <li key={key} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <span>{t(`accountModals:${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mb-5 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-sm leading-6 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-2">
                <p>{t('accountModals:deleteAccountPaymentRetention')}</p>
                <p className="font-medium">{t('accountModals:deleteAccountNoRefund')}</p>
              </div>
            </div>
          </div>

          <p className="mb-6 text-xs leading-5 text-stone-500 dark:text-stone-400">
            {t('accountModals:deleteAccountOtherDevicesNote')}
          </p>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-800 dark:text-stone-200">
              {t('accountModals:deleteAccountConfirmationLabel', { phrase: confirmationPhrase })}
            </span>
            <input
              type="text"
              value={confirmation}
              onChange={event => setConfirmation(event.target.value)}
              disabled={isDeleting}
              autoComplete="off"
              spellCheck={false}
              placeholder={confirmationPhrase}
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition placeholder:text-stone-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 disabled:opacity-60 dark:border-white/15 dark:bg-black/20 dark:text-white dark:placeholder:text-stone-600"
            />
          </label>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="rounded-2xl px-5 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50 dark:text-stone-200 dark:hover:bg-white/10"
            >
              {t('accountModals:deleteAccountCancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!isConfirmed || isDeleting}
              className="inline-flex min-w-44 items-center justify-center gap-2 rounded-2xl bg-red-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-red-950/20 transition hover:bg-red-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none dark:disabled:bg-stone-700"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isDeleting
                ? t('accountModals:deleteAccountDeleting')
                : t('accountModals:deleteAccountConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
