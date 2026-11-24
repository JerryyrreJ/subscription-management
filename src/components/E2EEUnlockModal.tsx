import { useState } from 'react';
import { Fingerprint, KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MnemonicValidationError, normalizeMnemonicWords, RECOVERY_WORD_COUNT } from '../lib/e2ee/mnemonic';
import { isPasskeyPrfAvailable } from '../lib/e2ee/passkeyPrf';
import {
  unlockVaultWithMnemonic,
  unlockVaultWithPasskey,
  type VaultStateSnapshot,
} from '../lib/e2ee/vaultSession';

interface E2EEUnlockModalProps {
  userId: string;
  userEmail?: string;
  vault: VaultStateSnapshot;
  onUnlocked: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
}

export function E2EEUnlockModal({
  userId,
  userEmail,
  vault,
  onUnlocked,
  onSignOut,
}: E2EEUnlockModalProps) {
  const { t } = useTranslation(['e2ee']);
  const canUsePasskey = vault.hasPasskeySlot && isPasskeyPrfAvailable();

  const [showPhraseForm, setShowPhraseForm] = useState(!canUsePasskey);
  const [phrase, setPhrase] = useState('');
  const [rememberBrowser, setRememberBrowser] = useState(true);
  const [unlockingPasskey, setUnlockingPasskey] = useState(false);
  const [unlockingPhrase, setUnlockingPhrase] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapUnlockError = (err: unknown): string => {
    if (err instanceof MnemonicValidationError) {
      if (err.code === 'wrong_word_count') return t('e2ee:errorWrongWordCount');
      if (err.code === 'unknown_word') {
        return t('e2ee:errorUnknownWord', { word: err.invalidWord ?? '' });
      }
      if (err.code === 'invalid_checksum') return t('e2ee:errorChecksum');
    }
    return err instanceof Error && err.message ? err.message : t('e2ee:errorGenericUnlock');
  };

  const handlePasskeyUnlock = async () => {
    setError(null);
    setUnlockingPasskey(true);
    try {
      await unlockVaultWithPasskey(userId, rememberBrowser);
      await onUnlocked();
    } catch (err) {
      setError(mapUnlockError(err));
    } finally {
      setUnlockingPasskey(false);
    }
  };

  const handlePhraseUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnlockingPhrase(true);
    try {
      await unlockVaultWithMnemonic(userId, phrase, rememberBrowser);
      setPhrase('');
      await onUnlocked();
    } catch (err) {
      setError(mapUnlockError(err));
    } finally {
      setUnlockingPhrase(false);
    }
  };

  const enteredWordCount = normalizeMnemonicWords(phrase).length;
  const busy = unlockingPasskey || unlockingPhrase;

  return (
    <div className="fixed inset-0 z-[180] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="e2ee-unlock-title"
        className="w-full max-w-md rounded-3xl border border-gray-200/80 dark:border-white/10 bg-white dark:bg-[#181a1c] shadow-apple-xl p-6 sm:p-7 space-y-5"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 id="e2ee-unlock-title" className="text-lg font-semibold app-theme-text-primary">
              {t('e2ee:unlockModalTitle')}
            </h2>
            {userEmail && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate mt-0.5">
                {userEmail}
              </p>
            )}
            <p className="text-xs app-theme-text-muted mt-1 leading-relaxed">
              {t('e2ee:unlockModalSubtitle')}
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-500/25 dark:bg-red-500/10 p-3.5 text-xs text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {canUsePasskey && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handlePasskeyUnlock()}
              className="w-full inline-flex items-center justify-center gap-2.5 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {unlockingPasskey ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Fingerprint className="w-4 h-4" />
              )}
              {unlockingPasskey ? t('e2ee:unlockingWithPasskey') : t('e2ee:unlockWithPasskeyButton')}
            </button>

            {!showPhraseForm && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowPhraseForm(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium app-theme-text-muted hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {t('e2ee:useRecoveryPhraseToggle')}
              </button>
            )}
          </div>
        )}

        {(showPhraseForm || !canUsePasskey) && (
          <form onSubmit={e => void handlePhraseUnlock(e)} className="space-y-3.5">
            {canUsePasskey && (
              <p className="text-[11px] uppercase tracking-wider app-theme-text-muted text-center">
                {t('e2ee:orUseRecoveryPhrase')}
              </p>
            )}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="e2ee-recovery-input" className="text-xs font-medium app-theme-text-primary">
                  {t('e2ee:recoveryInputLabel')}
                </label>
                <span className="text-[11px] font-mono app-theme-text-muted">
                  {enteredWordCount}/{RECOVERY_WORD_COUNT}
                </span>
              </div>
              <textarea
                id="e2ee-recovery-input"
                rows={3}
                value={phrase}
                onChange={e => setPhrase(e.target.value)}
                placeholder={t('e2ee:recoveryInputPlaceholder')}
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
                className="settings-input w-full font-mono text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={busy || enteredWordCount !== RECOVERY_WORD_COUNT}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 text-sm font-medium transition-colors disabled:opacity-40"
            >
              {unlockingPhrase ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              {unlockingPhrase ? t('e2ee:unlockingWithPhrase') : t('e2ee:unlockWithPhraseButton')}
            </button>
          </form>
        )}

        <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberBrowser}
            onChange={e => setRememberBrowser(e.target.checked)}
            disabled={busy}
            className="mt-0.5 accent-emerald-600"
          />
          <span className="text-xs app-theme-text-muted leading-snug">
            {t('e2ee:rememberBrowserLabel')}
          </span>
        </label>

        <div className="pt-2 border-t border-gray-200/70 dark:border-white/10 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSignOut()}
            className="inline-flex items-center gap-1.5 text-xs app-theme-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t('e2ee:signOutInstead')}
          </button>
        </div>
      </div>
    </div>
  );
}
