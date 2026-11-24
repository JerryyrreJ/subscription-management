import { useState } from 'react';
import { AlertCircle, Fingerprint, KeyRound, Loader2, LogOut } from 'lucide-react';
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
    <div className="settings-overlay fixed inset-0 mobile-modal-viewport z-[180]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="e2ee-unlock-title"
        className="e2ee-dialog space-y-5"
      >
        <div className="flex items-start gap-3">
          <div className="settings-section-icon">
            <KeyRound size={18} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="e2ee-unlock-title" className="text-base font-semibold app-theme-text-primary">
              {t('e2ee:unlockModalTitle')}
            </h2>
            {userEmail && (
              <p className="mt-0.5 truncate text-xs app-theme-text-muted">{userEmail}</p>
            )}
            <p className="mt-1.5 text-[13px] leading-relaxed app-theme-text-secondary">
              {t('e2ee:unlockModalSubtitle')}
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[9px] border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          >
            <AlertCircle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {canUsePasskey && (
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handlePasskeyUnlock()}
              className="settings-button-primary w-full"
            >
              {unlockingPasskey ? (
                <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
              ) : (
                <Fingerprint size={16} strokeWidth={1.5} aria-hidden="true" />
              )}
              {unlockingPasskey ? t('e2ee:unlockingWithPasskey') : t('e2ee:unlockWithPasskeyButton')}
            </button>

            {!showPhraseForm && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowPhraseForm(true)}
                className="settings-button w-full"
              >
                <KeyRound size={16} strokeWidth={1.5} aria-hidden="true" />
                {t('e2ee:useRecoveryPhraseToggle')}
              </button>
            )}
          </div>
        )}

        {(showPhraseForm || !canUsePasskey) && (
          <form onSubmit={e => void handlePhraseUnlock(e)} className="space-y-3">
            {canUsePasskey && (
              <p className="text-xs app-theme-text-muted">{t('e2ee:orUseRecoveryPhrase')}</p>
            )}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="e2ee-recovery-input"
                  className="text-xs font-medium app-theme-text-secondary"
                >
                  {t('e2ee:recoveryInputLabel')}
                </label>
                <span className="text-xs font-mono tabular-nums app-theme-text-muted">
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
                className="settings-input font-mono text-[13px]"
              />
            </div>

            <button
              type="submit"
              disabled={busy || enteredWordCount !== RECOVERY_WORD_COUNT}
              className={canUsePasskey ? 'settings-button w-full' : 'settings-button-primary w-full'}
            >
              {unlockingPhrase && (
                <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
              )}
              {unlockingPhrase ? t('e2ee:unlockingWithPhrase') : t('e2ee:unlockWithPhraseButton')}
            </button>
          </form>
        )}

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberBrowser}
            onChange={e => setRememberBrowser(e.target.checked)}
            disabled={busy}
            className="mt-0.5 accent-[#24704d]"
          />
          <span className="text-xs leading-relaxed app-theme-text-muted">
            {t('e2ee:rememberBrowserLabel')}
          </span>
        </label>

        <div className="flex justify-end border-t border-[var(--app-border)] pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSignOut()}
            className="inline-flex items-center gap-1.5 text-xs font-medium app-theme-text-muted transition-colors hover:text-[var(--app-ink)]"
          >
            <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('e2ee:signOutInstead')}
          </button>
        </div>
      </div>
    </div>
  );
}
