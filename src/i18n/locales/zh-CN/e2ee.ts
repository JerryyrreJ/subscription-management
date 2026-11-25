export const e2ee = {
  title: '端到端加密',
  subtitle: '订阅、分类与接口写入记录在离开当前设备前完成加密。',
  statusEnabled: '已开启',
  statusLocked: '此浏览器已锁定',
  statusDisabled: '未开启',

  overviewTitle: '本地加密同步',
  overviewBody:
    '开启后，订阅名称、金额、账单日期与自定义分类均在本地加密后再上传，服务端与数据库只存储密文。',
  scopeSyncLabel: '跨设备访问',
  scopeSyncValue:
    '支持使用 Passkey 或 16 词恢复密钥在新设备解密；已验证的受信任浏览器刷新与离线打开无需重复输入',
  scopePushLabel: '续费提醒',
  scopePushValue:
    '可发送不含订阅明细的通用提醒，或配合手机 Bark 推送密钥发送加密通知',
  scopeApiLabel: 'API 与 MCP',
  scopeApiValue:
    '支持在本机运行 MCP 完成加解密，或为远端客户端附加单次请求内存密钥',
  scopeAiLabel: 'AI 智能录入',
  scopeAiValue:
    '若使用 AI 添加或修改订阅，你在输入框发送的文字或截图会经由后端转发给 OpenRouter 上的模型处理（不会上传已有订阅列表）；如介意，请直接使用手动录入',
  aiCloudNotice:
    '提示：若使用 AI 录入或修改订阅，你在输入框发送的内容会经由我们的后端转发给 OpenRouter 上的模型处理（不会上传已有订阅列表）；如介意，请使用手动录入。',

  startSetupButton: '开启端到端加密',
  cancelSetup: '取消',

  step1Title: '保存 16 词恢复密钥',
  step1Desc:
    '请将以下 16 个英文单词存入密码管理器或抄写留存。若所有已绑定设备均无法使用，只能凭此恢复密钥找回数据。',
  copyPhrase: '复制恢复密钥',
  copiedPhrase: '已复制',
  downloadPhrase: '下载文本备份',
  confirmPhraseLabel: '核对恢复密钥',
  confirmPhrasePlaceholder: '按顺序粘贴或输入上方 16 个英文单词',
  phraseVerified: '恢复密钥核对一致',
  phraseMismatch: '已输入 {{count}}/16 个单词，内容尚未匹配',

  step2Title: '绑定 Passkey（可选）',
  step2Desc:
    '绑定支持云同步的 Passkey（如 iCloud 钥匙串或 1Password）后，在新设备上可直接验证身份解密，无需输入恢复密钥。',
  passkeyLabelPlaceholder: '名称，例如 iCloud 钥匙串',
  bindPasskeyNow: '绑定 Passkey',
  passkeyBoundSuccess: '已绑定 {{label}}',
  passkeyUnsupportedHint:
    '当前浏览器暂不支持用于加密的 Passkey 扩展，你仍可先凭恢复密钥开启，稍后在其他设备添加。',

  step3Title: 'Bark 续费提醒',
  step3Desc: '选择端到端加密开启期间的到期推送方式。',
  barkModeGenericTitle: '通用提醒',
  barkModeGenericDesc: '到期日发送“你有一项订阅即将续费”，不包含订阅名称与金额',
  barkModeCiphertextTitle: '加密明细提醒',
  barkModeCiphertextDesc:
    '在浏览器内预先加密订阅名称与金额，需将下方密钥填入手机 Bark 的“推送加密”（AES256 / CBC）',
  barkModeOffTitle: '暂停云端提醒',
  barkModeOffDesc: '加密开启期间不发送 Bark 续费通知',
  barkKeyLabel: 'Bark 推送密钥',
  generateBarkKey: '重新生成',
  copyBarkKey: '复制密钥',

  enableConfirmButton: '开启加密并迁移数据',
  enablingBusy: '正在加密并迁移云端数据…',
  pendingSyncWarning:
    '本地仍有尚未同步的离线修改，请等待云同步完成后再更改加密状态。',

  // 已开启管理态
  deviceLockTitle: '当前浏览器',
  deviceLockDesc: '此浏览器已保存本地解密状态，刷新页面与离线打开时自动可用。',
  lockDeviceButton: '锁定此浏览器',

  keySlotsTitle: '验证方式',
  keySlotsDesc: '任一已添加的方式均可在新设备上解密你的订阅数据。',
  slotTypeMnemonic: '16 词恢复密钥',
  slotTypeMnemonicDesc: '离线恢复短语，可在任意设备恢复访问',
  slotTypePasskey: 'Passkey',
  addPasskeyButton: '添加 Passkey',
  addingPasskey: '正在等待验证…',
  regeneratePhraseButton: '更换恢复密钥',
  regeneratePhraseRotateNotice:
    '更换恢复密钥会同时轮换底层加密主密钥并重新加密所有云端数据。完成后，旧恢复密钥与旧 API/MCP 密钥（vk1_）将立即失效，已绑定的 Passkey 需重新添加。',
  rotatingPhraseBusy: '正在轮换主密钥并重新加密数据…',
  saveNewPhraseButton: '轮换主密钥并保存',
  removeSlot: '移除',

  barkSectionTitle: 'Bark 续费提醒',
  barkSectionDesc: '管理加密开启期间的云端推送方式。',
  saveBarkMode: '保存更改',
  savingBarkMode: '正在保存…',
  barkSaved: '已保存',

  disableTitle: '关闭端到端加密',
  disableDesc: '在当前浏览器解密所有订阅与分类，并恢复为标准云同步。',
  disableButton: '关闭端到端加密',
  disableConfirmPrompt: '确认解密全部数据并恢复标准云同步？',
  disableConfirmYes: '确认关闭',
  disablingBusy: '正在解密并恢复标准云端存储…',

  // 新设备 / 锁定态解密弹窗
  unlockModalTitle: '解密订阅数据',
  unlockModalSubtitle:
    '此账号已开启端到端加密，完成一次验证即可在此浏览器同步数据。',
  unlockWithPasskeyButton: '使用 Passkey 验证',
  unlockingWithPasskey: '正在验证 Passkey…',
  orUseRecoveryPhrase: '或输入恢复密钥',
  useRecoveryPhraseToggle: '使用 16 词恢复密钥',
  recoveryInputLabel: '16 词恢复密钥',
  recoveryInputPlaceholder: '输入 16 个英文单词，以空格分隔',
  rememberBrowserLabel: '在此受信任浏览器保持已解密状态',
  unlockWithPhraseButton: '解密数据',
  unlockingWithPhrase: '正在解密…',
  signOutInstead: '退出登录',

  // 降级阻断告警
  downgradeBlockedTitle: '检测到加密状态异常',
  downgradeAccountMissingBody:
    '此浏览器此前记录该账号已开启端到端加密，但服务端当前显示未开启。为防止数据在不知情的情况下以明文上传，已暂停同步。如果你刚刚在其他设备主动关闭了加密，可确认后恢复标准同步；否则请退出登录并检查账号安全。',
  downgradeTableUnavailableBody:
    '此浏览器此前记录该账号已开启端到端加密，但服务端加密服务当前不可用。为防止静默降级为明文同步，已暂停同步。请稍后重试或退出登录。',
  downgradeRetryButton: '重新检查状态',
  downgradeAcknowledgeButton: '我已在其他设备关闭加密，恢复标准同步',
  downgradeConfirmPrompt: '确认已主动关闭端到端加密并恢复标准明文同步？',
  downgradeConfirmYes: '确认恢复标准同步',

  // 错误提示
  errorWrongWordCount: '请输入完整的 16 个英文单词。',
  errorUnknownWord: '包含未识别的单词“{{word}}”。',
  errorChecksum: '恢复密钥校验未通过，请检查拼写或顺序。',
  errorGenericUnlock: '验证未通过，请确认 Passkey 或恢复密钥与当前账号匹配。',

  // API & MCP 辅助提示
  apiE2eeTitle: '加密数据接入方式',
  apiE2eeDesc: '选择本地客户端解密或远端桥接模式。',
  apiE2eeLocalMode: '本地 MCP 解密',
  apiE2eeLocalDesc:
    '在本机环境变量设置 SUBSCRIPTION_MANAGER_VAULT_KEY，加解密在本地完成',
  apiE2eeBridgeMode: '远端桥接密钥',
  apiE2eeBridgeDesc:
    '在 API Key 后附加解密段供网页端客户端调用，仅在当次请求内存中使用',
  copyVaultKeyEnv: '复制本地密钥',
};
