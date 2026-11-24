export const e2ee = {
  title: 'End-to-End Encryption',
  subtitle: 'Encrypt subscriptions and categories on your devices before they ever reach the cloud.',
  statusEnabled: 'Active · Zero-Knowledge Vault',
  statusLocked: 'Locked on this browser',
  statusDisabled: 'Off · Standard cloud sync',
  overviewBody:
    'Your subscriptions, amounts, custom categories, and API write audit logs are encrypted with AES-256-GCM using a 256-bit Data Encryption Key (DEK) that never touches our database.',
  zeroLossHighlightsTitle: 'All features continue working while encrypted',
  highlightPasskey: '1-tap Passkey unlock across synced devices + 16-word recovery phrase backup',
  highlightRefresh: 'Trusted-browser hardware key keeps refreshes and offline edits seamless',
  highlightBark: 'Bark native AES-256-CBC encrypted push reminders (or zero-setup private alerts)',
  highlightAiMcp: 'Stateless AI receipt capture, local zero-knowledge MCP, and split-key remote MCP',

  startSetupButton: 'Set Up End-to-End Encryption',
  cancelSetup: 'Cancel',

  step1Title: '1. Save your 16-word recovery key',
  step1Desc:
    'Store these 16 words in your password manager or write them down. If you lose all synced Passkeys and devices, this phrase is the only way to recover your subscriptions.',
  copyPhrase: 'Copy 16 words',
  copiedPhrase: 'Copied',
  downloadPhrase: 'Download .txt',
  confirmPhraseLabel: 'Paste or type your 16 words to verify backup',
  confirmPhrasePlaceholder: 'Enter the 16 recovery words separated by spaces…',
  phraseVerified: 'Recovery phrase verified',
  phraseMismatch: 'Does not match the generated 16-word phrase yet',

  step2Title: '2. Bind a Passkey for instant unlock on new devices (Recommended)',
  step2Desc:
    'Uses the WebAuthn PRF extension so Face ID, Touch ID, or your password manager can unlock your vault on new devices without typing the 16 words.',
  passkeyLabelPlaceholder: 'e.g. iCloud Keychain / 1Password',
  bindPasskeyNow: 'Bind Passkey Now',
  passkeyBoundSuccess: 'Passkey bound: {{label}}',
  passkeyUnsupportedHint:
    'Your current browser or authenticator did not expose WebAuthn PRF. You can still enable encryption with your 16-word phrase and add a Passkey later.',

  step3Title: '3. Bark renewal reminder mode',
  barkModeGenericTitle: 'Zero-setup private alert (Default)',
  barkModeGenericDesc:
    'Sends a generic reminder on renewal days without exposing subscription names or amounts.',
  barkModeCiphertextTitle: 'Rich encrypted alert (Bark Native AES-256)',
  barkModeCiphertextDesc:
    'Pre-encrypts full subscription titles and amounts in your browser. Copy this key into Bark iOS App → Push Encryption (AES256 / CBC / PKCS7).',
  barkModeOffTitle: 'Pause cloud reminders while encrypted',
  barkKeyLabel: 'Bark Encryption Key (16 or 32 ASCII chars)',
  generateBarkKey: 'Generate 32-char AES256 Key',
  copyBarkKey: 'Copy Key',

  enableConfirmButton: 'Enable Encryption & Migrate Cloud Data',
  enablingBusy: 'Encrypting records and migrating vault… Keep this tab open.',
  pendingSyncWarning:
    'You have unsynced offline changes. Please wait for cloud sync to finish before enabling or disabling encryption.',

  // Active management state
  deviceLockTitle: 'This Browser Session',
  deviceLockDesc:
    'Unlocked and protected by a non-extractable IndexedDB key so page refreshes and offline access work automatically.',
  lockDeviceButton: 'Lock This Browser',

  keySlotsTitle: 'Unlock Methods (Key Boxes)',
  keySlotsDesc:
    'Each method wraps the same underlying Data Encryption Key. Adding a synced Passkey lets new phones and laptops unlock with a single biometric check.',
  slotTypeMnemonic: '16-Word Recovery Key',
  slotTypePasskey: 'Passkey (WebAuthn PRF)',
  addPasskeyButton: 'Add Passkey Unlock',
  addingPasskey: 'Waiting for Passkey…',
  regeneratePhraseButton: 'Regenerate 16-Word Key',
  saveNewPhraseButton: 'Confirm & Replace Recovery Key',
  removeSlot: 'Remove',

  barkSectionTitle: 'Encrypted Bark Renewal Reminders',
  saveBarkMode: 'Update Reminder Encryption',
  savingBarkMode: 'Updating schedules…',
  barkSaved: 'Reminder schedules updated',

  disableTitle: 'Turn Off End-to-End Encryption',
  disableDesc:
    'Decrypts all subscriptions and categories in this browser and restores standard plaintext cloud sync.',
  disableButton: 'Turn Off Encryption…',
  disableConfirmPrompt: 'Decrypt vault and return to standard cloud sync?',
  disableConfirmYes: 'Yes, Decrypt & Turn Off',
  disablingBusy: 'Decrypting and restoring standard cloud storage…',

  // Unlock modal on new / locked device
  unlockModalTitle: 'Unlock Encrypted Vault',
  unlockModalSubtitle:
    'Your subscriptions are end-to-end encrypted. Unlock once on this browser to decrypt and sync.',
  unlockWithPasskeyButton: 'Unlock with Passkey',
  unlockingWithPasskey: 'Verifying Passkey…',
  orUseRecoveryPhrase: 'Or unlock with 16-word recovery key',
  useRecoveryPhraseToggle: 'Use 16-word recovery key instead',
  recoveryInputLabel: '16-Word Recovery Key',
  recoveryInputPlaceholder: 'Paste or type your 16 recovery words…',
  rememberBrowserLabel: 'Keep vault unlocked on this trusted browser (encrypted in IndexedDB)',
  unlockWithPhraseButton: 'Unlock Vault',
  unlockingWithPhrase: 'Decrypting vault…',
  signOutInstead: 'Sign out',

  // Errors
  errorWrongWordCount: 'Please enter all 16 recovery words.',
  errorUnknownWord: 'Unrecognized word "{{word}}" in recovery phrase.',
  errorChecksum: 'Recovery phrase checksum failed. Check spelling and word order.',
  errorGenericUnlock: 'Unable to unlock vault. Please verify your Passkey or 16-word recovery phrase.',

  // Developer API modal helper
  apiE2eeTitle: 'End-to-End Encrypted API & MCP Access',
  apiE2eeLocalMode: 'Local Zero-Knowledge MCP (Recommended)',
  apiE2eeLocalDesc:
    'Keep your vault key strictly on your own machine via SUBSCRIPTION_MANAGER_VAULT_KEY. Our servers never see your key or plaintext.',
  apiE2eeBridgeMode: 'Remote MCP / Stateless Bridge Key',
  apiE2eeBridgeDesc:
    'Appends .vk1_<vaultKey> locally for Claude Web or REST clients. Only the auth prefix hash is stored in Supabase; the vault key is used transiently in memory per request.',
  copyVaultKeyEnv: 'Copy Vault Key (vk1_…)',
};
