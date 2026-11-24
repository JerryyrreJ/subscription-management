export const e2ee = {
  title: 'End-to-end encryption',
  subtitle: 'Encrypt subscriptions, categories, and API write logs on your device before syncing.',
  statusEnabled: 'Active',
  statusLocked: 'Locked on this browser',
  statusDisabled: 'Off',

  overviewTitle: 'Client-side encrypted sync',
  overviewBody:
    'When enabled, subscription names, amounts, billing dates, and custom categories are encrypted locally before upload. Only ciphertext is stored in the cloud.',
  scopeSyncLabel: 'New devices',
  scopeSyncValue:
    'Decrypt on new devices with a Passkey or your 16-word recovery key; trusted browsers stay decrypted across refreshes and offline edits',
  scopePushLabel: 'Renewal alerts',
  scopePushValue:
    'Send generic reminders with no billing details, or encrypted alerts paired with your Bark key',
  scopeApiLabel: 'API & MCP',
  scopeApiValue:
    'Decrypt locally through the MCP CLI, or append a per-request memory key for remote clients',

  startSetupButton: 'Set up encryption',
  cancelSetup: 'Cancel',

  step1Title: 'Save your 16-word recovery key',
  step1Desc:
    'Store these 16 words in a password manager or write them down. If you lose access to your synced devices, this key is the only way to recover your data.',
  copyPhrase: 'Copy recovery key',
  copiedPhrase: 'Copied',
  downloadPhrase: 'Download .txt',
  confirmPhraseLabel: 'Verify recovery key',
  confirmPhrasePlaceholder: 'Paste or type the 16 words in order',
  phraseVerified: 'Recovery key verified',
  phraseMismatch: '{{count}}/16 words entered, does not match yet',

  step2Title: 'Bind a Passkey (optional)',
  step2Desc:
    'Binding a synced Passkey (such as iCloud Keychain or 1Password) lets you decrypt on new phones and computers without typing the 16 words.',
  passkeyLabelPlaceholder: 'Label, e.g. iCloud Keychain',
  bindPasskeyNow: 'Bind Passkey',
  passkeyBoundSuccess: 'Bound {{label}}',
  passkeyUnsupportedHint:
    'This browser does not support the Passkey encryption extension yet. You can enable encryption with your recovery key now and add a Passkey on another device later.',

  step3Title: 'Bark renewal alerts',
  step3Desc: 'Choose how scheduled push reminders work while encryption is active.',
  barkModeGenericTitle: 'Generic reminder',
  barkModeGenericDesc: 'Sends a plain renewal notice on due dates without subscription names or amounts',
  barkModeCiphertextTitle: 'Encrypted details',
  barkModeCiphertextDesc:
    'Encrypts subscription names and amounts in your browser. Enter the key below in Bark → Push Encryption (AES256 / CBC)',
  barkModeOffTitle: 'Pause cloud alerts',
  barkModeOffDesc: 'Do not send scheduled Bark notifications while encryption is on',
  barkKeyLabel: 'Bark encryption key',
  generateBarkKey: 'Regenerate',
  copyBarkKey: 'Copy key',

  enableConfirmButton: 'Enable encryption & migrate data',
  enablingBusy: 'Encrypting and migrating cloud data…',
  pendingSyncWarning:
    'You have unsynced offline changes. Wait for cloud sync to finish before changing encryption settings.',

  // Active management state
  deviceLockTitle: 'This browser',
  deviceLockDesc: 'Decrypted locally on this browser so page refreshes and offline edits work automatically.',
  lockDeviceButton: 'Lock this browser',

  keySlotsTitle: 'Verification methods',
  keySlotsDesc: 'Any configured method can decrypt your subscriptions on a new device.',
  slotTypeMnemonic: '16-word recovery key',
  slotTypeMnemonicDesc: 'Offline recovery phrase that works on any device',
  slotTypePasskey: 'Passkey',
  addPasskeyButton: 'Add Passkey',
  addingPasskey: 'Waiting for verification…',
  regeneratePhraseButton: 'Replace recovery key',
  saveNewPhraseButton: 'Save new recovery key',
  removeSlot: 'Remove',

  barkSectionTitle: 'Bark renewal alerts',
  barkSectionDesc: 'Manage how scheduled push notifications are delivered while encrypted.',
  saveBarkMode: 'Save changes',
  savingBarkMode: 'Saving…',
  barkSaved: 'Saved',

  disableTitle: 'Turn off end-to-end encryption',
  disableDesc: 'Decrypt all subscriptions and categories in this browser and return to standard cloud sync.',
  disableButton: 'Turn off encryption',
  disableConfirmPrompt: 'Decrypt all data and return to standard cloud sync?',
  disableConfirmYes: 'Turn off',
  disablingBusy: 'Decrypting and restoring cloud storage…',

  // Locked / new device modal
  unlockModalTitle: 'Decrypt subscriptions',
  unlockModalSubtitle:
    'This account uses end-to-end encryption. Verify once to decrypt and sync on this browser.',
  unlockWithPasskeyButton: 'Continue with Passkey',
  unlockingWithPasskey: 'Verifying Passkey…',
  orUseRecoveryPhrase: 'Or enter recovery key',
  useRecoveryPhraseToggle: 'Use 16-word recovery key',
  recoveryInputLabel: '16-word recovery key',
  recoveryInputPlaceholder: 'Enter your 16 words separated by spaces',
  rememberBrowserLabel: 'Stay decrypted on this trusted browser',
  unlockWithPhraseButton: 'Decrypt data',
  unlockingWithPhrase: 'Decrypting…',
  signOutInstead: 'Sign out',

  // Errors
  errorWrongWordCount: 'Enter all 16 recovery words.',
  errorUnknownWord: 'Unrecognized word "{{word}}".',
  errorChecksum: 'Recovery key check failed. Verify spelling and word order.',
  errorGenericUnlock: 'Verification failed. Check that your Passkey or recovery key matches this account.',

  // Developer API helper
  apiE2eeTitle: 'Encrypted API & MCP access',
  apiE2eeDesc: 'Choose local client decryption or a per-request bridge key.',
  apiE2eeLocalMode: 'Local MCP decryption',
  apiE2eeLocalDesc:
    'Set SUBSCRIPTION_MANAGER_VAULT_KEY on your machine so decryption stays local',
  apiE2eeBridgeMode: 'Remote bridge key',
  apiE2eeBridgeDesc:
    'Appends a transient decryption key for web clients, used in memory per request only',
  copyVaultKeyEnv: 'Copy local key',
};
