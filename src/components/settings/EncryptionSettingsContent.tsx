import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
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
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useVaultState } from '../../hooks/useVaultState';
import type { Subscription } from '../../types';
import { loadCategories, loadPendingCategorySync, saveCategories } from '../../utils/categories';
import { getUserDataScope } from '../../utils/dataScope';
import { loadPendingSyncOperations, loadSubscriptions, saveSubscriptions } from '../../utils/storage';
import { isRememberMeEnabled } from '../../utils/rememberMe';
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
  const boundPasskeyRef = useRef(boundPasskey);
  boundPasskeyRef.current = boundPasskey;

  useEffect(() => {
    return () => {
      boundPasskeyRef.current?.prfBytes.fill(0);
    };
  }, []);
  const [passkeyHint, setPasskeyHint] = useState<string | null>(null);
  const [setupBarkMode, setSetupBarkMode] = useState<BarkE2eeMode>('generic');
  const [setupBarkKey, setSetupBarkKey] = useState<string>(() => generateBarkEncryptionKey());
  const [copiedBarkKey, setCopiedBarkKey] = useState(false);
  const [setupRememberDevice, setSetupRememberDevice] = useState<boolean>(() => isRememberMeEnabled());

  // Unlocked management state
  const [newSlotLabel, setNewSlotLabel] = useState('');
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [regeneratedPhrase, setRegeneratedPhrase] = useState<string>('');
  const [regeneratedConfirm, setRegeneratedConfirm] = useState<string>('');
  const [copiedRegenPhrase, setCopiedRegenPhrase] = useState(false);
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
  const regenWords = useMemo(
    () => (regeneratedPhrase ? regeneratedPhrase.split(' ') : []),
    [regeneratedPhrase]
  );
  const confirmWordCount = useMemo(
    () => normalizeMnemonicWords(confirmPhrase).length,
    [confirmPhrase]
  );

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

  const isBarkDirty =
    manageBarkMode !== vault.barkMode ||
    (manageBarkMode === 'bark_e2ee' && manageBarkKey !== (vault.barkEncryptionKey ?? ''));

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
      'SteadyRenew — 16-word recovery key',
      `Account: ${user.email ?? user.id}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      phrase,
      '',
      'Store this file in a password manager or offline backup.',
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
      boundPasskey?.prfBytes.fill(0);
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
        rememberDevice: setupRememberDevice,
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
    setBusyMessage(t('e2ee:rotatingPhraseBusy'));
    try {
      await regenerateRecoveryPhraseSlot(user.id, regeneratedPhrase);
      setRegeneratedPhrase('');
      setRegeneratedConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replace recovery key');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleRemoveSlot = async (slotId: string) => {
    setError(null);
    try {
      await removeKeySlotFromVault(user.id, slotId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove verification method');
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

  const statusText =
    vault.status === 'unlocked'
      ? t('e2ee:statusEnabled')
      : vault.status === 'locked'
        ? t('e2ee:statusLocked')
        : t('e2ee:statusDisabled');

  return (
    <div className="settings-page">
      <div className="settings-page-heading">
        <h2>{t('e2ee:title')}</h2>
        <p>{t('e2ee:subtitle')}</p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          <AlertCircle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* --- DISABLED OVERVIEW --- */}
      {vault.status === 'disabled' && !setupPhrase && (
        <section className="settings-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="settings-section-icon">
                <Lock size={18} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-sm font-semibold app-theme-text-primary">
                    {t('e2ee:overviewTitle')}
                  </h3>
                  <span className="e2ee-status-line">
                    <span className="e2ee-status-dot" data-state="disabled" aria-hidden="true" />
                    {statusText}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed app-theme-text-secondary">
                  {t('e2ee:overviewBody')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleStartSetup()}
              className="settings-button-primary shrink-0"
            >
              {t('e2ee:startSetupButton')}
            </button>
          </div>

          <dl className="e2ee-spec-list">
            <div className="e2ee-spec-row">
              <dt className="e2ee-spec-label">{t('e2ee:scopeSyncLabel')}</dt>
              <dd className="e2ee-spec-value">{t('e2ee:scopeSyncValue')}</dd>
            </div>
            <div className="e2ee-spec-row">
              <dt className="e2ee-spec-label">{t('e2ee:scopePushLabel')}</dt>
              <dd className="e2ee-spec-value">{t('e2ee:scopePushValue')}</dd>
            </div>
            <div className="e2ee-spec-row">
              <dt className="e2ee-spec-label">{t('e2ee:scopeApiLabel')}</dt>
              <dd className="e2ee-spec-value">{t('e2ee:scopeApiValue')}</dd>
            </div>
            <div className="e2ee-spec-row">
              <dt className="e2ee-spec-label">{t('e2ee:scopeAiLabel')}</dt>
              <dd className="e2ee-spec-value">{t('e2ee:scopeAiValue')}</dd>
            </div>
          </dl>
        </section>
      )}

      {/* --- SETUP WIZARD --- */}
      {vault.status === 'disabled' && setupPhrase && (
        <div className="space-y-4">
          {/* Step 1: 16-word recovery key sheet */}
          <section className="settings-card space-y-4">
            <div className="flex items-start gap-3">
              <span className="e2ee-step-badge" aria-hidden="true">1</span>
              <div>
                <h3 className="text-sm font-semibold app-theme-text-primary">
                  {t('e2ee:step1Title')}
                </h3>
                <p className="mt-1 text-xs leading-relaxed app-theme-text-muted">
                  {t('e2ee:step1Desc')}
                </p>
              </div>
            </div>

            <div className="e2ee-phrase-sheet">
              <div className="e2ee-phrase-grid">
                {setupWords.map((word, index) => (
                  <div key={`${index}-${word}`} className="e2ee-phrase-cell">
                    <span className="e2ee-phrase-index">{index + 1}</span>
                    <span className="e2ee-phrase-word">{word}</span>
                  </div>
                ))}
              </div>
              <div className="e2ee-phrase-bar">
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyText(setupPhrase, () => {
                      setCopiedPhrase(true);
                      window.setTimeout(() => setCopiedPhrase(false), 2000);
                    })
                  }
                  className="e2ee-phrase-action"
                >
                  {copiedPhrase ? (
                    <Check size={14} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Clipboard size={14} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  {copiedPhrase ? t('e2ee:copiedPhrase') : t('e2ee:copyPhrase')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadRecoveryFile(setupPhrase)}
                  className="e2ee-phrase-action"
                >
                  <Download size={14} strokeWidth={1.5} aria-hidden="true" />
                  {t('e2ee:downloadPhrase')}
                </button>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label
                  htmlFor="e2ee-setup-confirm"
                  className="text-xs font-medium app-theme-text-secondary"
                >
                  {t('e2ee:confirmPhraseLabel')}
                </label>
                <span className="text-xs font-mono tabular-nums app-theme-text-muted">
                  {confirmWordCount}/{RECOVERY_WORD_COUNT}
                </span>
              </div>
              <textarea
                id="e2ee-setup-confirm"
                rows={2}
                value={confirmPhrase}
                onChange={e => setConfirmPhrase(e.target.value)}
                placeholder={t('e2ee:confirmPhrasePlaceholder')}
                spellCheck={false}
                autoComplete="off"
                className="settings-input font-mono text-[13px]"
              />
              {confirmPhrase.trim().length > 0 && (
                <p
                  className={`mt-2 inline-flex items-center gap-1.5 text-xs ${
                    isSetupPhraseConfirmed
                      ? 'app-theme-text-secondary'
                      : 'app-theme-text-muted'
                  }`}
                >
                  {isSetupPhraseConfirmed ? (
                    <>
                      <Check
                        size={14}
                        strokeWidth={1.5}
                        style={{ color: 'var(--settings-accent)' }}
                        aria-hidden="true"
                      />
                      <span>{t('e2ee:phraseVerified')}</span>
                    </>
                  ) : (
                    <span>{t('e2ee:phraseMismatch', { count: confirmWordCount })}</span>
                  )}
                </p>
              )}
            </div>
          </section>

          {/* Step 2: Optional Passkey PRF binding */}
          {isPasskeyPrfAvailable() && (
            <section className="settings-card space-y-4">
              <div className="flex items-start gap-3">
                <span className="e2ee-step-badge" aria-hidden="true">2</span>
                <div>
                  <h3 className="text-sm font-semibold app-theme-text-primary">
                    {t('e2ee:step2Title')}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed app-theme-text-muted">
                    {t('e2ee:step2Desc')}
                  </p>
                </div>
              </div>

              {boundPasskey ? (
                <div className="e2ee-slot-row">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Fingerprint
                      size={16}
                      strokeWidth={1.5}
                      className="shrink-0 app-theme-text-muted"
                      aria-hidden="true"
                    />
                    <span className="truncate text-[13px] font-medium app-theme-text-primary">
                      {t('e2ee:passkeyBoundSuccess', { label: boundPasskey.label })}
                    </span>
                  </div>
                  <Check
                    size={16}
                    strokeWidth={1.5}
                    style={{ color: 'var(--settings-accent)' }}
                    aria-hidden="true"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <input
                    type="text"
                    value={passkeyLabel}
                    onChange={e => setPasskeyLabel(e.target.value)}
                    maxLength={60}
                    placeholder={t('e2ee:passkeyLabelPlaceholder')}
                    className="settings-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => void handleBindSetupPasskey()}
                    className="settings-button shrink-0"
                  >
                    <Fingerprint size={16} strokeWidth={1.5} aria-hidden="true" />
                    {t('e2ee:bindPasskeyNow')}
                  </button>
                </div>
              )}

              {passkeyHint && (
                <p className="text-xs leading-relaxed app-theme-text-muted">{passkeyHint}</p>
              )}
            </section>
          )}

          {/* Step 3: Bark E2EE mode */}
          <section className="settings-card space-y-4">
            <div className="flex items-start gap-3">
              <span className="e2ee-step-badge" aria-hidden="true">
                {isPasskeyPrfAvailable() ? '3' : '2'}
              </span>
              <div>
                <h3 className="text-sm font-semibold app-theme-text-primary">
                  {t('e2ee:step3Title')}
                </h3>
                <p className="mt-1 text-xs leading-relaxed app-theme-text-muted">
                  {t('e2ee:step3Desc')}
                </p>
              </div>
            </div>

            <div className="e2ee-choice-list" role="radiogroup" aria-label={t('e2ee:step3Title')}>
              <label
                className="e2ee-choice"
                data-selected={setupBarkMode === 'generic' ? 'true' : 'false'}
              >
                <input
                  type="radio"
                  name="setup-bark-mode"
                  checked={setupBarkMode === 'generic'}
                  onChange={() => setSetupBarkMode('generic')}
                  className="sr-only"
                />
                <div className="min-w-0">
                  <p className="e2ee-choice-title">{t('e2ee:barkModeGenericTitle')}</p>
                  <p className="e2ee-choice-desc">{t('e2ee:barkModeGenericDesc')}</p>
                </div>
                <Check
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className={
                    setupBarkMode === 'generic' ? 'e2ee-choice-check' : 'e2ee-choice-check invisible'
                  }
                />
              </label>

              <label
                className="e2ee-choice"
                data-selected={setupBarkMode === 'bark_e2ee' ? 'true' : 'false'}
              >
                <input
                  type="radio"
                  name="setup-bark-mode"
                  checked={setupBarkMode === 'bark_e2ee'}
                  onChange={() => setSetupBarkMode('bark_e2ee')}
                  className="sr-only"
                />
                <div className="min-w-0 flex-1">
                  <p className="e2ee-choice-title">{t('e2ee:barkModeCiphertextTitle')}</p>
                  <p className="e2ee-choice-desc">{t('e2ee:barkModeCiphertextDesc')}</p>
                </div>
                <Check
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className={
                    setupBarkMode === 'bark_e2ee' ? 'e2ee-choice-check' : 'e2ee-choice-check invisible'
                  }
                />
              </label>
            </div>

            {setupBarkMode === 'bark_e2ee' && (
              <div className="settings-inset p-3.5 space-y-2">
                <label
                  htmlFor="e2ee-setup-bark-key"
                  className="block text-xs font-medium app-theme-text-secondary"
                >
                  {t('e2ee:barkKeyLabel')}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="e2ee-setup-bark-key"
                    type="text"
                    value={setupBarkKey}
                    onChange={e => setSetupBarkKey(e.target.value)}
                    spellCheck={false}
                    className="settings-input flex-1 font-mono text-[13px]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSetupBarkKey(generateBarkEncryptionKey())}
                      className="settings-button"
                    >
                      <RefreshCw size={15} strokeWidth={1.5} aria-hidden="true" />
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
                      className="settings-button"
                    >
                      {copiedBarkKey ? (
                        <Check size={15} strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <Clipboard size={15} strokeWidth={1.5} aria-hidden="true" />
                      )}
                      {copiedBarkKey ? t('e2ee:copiedPhrase') : t('e2ee:copyBarkKey')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <label className="flex items-center gap-2.5 text-xs app-theme-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={setupRememberDevice}
              onChange={e => setSetupRememberDevice(e.target.checked)}
              className="rounded"
              style={{ accentColor: 'var(--settings-accent)' }}
            />
            <span>{t('e2ee:rememberBrowserLabel')}</span>
          </label>

          <p className="text-xs leading-relaxed app-theme-text-muted">
            {t('e2ee:aiCloudNotice')}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={!isSetupPhraseConfirmed || Boolean(busyMessage)}
              onClick={() => void handleEnableEncryption()}
              className="settings-button-primary"
            >
              {t('e2ee:enableConfirmButton')}
            </button>
            <button
              type="button"
              disabled={Boolean(busyMessage)}
              onClick={handleCancelSetup}
              className="settings-button"
            >
              {t('e2ee:cancelSetup')}
            </button>
          </div>
        </div>
      )}

      {/* --- UNLOCKED MANAGEMENT STATE --- */}
      {vault.status === 'unlocked' && (
        <div className="space-y-4">
          {/* Device session card */}
          <section className="settings-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="settings-section-icon">
                <Lock size={18} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-sm font-semibold app-theme-text-primary">
                    {t('e2ee:deviceLockTitle')}
                  </h3>
                  <span className="e2ee-status-line">
                    <span className="e2ee-status-dot" data-state="unlocked" aria-hidden="true" />
                    {statusText}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed app-theme-text-muted">
                  {t('e2ee:deviceLockDesc')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void lockVaultOnThisDevice(user.id)}
              className="settings-button shrink-0"
            >
              {t('e2ee:lockDeviceButton')}
            </button>
          </section>

          {/* Verification methods */}
          <section className="settings-card space-y-4">
            <div className="settings-section-heading !mb-0">
              <div className="settings-section-icon">
                <KeyRound size={18} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div>
                <h3>{t('e2ee:keySlotsTitle')}</h3>
                <p>{t('e2ee:keySlotsDesc')}</p>
              </div>
            </div>

            <div className="space-y-2">
              {vault.keySlots.map(slot => {
                const isPasskey = slot.slot_type === 'passkey_prf';
                const primaryLabel = isPasskey ? slot.label : t('e2ee:slotTypeMnemonic');
                const secondaryLabel = isPasskey
                  ? t('e2ee:slotTypePasskey')
                  : t('e2ee:slotTypeMnemonicDesc');

                return (
                  <div key={slot.id} className="e2ee-slot-row">
                    <div className="flex items-center gap-3 min-w-0">
                      {isPasskey ? (
                        <Fingerprint
                          size={16}
                          strokeWidth={1.5}
                          className="shrink-0 app-theme-text-muted"
                          aria-hidden="true"
                        />
                      ) : (
                        <KeyRound
                          size={16}
                          strokeWidth={1.5}
                          className="shrink-0 app-theme-text-muted"
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium app-theme-text-primary">
                          {primaryLabel}
                        </p>
                        <p className="mt-0.5 text-xs app-theme-text-muted">{secondaryLabel}</p>
                      </div>
                    </div>
                    {isPasskey && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveSlot(slot.id)}
                        className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                      >
                        <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                        {t('e2ee:removeSlot')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {isPasskeyPrfAvailable() && (
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  type="text"
                  value={newSlotLabel}
                  onChange={e => setNewSlotLabel(e.target.value)}
                  maxLength={60}
                  placeholder={t('e2ee:passkeyLabelPlaceholder')}
                  className="settings-input flex-1"
                />
                <button
                  type="button"
                  disabled={addingPasskey}
                  onClick={() => void handleAddPasskeyInSettings()}
                  className="settings-button shrink-0"
                >
                  {addingPasskey ? (
                    <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  {addingPasskey ? t('e2ee:addingPasskey') : t('e2ee:addPasskeyButton')}
                </button>
              </div>
            )}

            {/* Regenerate 16-word key */}
            {!regeneratedPhrase ? (
              <div className="border-t border-[var(--app-border)] pt-3">
                <button
                  type="button"
                  onClick={() => void handleStartRegeneratePhrase()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium app-theme-text-secondary transition-colors hover:text-[var(--app-ink)]"
                >
                  <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" />
                  {t('e2ee:regeneratePhraseButton')}
                </button>
              </div>
            ) : (
              <div className="space-y-3 border-t border-[var(--app-border)] pt-4">
                <div className="e2ee-phrase-sheet">
                  <div className="e2ee-phrase-grid">
                    {regenWords.map((word, index) => (
                      <div key={`${index}-${word}`} className="e2ee-phrase-cell">
                        <span className="e2ee-phrase-index">{index + 1}</span>
                        <span className="e2ee-phrase-word">{word}</span>
                      </div>
                    ))}
                  </div>
                  <div className="e2ee-phrase-bar">
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyText(regeneratedPhrase, () => {
                          setCopiedRegenPhrase(true);
                          window.setTimeout(() => setCopiedRegenPhrase(false), 2000);
                        })
                      }
                      className="e2ee-phrase-action"
                    >
                      {copiedRegenPhrase ? (
                        <Check size={14} strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <Clipboard size={14} strokeWidth={1.5} aria-hidden="true" />
                      )}
                      {copiedRegenPhrase ? t('e2ee:copiedPhrase') : t('e2ee:copyPhrase')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadRecoveryFile(regeneratedPhrase)}
                      className="e2ee-phrase-action"
                    >
                      <Download size={14} strokeWidth={1.5} aria-hidden="true" />
                      {t('e2ee:downloadPhrase')}
                    </button>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/50 rounded-[9px] px-3 py-2">
                  {t('e2ee:regeneratePhraseRotateNotice')}
                </p>
                <textarea
                  rows={2}
                  value={regeneratedConfirm}
                  onChange={e => setRegeneratedConfirm(e.target.value)}
                  placeholder={t('e2ee:confirmPhrasePlaceholder')}
                  spellCheck={false}
                  disabled={Boolean(busyMessage)}
                  className="settings-input font-mono text-[13px]"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!isRegenConfirmed || Boolean(busyMessage)}
                    onClick={() => void handleConfirmRegeneratePhrase()}
                    className="settings-button-primary"
                  >
                    {t('e2ee:saveNewPhraseButton')}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyMessage)}
                    onClick={() => {
                      setRegeneratedPhrase('');
                      setRegeneratedConfirm('');
                    }}
                    className="settings-button"
                  >
                    {t('e2ee:cancelSetup')}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Bark encrypted reminders configuration */}
          <section className="settings-card space-y-4">
            <div className="settings-section-heading !mb-0">
              <div className="settings-section-icon">
                <Bell size={18} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div>
                <h3>{t('e2ee:barkSectionTitle')}</h3>
                <p>{t('e2ee:barkSectionDesc')}</p>
              </div>
            </div>

            <div className="e2ee-choice-list" role="radiogroup" aria-label={t('e2ee:barkSectionTitle')}>
              {(
                [
                  {
                    value: 'generic' as const,
                    title: t('e2ee:barkModeGenericTitle'),
                    desc: t('e2ee:barkModeGenericDesc'),
                  },
                  {
                    value: 'bark_e2ee' as const,
                    title: t('e2ee:barkModeCiphertextTitle'),
                    desc: t('e2ee:barkModeCiphertextDesc'),
                  },
                  {
                    value: 'off' as const,
                    title: t('e2ee:barkModeOffTitle'),
                    desc: t('e2ee:barkModeOffDesc'),
                  },
                ]
              ).map(option => (
                <label
                  key={option.value}
                  className="e2ee-choice"
                  data-selected={manageBarkMode === option.value ? 'true' : 'false'}
                >
                  <input
                    type="radio"
                    name="manage-bark-mode"
                    checked={manageBarkMode === option.value}
                    onChange={() => setManageBarkMode(option.value)}
                    className="sr-only"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="e2ee-choice-title">{option.title}</p>
                    <p className="e2ee-choice-desc">{option.desc}</p>
                  </div>
                  <Check
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className={
                      manageBarkMode === option.value
                        ? 'e2ee-choice-check'
                        : 'e2ee-choice-check invisible'
                    }
                  />
                </label>
              ))}
            </div>

            {manageBarkMode === 'bark_e2ee' && (
              <div className="settings-inset p-3.5 space-y-2">
                <label
                  htmlFor="e2ee-manage-bark-key"
                  className="block text-xs font-medium app-theme-text-secondary"
                >
                  {t('e2ee:barkKeyLabel')}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="e2ee-manage-bark-key"
                    type="text"
                    value={manageBarkKey}
                    onChange={e => setManageBarkKey(e.target.value)}
                    spellCheck={false}
                    className="settings-input flex-1 font-mono text-[13px]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setManageBarkKey(generateBarkEncryptionKey())}
                      className="settings-button"
                    >
                      <RefreshCw size={15} strokeWidth={1.5} aria-hidden="true" />
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
                      className="settings-button"
                    >
                      {copiedBarkKey ? (
                        <Check size={15} strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <Clipboard size={15} strokeWidth={1.5} aria-hidden="true" />
                      )}
                      {copiedBarkKey ? t('e2ee:copiedPhrase') : t('e2ee:copyBarkKey')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              {barkSavedFeedback && (
                <span className="inline-flex items-center gap-1.5 text-xs app-theme-text-secondary">
                  <Check
                    size={14}
                    strokeWidth={1.5}
                    style={{ color: 'var(--settings-accent)' }}
                    aria-hidden="true"
                  />
                  {t('e2ee:barkSaved')}
                </span>
              )}
              <button
                type="button"
                disabled={savingBark || !isBarkDirty}
                onClick={() => void handleSaveBarkSettings()}
                className={isBarkDirty ? 'settings-button-primary' : 'settings-button'}
              >
                {savingBark ? t('e2ee:savingBarkMode') : t('e2ee:saveBarkMode')}
              </button>
            </div>
          </section>

          {/* AI capture privacy note */}
          <p className="px-1 text-xs leading-relaxed app-theme-text-muted">
            {t('e2ee:aiCloudNotice')}
          </p>

          {/* Disable E2EE */}
          <section className="settings-danger">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="settings-section-icon">
                  <ShieldOff size={18} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold app-theme-text-primary">
                    {t('e2ee:disableTitle')}
                  </h3>
                  <p className="mt-1 max-w-lg text-xs leading-relaxed app-theme-text-muted">
                    {t('e2ee:disableDesc')}
                  </p>
                </div>
              </div>
              {!confirmDisable ? (
                <button
                  type="button"
                  onClick={() => setConfirmDisable(true)}
                  className="shrink-0 rounded-[9px] border border-red-300 bg-white px-3.5 py-2 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  {t('e2ee:disableButton')}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-red-600 dark:text-red-300">
                    {t('e2ee:disableConfirmPrompt')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDisable(false)}
                    className="settings-button"
                  >
                    {t('e2ee:cancelSetup')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDisableEncryption()}
                    className="rounded-[9px] bg-red-600 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-red-700"
                  >
                    {t('e2ee:disableConfirmYes')}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {busyMessage && (
        <div
          role="status"
          aria-live="polite"
          className="settings-overlay fixed inset-0 z-[220]"
        >
          <div className="e2ee-dialog max-w-sm text-center space-y-3">
            <Loader2
              size={22}
              strokeWidth={1.5}
              className="animate-spin mx-auto app-theme-text-secondary"
              aria-hidden="true"
            />
            <p className="text-sm font-medium app-theme-text-primary">{busyMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
