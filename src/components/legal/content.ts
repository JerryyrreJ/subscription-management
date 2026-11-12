// Public operator and support/privacy contact published on /privacy and /terms.
// Self-hosted forks that leave email empty display a draft notice and emit noindex.
export const legalContact = { operator: 'SteadyRenew', email: 'jerryno153@gmail.com' };

export type LegalKind = 'privacy' | 'terms';
export type LegalLocale = 'en' | 'zh-CN';
export const legalContent = {
 en: {
  privacy: {
   title: 'Privacy Policy',
   intro: 'How SteadyRenew handles your information when you use steadyrenew.com and its hosted application. Independently hosted copies have their own operators and policies.',
   sections: [
    ['Local use and cloud accounts', 'Without signing in, subscription records and preferences are stored in your browser. Clearing browser storage can remove them. If you sign in and use cloud sync, we process your account identifier, email, profile information, subscription names, amounts, currencies, billing dates, categories, and settings to provide authentication, synchronization, reports, and reminders.'],
    ['Google and GitHub sign-in', 'Sign-in is handled through Supabase Auth. Google may provide your account identifier, email address and verification status, name, and profile picture, according to the permissions you approve. We use this information to identify you and provide your account. We do not request access to Gmail, Google Drive, Calendar, contacts, or bank accounts. GitHub sign-in similarly supplies basic account information. We do not sell Google user data, use it for advertising, or send Google sign-in data to AI providers for model training.'],
    ['AI assistance', 'When you ask AI to interpret text or an image, the submitted content and relevant subscription/category context are sent to the configured AI service (OpenRouter and its selected model provider, or Anthropic). Do not submit secrets or unnecessary personal information. SteadyRenew does not persist the raw prompt or image as capture history; we retain usage and quota information for limits and abuse prevention. If you confirm a proposed change, the resulting subscription record is saved. Provider processing and retention are governed by that provider’s policies; this is not a promise of zero retention by every provider.'],
    ['Reminders, payments, and connected tools', 'If you enable Bark, we process your Bark server address, device key, notification settings, language and time zone, and send reminder content to your chosen Bark server and push delivery services. Stripe handles payment details; we retain payment email, transaction identifiers, amount, currency, timestamps, status, and account entitlement information, rather than full card details. API keys and MCP clients you authorize can access or change records within their granted permissions. Revoke keys you no longer need.'],
    ['Service providers and technical data', 'We use Netlify for hosting and server functions, Supabase for authentication and cloud data, Stripe for payments, and Mintlify for documentation. Network/CDN providers and these services may process IP addresses, request metadata, security logs, and diagnostic information to deliver and protect the service. Exchange-rate requests contact exchangerate-api.com; PDF styling may load fonts from Google Fonts. Those requests expose normal network metadata. We use browser storage for records, preferences, authentication sessions, and security. We do not sell personal information or use subscription records for targeted advertising.'],
    ['Purposes, sharing, and international processing', 'We process data to provide features you request, secure the service, prevent abuse, handle support and payments, and meet legal obligations. Where applicable, the legal bases are performance of our agreement, legitimate interests in security and service operation, legal obligations, and consent where required. Information is shared with providers as needed for these purposes, with tools you authorize, or when required by law. Providers may process data outside your country, subject to applicable safeguards.'],
    ['Retention and deletion', 'Local records remain until you delete them or clear browser storage. Cloud account data is retained while needed to provide your account. Use the account deletion control in account settings to delete your account and its cloud records, API keys, and this account’s local data on the current device. Copies on other devices, exports, and records held by tools you authorized must be removed separately. Payment records may remain for financial reconciliation, refunds, disputes, and applicable legal obligations. Security logs and provider backups may remain for their limited operational retention periods; deletion is not a promise of immediate erasure from all backups.'],
    ['Your choices and security', 'You can edit or export subscription records, disable reminders, revoke API keys, delete your account, and remove Google access at myaccount.google.com/connections. Disconnecting Google alone does not delete your SteadyRenew account. Depending on your location, you may have rights to access, correct, delete, restrict or object to processing, obtain a copy of your data, withdraw consent, or complain to a data protection authority. Contact us to exercise these rights; we may need to verify your identity. We use access controls and encrypted transport, but no service can guarantee absolute security.'],
    ['Children and policy updates', 'The service is not directed to children under 13 or anyone below the applicable minimum age for consent in their country. Contact us if a child has provided personal information. We will update the date on this page when this policy changes and provide additional notice for material changes where required.'],
   ],
  },
  terms: {
   title: 'Terms of Service',
   intro: 'These terms govern use of the hosted SteadyRenew service at steadyrenew.com. By creating an account or using the service, you agree to these terms. If you do not agree, do not use the service.',
   sections: [
    ['The service', 'SteadyRenew helps you track subscriptions, estimate spending, and receive reminders. It does not cancel subscriptions with merchants, move money, access your bank account, or provide financial, tax, or legal advice. You remain responsible for merchant payments and cancellation deadlines.'],
    ['Eligibility and accounts', 'You must meet the applicable minimum age and have legal capacity to accept these terms, or use the service with a parent or guardian who accepts them where permitted. Keep account information accurate and protect your login and API keys. You are responsible for actions you authorize through connected tools. Notify us if you suspect unauthorized access.'],
    ['Your data and acceptable use', 'You retain your rights in the information you submit and permit us and our service providers to process it to operate the features you request, as described in the Privacy Policy. Only submit information you are entitled to use. Do not break the law, access another person’s account, distribute malicious content, evade usage limits, or interfere with service security or availability.'],
    ['Estimates, AI, and reminders', 'Exchange rates, spending projections, AI suggestions, and reminders may be inaccurate, delayed, or unavailable. Review AI actions before confirming them and verify amounts and dates with the merchant. Keep independent records and backups; do not rely on a reminder as your only way to avoid a charge.'],
    ['Paid features and refunds', 'Premium is currently offered as a one-time purchase, with the price, currency, and included features shown before checkout. It is not an automatic recurring subscription. Future offerings may differ. Refund requests can be submitted using the contact below with your payment reference; do not send card details. Applicable statutory cancellation and refund rights remain unaffected. Deleting an account does not automatically issue a refund. A full refund or reversed payment may remove the associated entitlement; payment disputes may temporarily suspend it.'],
    ['Availability and termination', 'We may update the service or limit access to address abuse, security issues, maintenance, or legal requirements. Where practicable, we will give notice of material reductions to paid features or discontinuation and provide appropriate remedies required by applicable law. A one-time purchase does not guarantee perpetual operation. You may stop using the service and delete your account at any time; export records you wish to keep first.'],
    ['Third parties and open source', 'Google, GitHub, Stripe, AI providers, Bark servers, and other connected services have their own terms and policies. Their availability is outside our control. The repository’s software license governs use of the source code; these terms govern the hosted service and do not replace that license.'],
    ['Responsibility and applicable rights', 'To the extent permitted by law, the service is provided as available without a guarantee of uninterrupted operation or error-free results. We are not responsible for merchant charges caused by incorrect user records or missed reminders except where applicable law requires otherwise. Nothing in these terms excludes liability or consumer rights that cannot lawfully be excluded, including liability for fraud or other mandatory protections.'],
    ['Changes and questions', 'The date on this page identifies the latest version. We will provide notice of material changes where required by law. Contact us with service, payment, or dispute questions so we can try to resolve them. Mandatory laws and consumer protections applicable to you continue to apply.'],
   ],
  },
 },
 'zh-CN': {
  privacy: {
   title: '隐私政策',
   intro: '本政策说明 SteadyRenew 如何处理你在 steadyrenew.com 及其托管应用中提供的信息。自行部署的副本由各自的运营者负责，并适用其隐私政策。',
   sections: [
    ['本地使用与云端账号', '未登录时，订阅记录与偏好保存在你的浏览器中；清除浏览器存储可能删除这些内容。登录并使用云同步时，我们处理账号标识、邮箱、个人资料、订阅名称、金额、币种、账期、分类和设置，以提供登录、同步、报表和提醒。'],
    ['Google 与 GitHub 登录', '登录通过 Supabase Auth 完成。根据你批准的权限，Google 可能提供账号标识、邮箱及其验证状态、姓名和头像，用于识别身份和提供账号服务。我们不申请读取 Gmail、Google Drive、日历、通讯录或银行账户的权限。GitHub 登录同样提供基本账号信息。我们不出售 Google 用户数据，不将其用于广告，也不会将 Google 登录数据发送给 AI 提供商用于模型训练。'],
    ['AI 辅助', '你主动请求 AI 解析文本或图片时，提交的内容及相关订阅、分类上下文会发送给配置的 AI 服务（OpenRouter 及所选模型提供商，或 Anthropic）。请勿提交密钥或不必要的个人信息。SteadyRenew 不将原始输入或图片持久保存为识别历史，但会保留用量与配额信息，用于限额和防滥用；确认操作后，生成的订阅记录会被保存。第三方的处理和留存适用其自身政策，这并不代表所有提供商都承诺零留存。'],
    ['提醒、支付与连接工具', '启用 Bark 后，我们处理你选择的 Bark 服务器地址、设备密钥、通知设置、语言和时区，并将提醒内容发送给该服务器及推送服务。Stripe 处理付款信息；我们保存付款邮箱、交易标识、金额、币种、时间、状态和账号权益，而非完整银行卡信息。你授权的 API Key 或 MCP 客户端可以在权限范围内访问或修改记录；请撤销不再使用的密钥。'],
    ['服务提供商与技术信息', '我们使用 Netlify 托管网站和服务端函数、Supabase 提供身份验证和云存储、Stripe 处理支付、Mintlify 托管文档。这些服务及网络/CDN 提供商可能为交付服务和保障安全处理 IP 地址、请求元数据、安全日志及诊断信息。汇率请求连接 exchangerate-api.com；PDF 样式可能加载 Google Fonts 字体，相关请求会暴露通常的网络元数据。浏览器存储用于记录、偏好、登录会话和安全。我们不出售个人信息，不将订阅记录用于定向广告。'],
    ['处理目的、共享与跨境处理', '我们为提供你请求的功能、保障安全、防止滥用、处理支持与付款以及履行法定义务而处理数据。在适用情况下，处理依据包括履行服务约定、维护安全和运营的合法利益、法定义务，以及法律要求的同意。仅在实现上述目的所需范围内向服务提供商、你授权的工具或依法有权接收信息的主体共享数据。提供商可能在你所在国家或地区之外处理数据，并适用相应的数据保护措施。'],
    ['保存与删除', '本地记录会保留至你删除记录或清除浏览器存储。云端账号数据在提供账号服务所需期间保留。你可以在账号设置中使用注销功能，删除账号、云端记录、API Key 以及当前设备上属于该账号的数据。其他设备副本、导出文件及授权工具持有的记录需要另外删除。付款记录可能为财务核对、退款、争议和法定要求继续保留。安全日志和服务商备份可能在有限的运营留存期内保留；注销不意味着所有备份立即清除。'],
    ['你的选择与安全', '你可以修改或导出订阅、停用提醒、撤销 API Key、注销账号，并在 myaccount.google.com/connections 移除 Google 授权；仅取消 Google 授权不会删除 SteadyRenew 账号。根据所在地法律，你可能享有访问、更正、删除、限制或反对处理、获取数据副本、撤回同意及向监管机构投诉的权利。请联系我们行使权利；我们可能需要核实身份。我们使用访问控制和加密传输，但无法保证绝对安全。'],
    ['未成年人及政策更新', '本服务不面向未满 13 岁或未达到所在地适用同意年龄的儿童。如儿童提供了个人信息，请联系我们处理。政策变化时会更新本页日期；重大变更会在法律要求时另行通知。'],
   ],
  },
  terms: {
   title: '服务条款',
   intro: '本条款适用于 steadyrenew.com 提供的 SteadyRenew 托管服务。创建账号或使用服务即表示你同意本条款；如不同意，请停止使用。',
   sections: [
    ['服务范围', 'SteadyRenew 帮助记录订阅、估算支出和接收提醒，不代你向商家取消订阅、不转移资金、不访问银行账户，也不提供财务、税务或法律建议。商家付款及取消期限仍由你自行负责。'],
    ['使用资格与账号', '你应达到适用的最低年龄，并有能力接受本条款；法律允许时，可由接受本条款的父母或监护人同意使用。请保持账号信息准确，保护登录凭据与 API Key。你对授权连接工具执行的操作负责；发现未经授权的访问请联系我们。'],
    ['你的数据与合理使用', '你保留所提交信息的权利，并允许我们及服务提供商按照隐私政策处理这些信息，以提供你请求的功能。仅提交你有权使用的信息。不得违法使用服务、访问他人账号、传播恶意内容、绕过限额或破坏服务的安全与可用性。'],
    ['估算、AI 与提醒', '汇率、支出预测、AI 建议和提醒可能不准确、延迟或不可用。确认 AI 操作前请检查结果，并向商家核实金额和日期。请保留独立记录和备份，不要仅依赖提醒避免扣款。'],
    ['付费功能与退款', 'Premium 当前为一次性购买，付款前会展示价格、币种及包含的功能，不会自动循环收费；未来方案可能有所不同。退款请求可通过下方联系方式提交，请提供交易参考信息，不要发送银行卡详情。适用法律赋予的取消和退款权利不受影响。注销账号不会自动退款；全额退款或付款撤销可能移除相应权益，付款争议期间可能暂停相应权益。'],
    ['可用性与终止', '我们可能为维护、处理滥用、安全问题或法定要求更新服务或限制访问。在可行情况下，对付费功能的重大减少或停止服务会提前通知，并提供适用法律要求的补救。一次性购买不代表承诺永久运营。你可以随时停止使用并注销账号；请先导出需要保留的记录。'],
    ['第三方与开源代码', 'Google、GitHub、Stripe、AI 提供商、Bark 服务器及其他连接服务适用各自的条款与政策，其可用性不完全受我们控制。源代码的使用适用仓库软件许可证；本条款适用于托管服务，不取代软件许可证。'],
    ['责任与法定权利', '在法律允许的范围内，服务按现有可用状态提供，不保证持续可用或完全无误。除适用法律另有要求外，我们不对用户记录错误或遗漏提醒造成的商家扣款负责。本条款不排除法律不允许排除的责任或消费者权利，包括欺诈责任及其他强制保护。'],
    ['条款变更与联系', '本页日期表示最新版本。重大变更会按适用法律要求通知。如有服务、付款或争议问题，请联系我们协商处理。适用于你的强制性法律及消费者保护继续有效。'],
   ],
  },
 },
} as const;
