export const e2ee = {
  title: '端到端加密',
  subtitle: '所有订阅与分类在离开你的设备前完成加密，服务端与数据库零明文、零密钥。',
  statusEnabled: '已开启 · 零知识加密保险库',
  statusLocked: '当前浏览器已锁定',
  statusDisabled: '未开启 · 标准云同步',
  overviewBody:
    '订阅名称、金额、日期、自定义分类及 API 写入审计日志均采用 AES-256-GCM 逐行加密。真正的数据主密钥（DEK）仅在你的设备端解封，绝不上传或写入数据库。',
  zeroLossHighlightsTitle: '开启加密后，全部现有功能完整保留',
  highlightPasskey: '支持通行密钥（Passkey）跨设备刷脸秒开 + 16 个英文单词恢复密钥救命兜底',
  highlightRefresh: '本机通过 IndexedDB 不可导出密钥保护，刷新网页与断网离线编辑无需重复输入',
  highlightBark: '支持 Bark 原生 AES-256-CBC 密文推送（锁屏正常看订阅名与金额，服务端全程盲发）',
  highlightAiMcp: '完整兼容 AI 截图识别、本地零知识 npx MCP 及双段式远端 HTTP MCP',

  startSetupButton: '开始设置端到端加密',
  cancelSetup: '取消',

  step1Title: '1. 保存你的 16 个单词恢复密钥',
  step1Desc:
    '请把这 16 个单词存入密码管理器或妥善抄写。万一所有已同步通行密钥的设备全部丢失，这是找回加密订阅数据的唯一途径。',
  copyPhrase: '复制 16 个单词',
  copiedPhrase: '已复制',
  downloadPhrase: '下载 .txt 备份',
  confirmPhraseLabel: '粘贴或输入刚才保存的 16 个单词以确认备份无误',
  confirmPhrasePlaceholder: '输入或粘贴 16 个英文恢复单词（空格分隔）…',
  phraseVerified: '恢复密钥核对一致',
  phraseMismatch: '与上方生成的 16 个单词尚未匹配',

  step2Title: '2. 绑定通行密钥 Passkey，新设备免输代码秒开（推荐）',
  step2Desc:
    '利用浏览器 WebAuthn PRF 硬件加密扩展，换新手机或新电脑时直接刷 Face ID / 指纹即可解开数据主钥匙，无需手敲 16 个单词。',
  passkeyLabelPlaceholder: '例如：iCloud 钥匙串 / 1Password',
  bindPasskeyNow: '立即绑定通行密钥',
  passkeyBoundSuccess: '已绑定通行密钥：{{label}}',
  passkeyUnsupportedHint:
    '当前浏览器或密码器暂未开放 WebAuthn PRF 加密扩展。你仍可先用 16 个单词开启加密，稍后在支持的设备上补充绑定 Passkey。',

  step3Title: '3. 选择 Bark 自动续费提醒方式',
  barkModeGenericTitle: '免配置隐私提醒（默认）',
  barkModeGenericDesc:
    '无需在手机 Bark App 里额外设置，到期日推送“您有一项加密订阅即将续费”通用提醒，不暴露名称与金额。',
  barkModeCiphertextTitle: '富文本密文提醒（配合 Bark 原生加密）',
  barkModeCiphertextDesc:
    '浏览器提前将完整续费文案加密为密文信封交由定时任务盲发。请将下方密钥填入手机 Bark App → 推送加密（算法 AES256 / 模式 CBC / PKCS7）。',
  barkModeOffTitle: '加密期间暂停云端 Bark 推送',
  barkKeyLabel: 'Bark 推送加密密钥（16 或 32 位 ASCII 字符）',
  generateBarkKey: '随机生成 32 位 AES256 密钥',
  copyBarkKey: '复制密钥',

  enableConfirmButton: '确认已备份，立即开启并迁移云端数据',
  enablingBusy: '正在加密全部记录并原子迁移云端存储，请勿关闭页面…',
  pendingSyncWarning:
    '检测到本地仍有尚未同步的离线改动，请等待云同步完成后再开启或关闭端到端加密。',

  // 已开启管理态
  deviceLockTitle: '当前浏览器解锁状态',
  deviceLockDesc:
    '已使用浏览器底层不可导出的 IndexedDB 硬件钥匙保护，日常刷新页面与离线打开自动无感解密。',
  lockDeviceButton: '锁定此浏览器',

  keySlotsTitle: '解锁方式管理（钥匙盒）',
  keySlotsDesc:
    '以下每个钥匙盒里锁的都是同一把数据主钥匙。绑定支持云同步的通行密钥后，换新设备可直接刷脸解锁。',
  slotTypeMnemonic: '16 词恢复密钥',
  slotTypePasskey: '通行密钥 (Passkey PRF)',
  addPasskeyButton: '添加通行密钥解锁',
  addingPasskey: '正在等待通行密钥验证…',
  regeneratePhraseButton: '重新生成 16 词恢复码',
  saveNewPhraseButton: '确认替换恢复密钥',
  removeSlot: '移除',

  barkSectionTitle: 'Bark 端到端加密续费提醒',
  saveBarkMode: '更新提醒加密配置',
  savingBarkMode: '正在重新生成密文队列…',
  barkSaved: '提醒调度队列已更新',

  disableTitle: '关闭端到端加密',
  disableDesc:
    '在当前浏览器将所有加密订阅与分类解密，并无损迁回标准云同步模式。',
  disableButton: '关闭端到端加密…',
  disableConfirmPrompt: '确认解密全部数据并切回普通云同步模式吗？',
  disableConfirmYes: '确认解密并关闭',
  disablingBusy: '正在解密并恢复标准云端存储…',

  // 新设备 / 锁定态解锁弹窗
  unlockModalTitle: '解锁端到端加密保险库',
  unlockModalSubtitle:
    '你的订阅数据已受端到端加密保护。在此新浏览器完成一次解锁后即可自动同步并保持免密。',
  unlockWithPasskeyButton: '使用通行密钥一键解锁',
  unlockingWithPasskey: '正在验证通行密钥…',
  orUseRecoveryPhrase: '或使用 16 个单词恢复密钥解锁',
  useRecoveryPhraseToggle: '改用 16 个单词恢复密钥解锁',
  recoveryInputLabel: '16 个单词恢复密钥',
  recoveryInputPlaceholder: '粘贴或输入你保存的 16 个英文单词（空格分隔）…',
  rememberBrowserLabel: '在此受信任浏览器记住解锁状态（使用 IndexedDB 不可导出密钥加密保存）',
  unlockWithPhraseButton: '解锁订阅数据',
  unlockingWithPhrase: '正在验证并解密…',
  signOutInstead: '退出当前账号',

  // 错误提示
  errorWrongWordCount: '请输入完整的 16 个英文恢复单词。',
  errorUnknownWord: '恢复短语中包含未识别的单词：“{{word}}”。',
  errorChecksum: '恢复短语校验未通过，请检查单词拼写或顺序是否有误。',
  errorGenericUnlock: '解锁失败，请确认通行密钥或 16 词恢复短语与当前账号匹配。',

  // API & MCP 辅助提示
  apiE2eeTitle: '端到端加密模式下的 API 与 MCP 接入',
  apiE2eeLocalMode: '本地零知识 MCP 模式（推荐）',
  apiE2eeLocalDesc:
    '在本机环境变量设置 SUBSCRIPTION_MANAGER_VAULT_KEY，加解密 100% 在你电脑本地完成，服务器绝不接触密钥。',
  apiE2eeBridgeMode: '远端 MCP / 无状态桥接密钥模式',
  apiE2eeBridgeDesc:
    '在浏览器本地拼接 .vk1_<解密段> 供网页版 Claude 等连接。数据库仅存前半截鉴权哈希，解密段仅在单次请求内存中瞬时使用后销毁。',
  copyVaultKeyEnv: '复制本地解密密钥 (vk1_…)',
};
