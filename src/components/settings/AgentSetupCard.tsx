import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Clipboard, Download, Loader2, PlugZap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiKeyService, ApiKeyServiceError } from '../../services/apiKeyService';
import { buildAgentSetupPrompt, type AgentConnectionMode } from '../../utils/agentSetup';
import { getDocumentationUrl } from '../../lib/site';

export function AgentSetupCard({ apiKey }: { apiKey: string | null }) {
 const { t, i18n } = useTranslation('developerApi');
 const [mode, setMode] = useState<AgentConnectionMode>('mcp');
 const [includeKey, setIncludeKey] = useState(false);
 const [copied, setCopied] = useState(false);
 const [copyError, setCopyError] = useState(false);
 const [verification, setVerification] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
 const [verificationError, setVerificationError] = useState('');
 const [showPrompt, setShowPrompt] = useState(false);
 const prompt = buildAgentSetupPrompt({ origin: window.location.origin, locale: i18n.language, mode, apiKey: includeKey ? apiKey ?? undefined : undefined });
 const guideUrl = getDocumentationUrl('user-guide/agent-setup', i18n.language);

 useEffect(() => {
  setCopied(false);
  setCopyError(false);
 }, [prompt]);
 useEffect(() => {
  if (!copied) return;
  const timer = window.setTimeout(() => setCopied(false), 2000);
  return () => window.clearTimeout(timer);
 }, [copied]);

 const copyPrompt = async () => {
  try {
   await navigator.clipboard.writeText(prompt);
   setCopied(true);
   setCopyError(false);
  } catch {
   setCopyError(true);
   setShowPrompt(true);
  }
 };
 const verify = async () => {
  if (!apiKey) return;
  setVerification('pending');
  try {
   await ApiKeyService.verifyConnection(apiKey);
   setVerification('success');
  } catch (error) {
   setVerification('error');
   setVerificationError(error instanceof ApiKeyServiceError && error.code === 'developer_api_unavailable'
    ? t('functionsUnavailable') : t('agentVerifyFailed'));
  }
 };

 return (
  <section className="settings-card agent-setup-card" aria-labelledby="agent-setup-heading">
   <div className="flex items-start gap-3">
    <div className="agent-setup-icon"><PlugZap size={21} aria-hidden="true" /></div>
    <div className="min-w-0 flex-1">
     <p className="agent-setup-eyebrow">{t('agentEyebrow')}</p>
     <h3 id="agent-setup-heading" className="text-lg font-semibold app-theme-text-primary mt-1">{t('agentTitle')}</h3>
     <p className="text-sm app-theme-text-muted mt-2 leading-relaxed">{t('agentDescription')}</p>
    </div>
   </div>
   <ol className="agent-setup-steps">
    <li><span>{apiKey ? <Check size={12} aria-hidden="true" /> : '1'}</span><button type="button" className="hover:underline" onClick={() => document.getElementById('settings-api-key-name')?.focus()}>{t(apiKey ? 'agentKeyReady' : 'agentStepKey')}</button></li>
    <li><span>2</span>{t('agentStepCopy')}</li>
    <li><span>3</span>{t('agentStepConnect')}</li>
   </ol>
   <fieldset className="flex flex-wrap gap-2">
    <legend className="sr-only">{t('agentMode')}</legend>
    {(['mcp', 'api'] as const).map(value => (
     <label key={value} className="agent-mode-option">
      <input type="radio" name="agent-connection-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
      {t(value === 'mcp' ? 'agentModeMcp' : 'agentModeApi')}
     </label>
    ))}
   </fieldset>
   {apiKey ? (
    <label className="flex items-start gap-2 text-xs app-theme-text-muted leading-relaxed">
     <input type="checkbox" className="mt-0.5 accent-emerald-700" checked={includeKey} onChange={event => setIncludeKey(event.target.checked)} />
     {t('agentIncludeKey')}
    </label>
   ) : <p className="text-xs app-theme-text-muted leading-relaxed">{t('agentNoKey')}</p>}
   <div className="flex flex-wrap items-center gap-3">
    <button type="button" className="settings-button-primary inline-flex items-center justify-center gap-2" onClick={() => void copyPrompt()}>
     {copied ? <Check size={16} aria-hidden="true" /> : <Clipboard size={16} aria-hidden="true" />}
     {copied ? t('copied') : t('agentCopy')}
    </button>
    <button type="button" className="text-sm app-theme-text-muted hover:underline" onClick={() => setShowPrompt(!showPrompt)} aria-expanded={showPrompt} aria-controls="agent-prompt-preview">{t(showPrompt ? 'agentHidePrompt' : 'agentPreview')}</button>
   </div>
   <div aria-live="polite" className="text-xs app-theme-text-muted">
    {copied && t('agentCopiedHint')}
    {copyError && t('agentCopyFailed')}
   </div>
   {showPrompt && <textarea id="agent-prompt-preview" aria-label={t('agentPreview')} className="settings-input w-full text-xs leading-relaxed font-mono" rows={10} readOnly value={prompt} onFocus={event => event.currentTarget.select()} />}
   <div className="agent-setup-footer">
    <a href={guideUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">{t('agentGuide')}<ArrowUpRight size={14} aria-hidden="true" /></a>
    <a href="/downloads/subscription-manager-mcp.tgz" download className="inline-flex items-center gap-1"><Download size={14} aria-hidden="true" />{t('agentDownload')}</a>
    {apiKey && <button type="button" onClick={() => void verify()} disabled={verification === 'pending'} className="inline-flex items-center gap-1 disabled:opacity-50">
     {verification === 'pending' && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
     {t('agentVerify')}
    </button>}
   </div>
   <p aria-live="polite" className={`text-xs leading-relaxed ${verification === 'error' ? 'text-red-600 dark:text-red-300' : 'app-theme-text-muted'}`}>
    {verification === 'success' ? t('agentVerified') : verification === 'error' ? verificationError : t('agentCloudOnly')}
   </p>
  </section>
 );
}
