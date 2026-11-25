import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clipboard, Code2, KeyRound, Loader2, PlugZap, ShieldCheck, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useVaultState } from '../hooks/useVaultState';
import { getUnlockedVaultKeyToken } from '../lib/e2ee/vaultSession';
import { AgentSetupCard } from './settings/AgentSetupCard';
import {
 ApiKeyLimits,
 ApiKeyMetadata,
 ApiKeyService,
 ApiKeyServiceError,
} from '../services/apiKeyService';
import {
 ConnectedOAuthApp,
 OAuthGrantService,
} from '../services/oauthGrantService';

interface DeveloperApiModalProps {
 isOpen: boolean;
 accessToken?: string;
 onClose: () => void;
 onOpenAuth: () => void;
 isStandalone?: boolean;
}

const formatDateTime = (value: string | null, emptyLabel: string, locale: string): string => {
 if (!value) {
  return emptyLabel;
 }

 return new Intl.DateTimeFormat(locale || undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
 }).format(new Date(value));
};

const getErrorMessage = (
 error: unknown,
 fallback: string,
 t: (key: string) => string
): string => {
 if (error instanceof ApiKeyServiceError) {
  if (error.code === 'developer_api_unavailable') {
   return t('developerApi:functionsUnavailable');
  }

  if (error.code === 'invalid_api_response') {
   return t('developerApi:invalidResponse');
  }
 }

 return error instanceof Error ? error.message : fallback;
};

