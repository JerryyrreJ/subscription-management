import { useCallback, useEffect, useState } from 'react';
import { Check, Clipboard, Code2, KeyRound, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
 ApiKeyLimits,
 ApiKeyMetadata,
 ApiKeyService,
 ApiKeyServiceError,
} from '../services/apiKeyService';

interface DeveloperApiModalProps {
 isOpen: boolean;
 accessToken?: string;
 onClose: () => void;
 onOpenAuth: () => void;
}

const formatDateTime = (value: string | null, emptyLabel: string): string => {
 if (!value) {
  return emptyLabel;
 }

 return new Intl.DateTimeFormat(undefined, {
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
}: DeveloperApiModalProps) {
 const { t } = useTranslation(['developerApi']);
 const defaultKeyName = t('developerApi:defaultKeyName');
 const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
 const [limits, setLimits] = useState<ApiKeyLimits | null>(null);
 const [newKeyName, setNewKeyName] = useState(defaultKeyName);
 const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
 const [copied, setCopied] = useState(false);
 const [loading, setLoading] = useState(false);
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const loadKeys = useCallback(async () => {
  if (!accessToken) {
   return;
  }

  setLoading(true);
  setError(null);

  try {
   const result = await ApiKeyService.listApiKeys(accessToken);
   setKeys(result.keys);
   setLimits(result.limits);
  } catch (loadError) {
   setError(getErrorMessage(loadError, t('developerApi:loadFailed'), t));
  } finally {
   setLoading(false);
  }
 }, [accessToken, t]);

 useEffect(() => {
  if (!isOpen) {
   return;
  }

  setCreatedApiKey(null);
  setCopied(false);
  void loadKeys();
 }, [isOpen, accessToken, loadKeys]);

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

  try {
   const result = await ApiKeyService.createApiKey(accessToken, newKeyName);
   setCreatedApiKey(result.apiKey);
   setNewKeyName(defaultKeyName);
   await loadKeys();
  } catch (createError) {
   setError(getErrorMessage(createError, t('developerApi:createFailed'), t));
  } finally {
   setSubmitting(false);
  }
 };

 const handleRevoke = async (key: ApiKeyMetadata) => {
  if (!accessToken) {
   onOpenAuth();
   return;
  }

  if (!window.confirm(t('developerApi:revokeConfirm', { name: key.name }))) {
   return;
  }

  setError(null);

  try {
   await ApiKeyService.revokeApiKey(accessToken, key.id);
   await loadKeys();
  } catch (revokeError) {
   setError(getErrorMessage(revokeError, t('developerApi:revokeFailed'), t));
  }
 };

 const handleCopy = async () => {
  if (!createdApiKey) {
   return;
  }

  await navigator.clipboard.writeText(createdApiKey);
  setCopied(true);
  window.setTimeout(() => setCopied(false), 1800);
 };

 const canCreateKey = Boolean(limits && keys.length < limits.activeKeys);

 return (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
   <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-[#1a1c1e]/95 shadow-apple-xl">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-[#1a1c1e]/95 backdrop-blur-xl rounded-t-3xl">
     <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
       <Code2 className="w-5 h-5 text-emerald-600 dark:text-emerald-300"/>
      </div>
      <div>
       <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('developerApi:title')}</h2>
       <p className="text-sm text-gray-500 dark:text-gray-400">{t('developerApi:subtitle')}</p>
      </div>
     </div>
     <button
      type="button"
      onClick={onClose}
      className="p-2 rounded-2xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
     >
      <X className="w-5 h-5"/>
     </button>
    </div>

    <div className="p-6 space-y-6">
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
       {limits && (
        <div className="grid sm:grid-cols-3 gap-3">
         <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{t('developerApi:plan')}</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
           {limits.plan === 'premium' ? t('developerApi:premium') : t('developerApi:free')}
          </p>
         </div>
         <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{t('developerApi:activeKeys')}</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{keys.length}/{limits.activeKeys}</p>
         </div>
         <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{t('developerApi:requests')}</p>
          <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{limits.requestsPerHour}/h</p>
         </div>
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
         <code className="mt-3 block w-full overflow-x-auto rounded-xl bg-white dark:bg-gray-950 px-3 py-2 text-xs text-gray-800 dark:text-gray-200">
          {createdApiKey}
         </code>
        </div>
       )}

       <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
        <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
         {t('developerApi:keyName')}
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
         <input
          value={newKeyName}
          onChange={event => setNewKeyName(event.target.value)}
          maxLength={80}
          disabled={!canCreateKey || submitting}
          className="flex-1 px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
         />
         <button
          type="button"
          disabled={!canCreateKey || submitting}
          onClick={handleCreate}
          className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
         >
          {submitting ? t('developerApi:creating') : t('developerApi:createKey')}
         </button>
        </div>
        {!canCreateKey && limits && (
         <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {t('developerApi:keyLimitReached', { count: limits.activeKeys })}
         </p>
        )}
       </div>

       {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
         {error}
        </div>
       )}

       <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('developerApi:keys')}</h3>
        {loading ? (
         <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t('developerApi:loading')}</div>
        ) : keys.length === 0 ? (
         <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 py-8 text-center">
          <KeyRound className="w-8 h-8 mx-auto text-gray-400 mb-2"/>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('developerApi:noKeys')}</p>
         </div>
        ) : (
         keys.map(key => (
          <div
           key={key.id}
           className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 p-4"
          >
           <div>
            <div className="flex items-center gap-2">
             <p className="font-medium text-gray-900 dark:text-white">{key.name}</p>
             <code className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300">
              {key.keyPrefix}...
             </code>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
             {t('developerApi:createdAt', { date: formatDateTime(key.createdAt, t('developerApi:never')) })}
             {' · '}
             {t('developerApi:lastUsedAt', { date: formatDateTime(key.lastUsedAt, t('developerApi:never')) })}
            </p>
           </div>
           <button
            type="button"
            onClick={() => void handleRevoke(key)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
           >
            <Trash2 className="w-4 h-4"/>
            {t('developerApi:revoke')}
           </button>
          </div>
         ))
        )}
       </div>
      </>
     )}
    </div>
   </div>
  </div>
 );
}
