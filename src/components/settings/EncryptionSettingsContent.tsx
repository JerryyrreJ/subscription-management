import { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  Clipboard,
  Download,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useVaultState } from '../../hooks/useVaultState';
import type { Subscription } from '../../types';
import { loadCategories, loadPendingCategorySync } from '../../utils/categories';
import { getUserDataScope } from '../../utils/dataScope';
import { loadPendingSyncOperations, loadSubscriptions, saveSubscriptions } from '../../utils/storage';
import { saveCategories } from '../../utils/categories';
import {
  type BarkE2eeMode,
  generateBarkEncryptionKey,
  isValidBarkEncryptionKey,
} from '../../lib/e2ee/crypto';
import {
  formatMnemonicPhrase,
  generateRecoveryMnemonic,
  normalizeMnemonicWords,
  RECOVERY_WORD_COUNT,
} from '../../lib/e2ee/mnemonic';
import {
  isPasskeyPrfAvailable,
  PasskeyPrfUnsupportedError,
  type PasskeyPrfKdfParams,
  registerPasskeyForVault,
} from '../../lib/e2ee/passkeyPrf';
import {
  addPasskeySlotToVault,
  disableVaultForAccount,
  enableVaultForAccount,
  lockVaultOnThisDevice,
  regenerateRecoveryPhraseSlot,
  removeKeySlotFromVault,
  updateVaultBarkSettings,
} from '../../lib/e2ee/vaultSession';

interface EncryptionSettingsContentProps {
  subscriptions: Subscription[];
  onSubscriptionsReplaced?: (next: Subscription[]) => void;
  onCategoriesReplaced?: () => void;
}