export function DeveloperApiModal({
 isOpen,
 accessToken,
 onClose,
 onOpenAuth,
 isStandalone = true
}: DeveloperApiModalProps) {
 useModalScrollLock(isOpen && isStandalone);
 const { t, i18n } = useTranslation(['developerApi', 'app', 'e2ee']);
 const { user } = useAuth();
 const vault = useVaultState();
 const unlockedVaultKeyToken = user?.id ? getUnlockedVaultKeyToken(user.id) : null;
 const [e2eeApiMode, setE2eeApiMode] = useState<'local' | 'bridge'>('local');
 const [copiedVaultKey, setCopiedVaultKey] = useState(false);
 const defaultKeyName = t('developerApi:defaultKeyName');
 const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
 const [limits, setLimits] = useState<ApiKeyLimits | null>(null);
 const [connectedApps, setConnectedApps] = useState<ConnectedOAuthApp[]>([]);
 const [oauthAvailable, setOauthAvailable] = useState(false);
 const [updatingScopeClientId, setUpdatingScopeClientId] = useState<string | null>(null);
 const [confirmRevokeClientId, setConfirmRevokeClientId] = useState<string | null>(null);
 const [revokingClientId, setRevokingClientId] = useState<string | null>(null);
 const [newKeyName, setNewKeyName] = useState(defaultKeyName);
 const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
 const [createdKeyId, setCreatedKeyId] = useState<string | null>(null);
 const [createdKeyScopes, setCreatedKeyScopes] = useState<readonly string[] | undefined>(undefined);
 const [keyAccess, setKeyAccess] = useState<'write' | 'read'>('write');
 const [copied, setCopied] = useState(false);
 const [loading, setLoading] = useState(false);
 const [submitting, setSubmitting] = useState(false);
 const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
 const [revokingId, setRevokingId] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);
 const sessionEpoch = useRef(0);

 const loadKeys = useCallback(async () => {
  if (import.meta.env.DEV && accessToken === 'dev_preview_token') {
   setLimits({ plan: 'premium', activeKeys: 5, requestsPerMinute: 60 });
   setOauthAvailable(true);
   setConnectedApps([
    {
     clientId: 'preview-chatgpt',
     clientName: 'ChatGPT',
     clientUri: 'https://chatgpt.com',
     logoUri: null,
     grantedAt: '2026-11-24T04:30:00.000Z',
     lastUsedAt: '2026-11-24T04:38:00.000Z',
     scopes: ['read', 'write'],
    },
    {
     clientId: 'preview-claude',
     clientName: 'Claude',
     clientUri: 'https://claude.ai',
     logoUri: null,
     grantedAt: '2026-11-23T14:15:00.000Z',
     lastUsedAt: null,
     scopes: ['read'],
    },
   ]);
   setKeys([
    {
     id: 'preview-key-1',
     name: 'Codex CLI',
     keyPrefix: 'subm_9k2xQp7Lm',
     scopes: ['read', 'write'],
     createdAt: '2026-11-20T09:00:00.000Z',
     lastUsedAt: '2026-11-24T01:10:00.000Z',
     revokedAt: null,
    },
   ]);
   return;
  }

  if (!accessToken) {
   return;
  }

  setLoading(true);
  setError(null);
  const epoch = sessionEpoch.current;

  try {
   const [keyResult, oauthResult] = await Promise.all([
    ApiKeyService.listApiKeys(accessToken),
    user?.id
     ? OAuthGrantService.listConnectedApps(user.id).catch(() => ({
      apps: [] as ConnectedOAuthApp[],
      oauthAvailable: false,
     }))
     : Promise.resolve({ apps: [] as ConnectedOAuthApp[], oauthAvailable: false }),
   ]);
   if (epoch !== sessionEpoch.current) return;
   setKeys(keyResult.keys);
   setLimits(keyResult.limits);
   setConnectedApps(oauthResult.apps);
   setOauthAvailable(oauthResult.oauthAvailable);
  } catch (loadError) {
   if (epoch !== sessionEpoch.current) return;
   setError(getErrorMessage(loadError, t('developerApi:loadFailed'), t));
  } finally {
   if (epoch === sessionEpoch.current) setLoading(false);
  }
 }, [accessToken, user?.id, t]);

 useEffect(() => {
  sessionEpoch.current += 1;
  setCreatedApiKey(null);
  setCreatedKeyId(null);
  setCreatedKeyScopes(undefined);
  setKeys([]);
  setLimits(null);
  setConnectedApps([]);
  setOauthAvailable(false);
  setCopied(false);
  setSubmitting(false);
  setConfirmRevokeId(null);
  setRevokingId(null);
  setConfirmRevokeClientId(null);
  setRevokingClientId(null);
  setUpdatingScopeClientId(null);
  if (!isOpen) {
   return;
  }

  void loadKeys();
  return () => { sessionEpoch.current += 1; };
 }, [isOpen, accessToken, loadKeys]);

 useEffect(() => {
  if (!copied) return;
  const timer = window.setTimeout(() => setCopied(false), 1800);
  return () => window.clearTimeout(timer);
 }, [copied]);

 if (!isOpen) {
  return null;
 }

 const handleCreate = async () => {
  if (!accessToken) {
   onOpenAuth();
   return;
  }

  setSubmitting(true);
  setError(null);
  setCreatedApiKey(null);
  setCopied(false);
  const epoch = sessionEpoch.current;

  try {
   const result = await ApiKeyService.createApiKey(accessToken, newKeyName, keyAccess === 'read' ? ['read'] : ['read', 'write']);
   if (epoch !== sessionEpoch.current) return;
   setCreatedApiKey(result.apiKey);
   setCreatedKeyId(result.key.id);
   setCreatedKeyScopes(result.key.scopes);
   setNewKeyName(defaultKeyName);
   await loadKeys();
  } catch (createError) {
   if (epoch !== sessionEpoch.current) return;
   setError(getErrorMessage(createError, t('developerApi:createFailed'), t));
  } finally {
   if (epoch === sessionEpoch.current) setSubmitting(false);
  }
 };

 const handleRevoke = async (key: ApiKeyMetadata) => {
  if (!accessToken) {
   onOpenAuth();
   return;
  }

  setError(null);
  setRevokingId(key.id);
  const epoch = sessionEpoch.current;

  try {
   await ApiKeyService.revokeApiKey(accessToken, key.id);
   if (epoch !== sessionEpoch.current) return;
   setConfirmRevokeId(null);
   if (key.id === createdKeyId) {
    setCreatedApiKey(null);
    setCreatedKeyScopes(undefined);
   }
   await loadKeys();
  } catch (revokeError) {
   if (epoch !== sessionEpoch.current) return;
   setError(getErrorMessage(revokeError, t('developerApi:revokeFailed'), t));
  } finally {
   if (epoch === sessionEpoch.current) setRevokingId(null);
  }
 };

 const handleToggleOAuthScope = async (app: ConnectedOAuthApp, mode: 'read' | 'write') => {
  if (!user?.id) return;
  const nextScopes: ('read' | 'write')[] = mode === 'write' ? ['read', 'write'] : ['read'];
  setError(null);
  setUpdatingScopeClientId(app.clientId);
  const epoch = sessionEpoch.current;

  try {
   await OAuthGrantService.saveClientScopes({
    userId: user.id,
    clientId: app.clientId,
    clientName: app.clientName,
    scopes: nextScopes,
   });
   if (epoch !== sessionEpoch.current) return;
   setConnectedApps(prev =>
    prev.map(item => (item.clientId === app.clientId ? { ...item, scopes: nextScopes } : item))
   );
  } catch (scopeErr) {
   if (epoch !== sessionEpoch.current) return;
   setError(getErrorMessage(scopeErr, t('developerApi:oauthScopeUpdateFailed'), t));
  } finally {
   if (epoch === sessionEpoch.current) setUpdatingScopeClientId(null);
  }
 };

 const handleRevokeOAuthApp = async (app: ConnectedOAuthApp) => {
  if (!user?.id) return;
  setError(null);
  setRevokingClientId(app.clientId);
  const epoch = sessionEpoch.current;

  try {
   await OAuthGrantService.revokeConnectedApp(user.id, app.clientId);
   if (epoch !== sessionEpoch.current) return;
   setConfirmRevokeClientId(null);
   setConnectedApps(prev => prev.filter(item => item.clientId !== app.clientId));
  } catch (revokeErr) {
   if (epoch !== sessionEpoch.current) return;
   setError(getErrorMessage(revokeErr, t('developerApi:oauthRevokeFailed'), t));
  } finally {
   if (epoch === sessionEpoch.current) setRevokingClientId(null);
  }
 };

 const effectiveDisplayApiKey =
  createdApiKey && unlockedVaultKeyToken && e2eeApiMode === 'bridge'
   ? `${createdApiKey}.${unlockedVaultKeyToken}`
   : createdApiKey;

 const handleCopy = async () => {
  if (!effectiveDisplayApiKey) {
   return;
  }

  try {
   await navigator.clipboard.writeText(effectiveDisplayApiKey);
   setCopied(true);
  } catch {
   setError(t('developerApi:copyFailed'));
  }
 };

 const canCreateKey = Boolean(limits && keys.length < limits.activeKeys);

  const content = (
  <div className={isStandalone ? "flex flex-col h-full" : "settings-page"}>
    {isStandalone && (
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-[#1a1c1e]/95 backdrop-blur-xl rounded-t-3xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-emerald-600 dark:text-emerald-300"/>
          </div>
          <div>
            <h2 className="text-xl font-semibold app-theme-text-primary">{t('developerApi:title')}</h2>
            <p className="text-sm app-theme-text-muted">{t('developerApi:subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('app:cancel')}
          className="p-2 rounded-2xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5"/>
        </button>
      </div>
    )}

    {!isStandalone && (
      <div className="settings-page-heading">
        <h2 className="text-xl font-semibold app-theme-text-primary mb-1">
          {t('developerApi:title')}
        </h2>
        <p className="text-sm app-theme-text-muted">
          {t('developerApi:subtitle')}
        </p>
      </div>
    )}

    <div className={isStandalone ? "p-6 space-y-6" : "space-y-5"}>
     {!accessToken ? (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 p-4">
       <p className="text-sm text-amber-900 dark:text-amber-200 mb-3">{t('developerApi:loginRequired')}</p>
       <button
        type="button"
        onClick={onOpenAuth}
        className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
       >
        {t('developerApi:login')}
       </button>
      </div>
     ) : (
      <>
       {vault.status === 'unlocked' && unlockedVaultKeyToken && (
        <section className="settings-card space-y-4">
         <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
           <div className="settings-section-icon">
            <ShieldCheck size={18} strokeWidth={1.5} aria-hidden="true" />
           </div>
           <div>
            <h3 className="text-sm font-semibold app-theme-text-primary">{t('e2ee:apiE2eeTitle')}</h3>
            <p className="mt-1 text-xs app-theme-text-muted">{t('e2ee:apiE2eeDesc')}</p>
           </div>
          </div>
          <button
           type="button"
           onClick={async () => {
            try {
             await navigator.clipboard.writeText(unlockedVaultKeyToken);
             setCopiedVaultKey(true);
             window.setTimeout(() => setCopiedVaultKey(false), 2000);
            } catch {
             setError(t('developerApi:copyFailed'));
            }
           }}
           className="settings-button shrink-0"
          >
           {copiedVaultKey ? <Check size={15} strokeWidth={1.5} aria-hidden="true" /> : <Clipboard size={15} strokeWidth={1.5} aria-hidden="true" />}
           {copiedVaultKey ? t('developerApi:copied') : t('e2ee:copyVaultKeyEnv')}
          </button>
         </div>
         <div className="grid gap-2 sm:grid-cols-2">
          <label className="e2ee-choice" data-selected={e2eeApiMode === 'local' ? 'true' : 'false'}>
           <input
            type="radio"
            name="e2ee-api-mode"
            checked={e2eeApiMode === 'local'}
            onChange={() => setE2eeApiMode('local')}
            className="sr-only"
           />
           <div className="min-w-0 flex-1">
            <p className="e2ee-choice-title">{t('e2ee:apiE2eeLocalMode')}</p>
            <p className="e2ee-choice-desc">{t('e2ee:apiE2eeLocalDesc')}</p>
           </div>
           <Check size={16} strokeWidth={1.5} aria-hidden="true" className={e2eeApiMode === 'local' ? 'e2ee-choice-check' : 'e2ee-choice-check invisible'} />
          </label>
          <label className="e2ee-choice" data-selected={e2eeApiMode === 'bridge' ? 'true' : 'false'}>
           <input
            type="radio"
            name="e2ee-api-mode"
            checked={e2eeApiMode === 'bridge'}
            onChange={() => setE2eeApiMode('bridge')}
            className="sr-only"
           />
           <div className="min-w-0 flex-1">
            <p className="e2ee-choice-title">{t('e2ee:apiE2eeBridgeMode')}</p>
            <p className="e2ee-choice-desc">{t('e2ee:apiE2eeBridgeDesc')}</p>
           </div>
           <Check size={16} strokeWidth={1.5} aria-hidden="true" className={e2eeApiMode === 'bridge' ? 'e2ee-choice-check' : 'e2ee-choice-check invisible'} />
          </label>
         </div>
        </section>
       )}
       <AgentSetupCard
        key={createdKeyId && createdApiKey ? `${createdKeyId}-${e2eeApiMode}` : 'no-key'}
        apiKey={createdApiKey}
        vaultKeyToken={vault.status === 'unlocked' ? unlockedVaultKeyToken : null}
        e2eeApiMode={vault.status === 'unlocked' ? e2eeApiMode : undefined}
        scopes={createdKeyScopes}
        onVerified={() => void loadKeys()}
       />
       {limits && (
        <div className="grid sm:grid-cols-3 gap-3">
         <div className="settings-card p-4">
          <p className="text-xs uppercase tracking-[0.16em] app-theme-text-muted">{t('developerApi:plan')}</p>
          <p className="mt-2 text-lg font-semibold app-theme-text-primary">
           {limits.plan === 'premium' ? t('developerApi:premium') : t('developerApi:free')}
          </p>
         </div>
         <div className="settings-card p-4">
          <p className="text-xs uppercase tracking-[0.16em] app-theme-text-muted">{t('developerApi:activeKeys')}</p>
          <p className="mt-2 text-lg font-semibold app-theme-text-primary">{keys.length}/{limits.activeKeys}</p>
         </div>
         <div className="settings-card p-4">
          <p className="text-xs uppercase tracking-[0.16em] app-theme-text-muted">{t('developerApi:requests')}</p>
          <p className="mt-2 text-lg font-semibold app-theme-text-primary">{t('developerApi:requestsPerMinute', { count: limits.requestsPerMinute })}</p>
         </div>
        </div>
       )}

       {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
         {error}
        </div>
       )}

       {/* Connected OAuth 2.1 AI Apps section */}
       {(oauthAvailable || connectedApps.length > 0) && (
        <div className="space-y-3">
         <div>
          <h3 className="text-sm font-semibold app-theme-text-primary">{t('developerApi:oauthConnectedApps')}</h3>
          <p className="text-xs app-theme-text-muted mt-0.5">{t('developerApi:oauthConnectedAppsHint')}</p>
         </div>
         {connectedApps.length === 0 ? (
          <div className="settings-inset py-6 px-4 text-center">
           <PlugZap className="w-7 h-7 mx-auto text-gray-400 mb-2" aria-hidden="true" />
           <p className="text-sm app-theme-text-muted">{t('developerApi:oauthNoConnectedApps')}</p>
          </div>
         ) : (
          connectedApps.map(app => {
           const hasWrite = app.scopes.includes('write');
           const isUpdating = updatingScopeClientId === app.clientId;
           return (
            <div
             key={app.clientId}
             className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 settings-card"
            >
             <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
               <p className="font-medium app-theme-text-primary truncate">{app.clientName}</p>
               <select
                aria-label={t('developerApi:permissions')}
                value={hasWrite ? 'write' : 'read'}
                disabled={isUpdating || revokingClientId === app.clientId}
                onChange={event => void handleToggleOAuthScope(app, event.target.value as 'read' | 'write')}
                className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-xs app-theme-text-primary disabled:opacity-50"
               >
                <option value="write">{t('developerApi:readWrite')}</option>
                <option value="read">{t('developerApi:readOnly')}</option>
               </select>
               {isUpdating && (
                <span className="inline-flex items-center gap-1 text-xs app-theme-text-muted">
                 <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                 {t('developerApi:oauthUpdatingScope')}
                </span>
               )}
              </div>
              <p className="text-xs app-theme-text-muted mt-1">
               {t('developerApi:oauthGrantedAt', { date: formatDateTime(app.grantedAt, t('developerApi:never'), i18n.language) })}
               {' · '}
               {t('developerApi:lastUsedAt', { date: formatDateTime(app.lastUsedAt, t('developerApi:never'), i18n.language) })}
              </p>
             </div>
             {confirmRevokeClientId === app.clientId ? (
              <div className="flex flex-wrap items-center gap-2">
               <span className="text-xs text-red-600 dark:text-red-400">
                {t('developerApi:oauthRevokeConfirmShort')}
               </span>
               <button
                type="button"
                onClick={() => setConfirmRevokeClientId(null)}
                disabled={revokingClientId === app.clientId}
                className="px-3 py-1.5 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
               >
                {t('app:cancel')}
               </button>
               <button
                type="button"
                onClick={() => void handleRevokeOAuthApp(app)}
                disabled={revokingClientId === app.clientId}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
               >
                {revokingClientId === app.clientId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {revokingClientId === app.clientId ? t('developerApi:oauthRevoking') : t('developerApi:oauthConfirmRevoke')}
               </button>
              </div>
             ) : (
              <button
               type="button"
               onClick={() => setConfirmRevokeClientId(app.clientId)}
               disabled={Boolean(revokingClientId)}
               className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
               <Trash2 className="w-4 h-4"/>
               {t('developerApi:oauthRevoke')}
              </button>
             )}
            </div>
           );
          })
         )}
        </div>
       )}

       {createdApiKey && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10 p-4">
         <div className="flex items-start justify-between gap-3">
          <div>
           <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">{t('developerApi:keyCreated')}</p>
           <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">{t('developerApi:keyCreatedHint')}</p>
          </div>
          <button
           type="button"
           onClick={handleCopy}
           className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-gray-900/60 text-sm text-emerald-700 dark:text-emerald-200 hover:bg-white dark:hover:bg-gray-900 transition-colors"
          >
           {copied ? <Check className="w-4 h-4"/> : <Clipboard className="w-4 h-4"/>}
           {copied ? t('developerApi:copied') : t('developerApi:copy')}
          </button>
         </div>
         <code className="mt-3 block w-full overflow-x-auto rounded-xl bg-white dark:bg-gray-950 px-3 py-2 text-xs app-theme-text-primary">
          {effectiveDisplayApiKey}
         </code>
        </div>
       )}

       <div id="settings-api-key-create-card" className="settings-card">
        <label htmlFor="settings-api-key-name" className="block text-sm font-medium app-theme-text-primary mb-2">
         {t('developerApi:keyName')}
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
         <input
          id="settings-api-key-name"
          value={newKeyName}
          onChange={event => setNewKeyName(event.target.value)}
          maxLength={80}
          disabled={!canCreateKey || submitting}
          className="settings-input flex-1"
         />
         <button
          type="button"
          disabled={!canCreateKey || submitting}
          onClick={handleCreate}
          className="settings-button-primary"
         >
          {submitting ? t('developerApi:creating') : t('developerApi:createKey')}
         </button>
        </div>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2 mt-3 text-xs app-theme-text-muted" disabled={submitting}>
         <legend className="sr-only">{t('developerApi:permissions')}</legend>
         <label className="inline-flex items-center gap-1.5"><input type="radio" name="key-access" checked={keyAccess === 'write'} onChange={() => setKeyAccess('write')} className="accent-emerald-700" />{t('developerApi:readWrite')}</label>
         <label className="inline-flex items-center gap-1.5"><input type="radio" name="key-access" checked={keyAccess === 'read'} onChange={() => setKeyAccess('read')} className="accent-emerald-700" />{t('developerApi:readOnly')}</label>
        </fieldset>
        <p className="text-xs app-theme-text-muted mt-2">
         {t('developerApi:keysNeverExpireHint')}
        </p>
        {!canCreateKey && limits && (
         <p className="text-xs app-theme-text-muted mt-1">
          {t('developerApi:keyLimitReached', { count: limits.activeKeys })}
         </p>
        )}
       </div>

       <div className="space-y-3">
        <h3 className="text-sm font-semibold app-theme-text-primary">{t('developerApi:keys')}</h3>
        {loading ? (
         <div className="py-8 text-center text-sm app-theme-text-muted">{t('developerApi:loading')}</div>
        ) : keys.length === 0 ? (
         <div className="settings-inset py-8 text-center">
          <KeyRound className="w-8 h-8 mx-auto text-gray-400 mb-2"/>
          <p className="text-sm app-theme-text-muted">{t('developerApi:noKeys')}</p>
         </div>
        ) : (
         keys.map(key => (
          <div
           key={key.id}
           className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 settings-card"
          >
           <div>
            <div className="flex flex-wrap items-center gap-2">
             <p className="font-medium app-theme-text-primary">{key.name}</p>
             <code className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
             {key.keyPrefix}...
             </code>
             <span className="text-xs app-theme-text-muted">{t(key.scopes.includes('write') ? 'developerApi:readWrite' : 'developerApi:readOnly')}</span>
            </div>
            <p className="text-xs app-theme-text-muted mt-1">
             {t('developerApi:createdAt', { date: formatDateTime(key.createdAt, t('developerApi:never'), i18n.language) })}
             {' · '}
             {t('developerApi:lastUsedAt', { date: formatDateTime(key.lastUsedAt, t('developerApi:never'), i18n.language) })}
            </p>
           </div>
           {confirmRevokeId === key.id ? (
            <div className="flex flex-wrap items-center gap-2">
             <span className="text-xs text-red-600 dark:text-red-400">
              {t('developerApi:revokeConfirmShort')}
             </span>
             <button
              type="button"
              onClick={() => setConfirmRevokeId(null)}
              disabled={revokingId === key.id}
              className="px-3 py-1.5 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
             >
              {t('app:cancel')}
             </button>
             <button
              type="button"
              onClick={() => void handleRevoke(key)}
              disabled={revokingId === key.id}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
             >
              {revokingId === key.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {revokingId === key.id ? t('developerApi:revoking') : t('developerApi:confirmRevoke')}
             </button>
            </div>
           ) : (
            <button
             type="button"
             onClick={() => setConfirmRevokeId(key.id)}
             disabled={Boolean(revokingId)}
             className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
             <Trash2 className="w-4 h-4"/>
             {t('developerApi:revoke')}
            </button>
           )}
          </div>
         ))
        )}
       </div>
      </>
     )}
    </div>
  </div>
  );

  if (!isStandalone) return content;

  return (
    <div className="fixed inset-0 mobile-modal-viewport bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-3xl max-h-[calc(var(--app-viewport-height,100dvh)*0.9)] overflow-y-auto rounded-3xl border border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-[#1a1c1e]/95 shadow-apple-xl">
        {content}
      </div>
    </div>
  );
}