export function EncryptionSettingsContent({
  subscriptions,
  onSubscriptionsReplaced,
  onCategoriesReplaced,
}: EncryptionSettingsContentProps) {
  const { t } = useTranslation(['e2ee', 'app']);
  const { user } = useAuth();
  const vault = useVaultState();

  // Setup wizard state
  const [setupPhrase, setSetupPhrase] = useState<string>('');
  const [confirmPhrase, setConfirmPhrase] = useState<string>('');
  const [copiedPhrase, setCopiedPhrase] = useState(false);
  const [passkeyLabel, setPasskeyLabel] = useState('');
  const [boundPasskey, setBoundPasskey] = useState<{
    label: string;
    credentialId: string;
    prfBytes: Uint8Array;
    kdfParams: PasskeyPrfKdfParams;
  } | null>(null);
  const [passkeyHint, setPasskeyHint] = useState<string | null>(null);
  const [setupBarkMode, setSetupBarkMode] = useState<BarkE2eeMode>('generic');
  const [setupBarkKey, setSetupBarkKey] = useState<string>(() => generateBarkEncryptionKey());
  const [copiedBarkKey, setCopiedBarkKey] = useState(false);

  // Unlocked management state
  const [newSlotLabel, setNewSlotLabel] = useState('');
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [regeneratedPhrase, setRegeneratedPhrase] = useState<string>('');
  const [regeneratedConfirm, setRegeneratedConfirm] = useState<string>('');
  const [manageBarkMode, setManageBarkMode] = useState<BarkE2eeMode>(vault.barkMode);
  const [manageBarkKey, setManageBarkKey] = useState<string>(
    vault.barkEncryptionKey || generateBarkEncryptionKey()
  );
  const [savingBark, setSavingBark] = useState(false);
  const [barkSavedFeedback, setBarkSavedFeedback] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setupWords = useMemo(() => (setupPhrase ? setupPhrase.split(' ') : []), [setupPhrase]);
  const isSetupPhraseConfirmed = useMemo(() => {
    if (!setupPhrase) return false;
    const normalizedInput = formatMnemonicPhrase(normalizeMnemonicWords(confirmPhrase));
    return normalizedInput === setupPhrase;
  }, [confirmPhrase, setupPhrase]);

  const isRegenConfirmed = useMemo(() => {
    if (!regeneratedPhrase) return false;
    return formatMnemonicPhrase(normalizeMnemonicWords(regeneratedConfirm)) === regeneratedPhrase;
  }, [regeneratedConfirm, regeneratedPhrase]);

  if (!user) {
    return null;
  }

  const scope = getUserDataScope(user.id);
  const hasPendingOfflineChanges =
    loadPendingSyncOperations(scope).length > 0 || Boolean(loadPendingCategorySync(scope));

  const handleStartSetup = async () => {
    setError(null);
    setPasskeyHint(null);
    const mnemonic = await generateRecoveryMnemonic();
    setSetupPhrase(mnemonic);
    setConfirmPhrase('');
    setBoundPasskey(null);
    setSetupBarkMode('generic');
    setSetupBarkKey(generateBarkEncryptionKey());
  };

  const handleCancelSetup = () => {
    if (boundPasskey) {
      boundPasskey.prfBytes.fill(0);
    }
    setSetupPhrase('');
    setConfirmPhrase('');
    setBoundPasskey(null);
    setError(null);
    setPasskeyHint(null);
  };

  const handleCopyText = async (text: string, onSuccess: () => void) => {
    try {
      await navigator.clipboard.writeText(text);
      onSuccess();
    } catch {
      setError('Clipboard unavailable. Select and copy manually.');
    }
  };

  const handleDownloadRecoveryFile = (phrase: string) => {
    const content = [
      'SteadyRenew — 16-Word End-to-End Encryption Recovery Key',
      `Account: ${user.email ?? user.id}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      phrase,
      '',
      'Keep this file in a secure password manager or offline backup.',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'steadyrenew-recovery-key.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleBindSetupPasskey = async () => {
    setError(null);
    setPasskeyHint(null);
    try {
      const label = passkeyLabel.trim() || 'Passkey';
      const registered = await registerPasskeyForVault(user.id, user.email ?? '', label);
      setBoundPasskey({
        label,
        credentialId: registered.credentialId,
        prfBytes: registered.prfBytes,
        kdfParams: registered.kdfParams,
      });
    } catch (err) {
      if (err instanceof PasskeyPrfUnsupportedError) {
        setPasskeyHint(t('e2ee:passkeyUnsupportedHint'));
      } else if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  const handleEnableEncryption = async () => {
    if (!isSetupPhraseConfirmed) return;
    if (hasPendingOfflineChanges) {
      setError(t('e2ee:pendingSyncWarning'));
      return;
    }
    if (setupBarkMode === 'bark_e2ee' && !isValidBarkEncryptionKey(setupBarkKey)) {
      setError('Bark key must be 16 or 32 ASCII characters.');
      return;
    }

    setError(null);
    setBusyMessage(t('e2ee:enablingBusy'));
    try {
      const localSubs = subscriptions.length > 0 ? subscriptions : loadSubscriptions(scope);
      const localCats = loadCategories(scope);

      await enableVaultForAccount({
        userId: user.id,
        userEmail: user.email ?? '',
        mnemonicPhrase: setupPhrase,
        passkeyMaterial: boundPasskey,
        barkMode: setupBarkMode,
        barkEncryptionKey: setupBarkMode === 'bark_e2ee' ? setupBarkKey : null,
        localSubscriptions: localSubs,
        localCategories: localCats,
      });

      setSetupPhrase('');
      setConfirmPhrase('');
      setBoundPasskey(null);
      setManageBarkMode(setupBarkMode);
      if (setupBarkMode === 'bark_e2ee') {
        setManageBarkKey(setupBarkKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable encryption');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleAddPasskeyInSettings = async () => {
    setError(null);
    setAddingPasskey(true);
    try {
      const label = newSlotLabel.trim() || `Passkey ${vault.keySlots.length}`;
      await addPasskeySlotToVault(user.id, user.email ?? '', label);
      setNewSlotLabel('');
    } catch (err) {
      if (err instanceof PasskeyPrfUnsupportedError) {
        setError(t('e2ee:passkeyUnsupportedHint'));
      } else {
        setError(err instanceof Error ? err.message : 'Failed to add Passkey');
      }
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleStartRegeneratePhrase = async () => {
    setError(null);
    const nextPhrase = await generateRecoveryMnemonic();
    setRegeneratedPhrase(nextPhrase);
    setRegeneratedConfirm('');
  };

  const handleConfirmRegeneratePhrase = async () => {
    if (!isRegenConfirmed) return;
    setError(null);
    try {
      await regenerateRecoveryPhraseSlot(user.id, regeneratedPhrase);
      setRegeneratedPhrase('');
      setRegeneratedConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace recovery key');
    }
  };

  const handleRemoveSlot = async (slotId: string) => {
    setError(null);
    try {
      await removeKeySlotFromVault(user.id, slotId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove unlock method');
    }
  };

  const handleSaveBarkSettings = async () => {
    setError(null);
    setSavingBark(true);
    setBarkSavedFeedback(false);
    try {
      await updateVaultBarkSettings(
        user.id,
        manageBarkMode,
        manageBarkMode === 'bark_e2ee' ? manageBarkKey : null,
        subscriptions
      );
      setBarkSavedFeedback(true);
      window.setTimeout(() => setBarkSavedFeedback(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update Bark encryption settings');
    } finally {
      setSavingBark(false);
    }
  };

  const handleDisableEncryption = async () => {
    if (hasPendingOfflineChanges) {
      setError(t('e2ee:pendingSyncWarning'));
      return;
    }
    setError(null);
    setBusyMessage(t('e2ee:disablingBusy'));
    try {
      const restored = await disableVaultForAccount(user.id);
      saveSubscriptions(restored.subscriptions, scope);
      saveCategories(restored.categories, scope);
      onSubscriptionsReplaced?.(restored.subscriptions);
      onCategoriesReplaced?.();
      setConfirmDisable(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable encryption');
    } finally {
      setBusyMessage(null);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-page-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold app-theme-text-primary mb-1">
              {t('e2ee:title')}
            </h2>
            <p className="text-sm app-theme-text-muted">{t('e2ee:subtitle')}</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              vault.status === 'unlocked'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : vault.status === 'locked'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            {vault.status === 'unlocked'
              ? t('e2ee:statusEnabled')
              : vault.status === 'locked'
                ? t('e2ee:statusLocked')
                : t('e2ee:statusDisabled')}
          </span>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-500/25 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300 mb-5"
        >
          {error}
        </div>
      )}

      {/* --- DISABLED STATE & SETUP WIZARD --- */}
      {vault.status === 'disabled' && !setupPhrase && (
        <div className="space-y-4">
          <div className="settings-card space-y-4">
            <p className="text-sm leading-relaxed app-theme-text-primary">
              {t('e2ee:overviewBody')}
            </p>
            <div className="settings-inset p-4 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                {t('e2ee:zeroLossHighlightsTitle')}
              </p>
              <ul className="space-y-2 text-xs app-theme-text-muted">
                <li className="flex items-start gap-2">
                  <Fingerprint className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <span>{t('e2ee:highlightPasskey')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Lock className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <span>{t('e2ee:highlightRefresh')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Bell className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <span>{t('e2ee:highlightBark')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <span>{t('e2ee:highlightAiMcp')}</span>
                </li>
              </ul>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => void handleStartSetup()}
                className="settings-button-primary inline-flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {t('e2ee:startSetupButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {vault.status === 'disabled' && setupPhrase && (
        <div className="space-y-5">
          {/* Step 1: 16-word recovery phrase */}
          <div className="settings-card space-y-4">
            <div>
              <h3 className="text-sm font-semibold app-theme-text-primary">
                {t('e2ee:step1Title')}
              </h3>
              <p className="text-xs app-theme-text-muted mt-1">{t('e2ee:step1Desc')}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-2xl bg-gray-50 dark:bg-black/30 border border-gray-200/80 dark:border-white/10">
              {setupWords.map((word, index) => (
                <div
                  key={`${index}-${word}`}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white dark:bg-white/[0.04] border border-gray-200/60 dark:border-white/5 font-mono text-xs"
                >
                  <span className="text-[10px] text-gray-400 select-none w-4">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-medium app-theme-text-primary select-all">{word}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void handleCopyText(setupPhrase, () => {
                    setCopiedPhrase(true);
                    window.setTimeout(() => setCopiedPhrase(false), 2000);
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 app-theme-text-primary transition-colors"
              >
                {copiedPhrase ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Clipboard className="w-3.5 h-3.5" />}
                {copiedPhrase ? t('e2ee:copiedPhrase') : t('e2ee:copyPhrase')}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadRecoveryFile(setupPhrase)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 app-theme-text-primary transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t('e2ee:downloadPhrase')}
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium app-theme-text-primary mb-1.5">
                {t('e2ee:confirmPhraseLabel')}
              </label>
              <textarea
                rows={2}
                value={confirmPhrase}
                onChange={e => setConfirmPhrase(e.target.value)}
                placeholder={t('e2ee:confirmPhrasePlaceholder')}
                spellCheck={false}
                autoComplete="off"
                className="settings-input w-full font-mono text-xs"
              />
              {confirmPhrase.trim().length > 0 && (
                <p
                  className={`mt-1.5 text-xs flex items-center gap-1.5 ${
                    isSetupPhraseConfirmed
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {isSetupPhraseConfirmed ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      {t('e2ee:phraseVerified')}
                    </>
                  ) : (
                    <span>
                      {t('e2ee:phraseMismatch')} ({normalizeMnemonicWords(confirmPhrase).length}/{RECOVERY_WORD_COUNT})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Step 2: Optional Passkey PRF binding */}
          {isPasskeyPrfAvailable() && (
            <div className="settings-card space-y-3">
              <div>
                <h3 className="text-sm font-semibold app-theme-text-primary">
                  {t('e2ee:step2Title')}
                </h3>
                <p className="text-xs app-theme-text-muted mt-1">{t('e2ee:step2Desc')}</p>
              </div>

              {boundPasskey ? (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                  <Check className="w-4 h-4" />
                  {t('e2ee:passkeyBoundSuccess', { label: boundPasskey.label })}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={passkeyLabel}
                    onChange={e => setPasskeyLabel(e.target.value)}
                    maxLength={60}
                    placeholder={t('e2ee:passkeyLabelPlaceholder')}
                    className="settings-input flex-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleBindSetupPasskey()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition-colors"
                  >
                    <Fingerprint className="w-4 h-4" />
                    {t('e2ee:bindPasskeyNow')}
                  </button>
                </div>
              )}

              {passkeyHint && (
                <p className="text-xs text-amber-700 dark:text-amber-300">{passkeyHint}</p>
              )}
            </div>
          )}

          {/* Step 3: Bark E2EE mode */}
          <div className="settings-card space-y-3">
            <h3 className="text-sm font-semibold app-theme-text-primary">
              {t('e2ee:step3Title')}
            </h3>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-white/10 cursor-pointer">
                <input
                  type="radio"
                  name="setup-bark-mode"
                  checked={setupBarkMode === 'generic'}
                  onChange={() => setSetupBarkMode('generic')}
                  className="mt-1 accent-emerald-600"
                />
                <div>
                  <p className="text-xs font-medium app-theme-text-primary">
                    {t('e2ee:barkModeGenericTitle')}
                  </p>
                  <p className="text-xs app-theme-text-muted mt-0.5">
                    {t('e2ee:barkModeGenericDesc')}
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-white/10 cursor-pointer">
                <input
                  type="radio"
                  name="setup-bark-mode"
                  checked={setupBarkMode === 'bark_e2ee'}
                  onChange={() => setSetupBarkMode('bark_e2ee')}
                  className="mt-1 accent-emerald-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium app-theme-text-primary">
                    {t('e2ee:barkModeCiphertextTitle')}
                  </p>
                  <p className="text-xs app-theme-text-muted mt-0.5">
                    {t('e2ee:barkModeCiphertextDesc')}
                  </p>
                  {setupBarkMode === 'bark_e2ee' && (
                    <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                      <label className="block text-[11px] font-medium app-theme-text-muted">
                        {t('e2ee:barkKeyLabel')}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={setupBarkKey}
                          onChange={e => setSetupBarkKey(e.target.value)}
                          spellCheck={false}
                          className="settings-input flex-1 font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setSetupBarkKey(generateBarkEncryptionKey())}
                          className="px-3 py-1.5 rounded-xl text-xs bg-gray-100 dark:bg-white/10 app-theme-text-primary"
                        >
                          {t('e2ee:generateBarkKey')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyText(setupBarkKey, () => {
                              setCopiedBarkKey(true);
                              window.setTimeout(() => setCopiedBarkKey(false), 2000);
                            })
                          }
                          className="px-3 py-1.5 rounded-xl text-xs bg-gray-100 dark:bg-white/10 app-theme-text-primary"
                        >
                          {copiedBarkKey ? t('e2ee:copiedPhrase') : t('e2ee:copyBarkKey')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!isSetupPhraseConfirmed || Boolean(busyMessage)}
              onClick={() => void handleEnableEncryption()}
              className="settings-button-primary disabled:opacity-40"
            >
              {t('e2ee:enableConfirmButton')}
            </button>
            <button
              type="button"
              disabled={Boolean(busyMessage)}
              onClick={handleCancelSetup}
              className="px-4 py-2 rounded-xl text-sm app-theme-text-muted hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              {t('e2ee:cancelSetup')}
            </button>
          </div>
        </div>
      )}

      {/* --- UNLOCKED MANAGEMENT STATE --- */}
      {vault.status === 'unlocked' && (
        <div className="space-y-5">
          {/* Device session card */}
          <div className="settings-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold app-theme-text-primary">
                {t('e2ee:deviceLockTitle')}
              </h3>
              <p className="text-xs app-theme-text-muted mt-1">{t('e2ee:deviceLockDesc')}</p>
            </div>
            <button
              type="button"
              onClick={() => void lockVaultOnThisDevice(user.id)}
              className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border border-gray-200 dark:border-white/15 hover:bg-gray-100 dark:hover:bg-white/10 app-theme-text-primary transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              {t('e2ee:lockDeviceButton')}
            </button>
          </div>

          {/* Unlock key slots */}
          <div className="settings-card space-y-4">
            <div>
              <h3 className="text-sm font-semibold app-theme-text-primary">
                {t('e2ee:keySlotsTitle')}
              </h3>
              <p className="text-xs app-theme-text-muted mt-1">{t('e2ee:keySlotsDesc')}</p>
            </div>

            <div className="space-y-2">
              {vault.keySlots.map(slot => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200/70 dark:border-white/10"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {slot.slot_type === 'passkey_prf' ? (
                      <Fingerprint className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <KeyRound className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium app-theme-text-primary truncate">
                        {slot.label}
                      </p>
                      <p className="text-[11px] app-theme-text-muted">
                        {slot.slot_type === 'passkey_prf'
                          ? t('e2ee:slotTypePasskey')
                          : t('e2ee:slotTypeMnemonic')}
                      </p>
                    </div>
                  </div>
                  {slot.slot_type === 'passkey_prf' && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveSlot(slot.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('e2ee:removeSlot')}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isPasskeyPrfAvailable() && (
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <input
                  type="text"
                  value={newSlotLabel}
                  onChange={e => setNewSlotLabel(e.target.value)}
                  maxLength={60}
                  placeholder={t('e2ee:passkeyLabelPlaceholder')}
                  className="settings-input flex-1 text-xs"
                />
                <button
                  type="button"
                  disabled={addingPasskey}
                  onClick={() => void handleAddPasskeyInSettings()}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                >
                  {addingPasskey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  {addingPasskey ? t('e2ee:addingPasskey') : t('e2ee:addPasskeyButton')}
                </button>
              </div>
            )}

            {/* Regenerate 16-word key */}
            {!regeneratedPhrase ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => void handleStartRegeneratePhrase()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium app-theme-text-muted hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('e2ee:regeneratePhraseButton')}
                </button>
              </div>
            ) : (
              <div className="settings-inset p-4 space-y-3">
                <p className="font-mono text-xs p-3 rounded-xl bg-white dark:bg-black/40 select-all">
                  {regeneratedPhrase}
                </p>
                <textarea
                  rows={2}
                  value={regeneratedConfirm}
                  onChange={e => setRegeneratedConfirm(e.target.value)}
                  placeholder={t('e2ee:confirmPhrasePlaceholder')}
                  spellCheck={false}
                  className="settings-input w-full font-mono text-xs"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!isRegenConfirmed}
                    onClick={() => void handleConfirmRegeneratePhrase()}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-emerald-600 text-white disabled:opacity-40"
                  >
                    {t('e2ee:saveNewPhraseButton')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRegeneratedPhrase('');
                      setRegeneratedConfirm('');
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs app-theme-text-muted"
                  >
                    {t('e2ee:cancelSetup')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bark encrypted reminders configuration */}
          <div className="settings-card space-y-3">
            <h3 className="text-sm font-semibold app-theme-text-primary">
              {t('e2ee:barkSectionTitle')}
            </h3>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="manage-bark-mode"
                  checked={manageBarkMode === 'generic'}
                  onChange={() => setManageBarkMode('generic')}
                  className="mt-0.5 accent-emerald-600"
                />
                <span>
                  <strong className="app-theme-text-primary">{t('e2ee:barkModeGenericTitle')}</strong>
                  {' — '}
                  <span className="app-theme-text-muted">{t('e2ee:barkModeGenericDesc')}</span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="manage-bark-mode"
                  checked={manageBarkMode === 'bark_e2ee'}
                  onChange={() => setManageBarkMode('bark_e2ee')}
                  className="mt-0.5 accent-emerald-600"
                />
                <span>
                  <strong className="app-theme-text-primary">{t('e2ee:barkModeCiphertextTitle')}</strong>
                  {' — '}
                  <span className="app-theme-text-muted">{t('e2ee:barkModeCiphertextDesc')}</span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="manage-bark-mode"
                  checked={manageBarkMode === 'off'}
                  onChange={() => setManageBarkMode('off')}
                  className="mt-0.5 accent-emerald-600"
                />
                <span className="app-theme-text-primary font-medium">
                  {t('e2ee:barkModeOffTitle')}
                </span>
              </label>
            </div>

            {manageBarkMode === 'bark_e2ee' && (
              <div className="flex flex-wrap gap-2 pt-1">
                <input
                  type="text"
                  value={manageBarkKey}
                  onChange={e => setManageBarkKey(e.target.value)}
                  spellCheck={false}
                  className="settings-input flex-1 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setManageBarkKey(generateBarkEncryptionKey())}
                  className="px-3 py-1.5 rounded-xl text-xs bg-gray-100 dark:bg-white/10 app-theme-text-primary"
                >
                  {t('e2ee:generateBarkKey')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyText(manageBarkKey, () => {
                      setCopiedBarkKey(true);
                      window.setTimeout(() => setCopiedBarkKey(false), 2000);
                    })
                  }
                  className="px-3 py-1.5 rounded-xl text-xs bg-gray-100 dark:bg-white/10 app-theme-text-primary"
                >
                  {copiedBarkKey ? t('e2ee:copiedPhrase') : t('e2ee:copyBarkKey')}
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={savingBark}
                onClick={() => void handleSaveBarkSettings()}
                className="px-3.5 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
              >
                {savingBark ? t('e2ee:savingBarkMode') : t('e2ee:saveBarkMode')}
              </button>
              {barkSavedFeedback && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="w-3.5 h-3.5" />
                  {t('e2ee:barkSaved')}
                </span>
              )}
            </div>
          </div>

          {/* Disable E2EE */}
          <div className="settings-card space-y-3 border-red-200/60 dark:border-red-500/20">
            <div>
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
                {t('e2ee:disableTitle')}
              </h3>
              <p className="text-xs app-theme-text-muted mt-1">{t('e2ee:disableDesc')}</p>
            </div>
            {!confirmDisable ? (
              <button
                type="button"
                onClick={() => setConfirmDisable(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-300 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <ShieldOff className="w-3.5 h-3.5" />
                {t('e2ee:disableButton')}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs text-red-600 dark:text-red-300 font-medium">
                  {t('e2ee:disableConfirmPrompt')}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDisableEncryption()}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  {t('e2ee:disableConfirmYes')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDisable(false)}
                  className="px-3 py-1.5 rounded-xl text-xs app-theme-text-muted"
                >
                  {t('e2ee:cancelSetup')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {busyMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[220] bg-black/65 backdrop-blur-sm flex items-center justify-center p-6"
        >
          <div className="max-w-sm w-full rounded-3xl bg-white dark:bg-[#1a1c1e] border border-gray-200 dark:border-white/10 p-6 text-center shadow-2xl space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600 mx-auto" />
            <p className="text-sm font-medium app-theme-text-primary">{busyMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
