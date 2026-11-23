import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Bell, Send, BookOpen, ExternalLink, LogIn, Check, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReminderSettings } from '../types';
import { testBarkPush, validateBarkConfig } from '../utils/barkPush';
import { parseBarkUrl, updateBarkPushFromUrl } from '../utils/barkConfig';
import { CustomSelect } from './CustomSelect';
import { useAuth } from '../contexts/AuthContext';
import { useAppLanguage } from '../hooks/useAppLanguage';
import { getDocumentationUrl } from '../lib/site';

interface NotificationSettingsModalProps {
 isOpen: boolean;
 onClose: () => void;
 settings: ReminderSettings;
 onSave: (settings: ReminderSettings) => void | Promise<void | { cloudSynced: boolean }>;
 onOpenAuth?: () => void;
 isStandalone?: boolean;
}

export function NotificationSettingsModal({
 isOpen,
 onClose,
 settings,
 onSave,
 onOpenAuth,
 isStandalone = true
}: NotificationSettingsModalProps) {
 useModalScrollLock(isOpen && isStandalone);
 const { t } = useTranslation(['notificationSettings', 'settingsHub']);
 const { language } = useAppLanguage();
 const { user } = useAuth();
 const requiresLogin = !user;
 const [localSettings, setLocalSettings] = useState<ReminderSettings>(settings);
 const [isTesting, setIsTesting] = useState(false);
 const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
 const [barkUrl, setBarkUrl] = useState('');
 const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'localOnly'>('idle');
 const saveResetTimerRef = useRef<number | null>(null);

 const reminderGuideUrl = getDocumentationUrl('user-guide/reminders', language);
 const parsedBarkUrl = useMemo(
  () => (barkUrl.trim() ? parseBarkUrl(barkUrl) : null),
  [barkUrl]
 );

 const clearSaveTimer = () => {
  if (saveResetTimerRef.current !== null) {
   window.clearTimeout(saveResetTimerRef.current);
   saveResetTimerRef.current = null;
  }
 };

 useEffect(() => () => clearSaveTimer(), []);

 // Handle Bark URL input change
 const handleBarkUrlChange = (url: string) => {
  setBarkUrl(url);
  setSaveStatus('idle');
  clearSaveTimer();

  setLocalSettings(prev => ({
   ...prev,
   barkPush: updateBarkPushFromUrl(prev.barkPush, url)
  }));

  if (testResult) {
   setTestResult(null);
  }
 };

 useEffect(() => {
  setLocalSettings(settings);
  if (settings.barkPush.serverUrl && settings.barkPush.deviceKey) {
   setBarkUrl(`${settings.barkPush.serverUrl}/${settings.barkPush.deviceKey}`);
  } else {
   setBarkUrl('');
  }
 }, [settings]);

 const handleSave = async () => {
  // If user is not logged in, redirect to login
  if (requiresLogin) {
   onClose();
   if (onOpenAuth) {
    onOpenAuth();
   }
   return;
  }

  if (localSettings.barkPush.enabled) {
   const validation = validateBarkConfig(
    localSettings.barkPush.serverUrl,
    localSettings.barkPush.deviceKey
   );

   if (!validation.valid) {
    setTestResult({ success: false, message: validation.error || t('notificationSettings:invalidBarkConfig') });
    return;
   }
  }

  clearSaveTimer();
  setSaveStatus('saving');
  setTestResult(null);

  try {
   const result = await onSave(localSettings);
   if (result && result.cloudSynced === false) {
    setSaveStatus('localOnly');
    return;
   }

   setSaveStatus('saved');
   if (isStandalone) {
    onClose();
   } else {
    saveResetTimerRef.current = window.setTimeout(() => {
     setSaveStatus('idle');
     saveResetTimerRef.current = null;
    }, 2500);
   }
  } catch {
   setSaveStatus('localOnly');
  }
 };

 const handleTestBark = async () => {
 if (requiresLogin) {
 setTestResult({
 success: false,
 message: t('notificationSettings:loginRequiredToTest')
 });
 return;
 }

 const validation = validateBarkConfig(
 localSettings.barkPush.serverUrl,
 localSettings.barkPush.deviceKey
 );

 if (!validation.valid) {
 setTestResult({ success: false, message: validation.error || t('notificationSettings:invalidConfig') });
 return;
 }

 setIsTesting(true);
 setTestResult(null);

 try {
 const success = await testBarkPush(
 localSettings.barkPush.serverUrl,
 localSettings.barkPush.deviceKey,
 language
 );

 if (success) {
 setTestResult({ success: true, message: t('notificationSettings:testPushSuccess') });
 } else {
 setTestResult({ success: false, message: t('notificationSettings:testPushFailed') });
 }
 } catch {
 setTestResult({ success: false, message: t('notificationSettings:testPushError') });
 } finally {
 setIsTesting(false);
 }
 };

 const daysOptions = [
 { value: '1', label: t('notificationSettings:remindDaysOne') },
 { value: '3', label: t('notificationSettings:remindDaysOther', { count: 3 }) },
 { value: '7', label: t('notificationSettings:remindDaysOther', { count: 7 }) },
 { value: '14', label: t('notificationSettings:remindDaysOther', { count: 14 }) }
 ];

 if (!isOpen) return null;

  const content = (
  <div className={isStandalone ? "flex min-h-full flex-col" : "settings-page"}>
  {isStandalone && (
  <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-[#1a1c1e] z-10">
  <div className="flex items-center gap-3">
  <div className="w-10 h-10 rounded-full bg-[#e5e7eb] dark:bg-[#2a2d31] dark:bg-zinc-800/50 flex items-center justify-center">
  <Bell className="w-5 h-5 text-emerald-700 dark:text-emerald-400 dark:text-zinc-600 dark:text-zinc-400"/>
  </div>
  <h2 className="text-xl font-semibold app-theme-text-primary">
  {t('notificationSettings:title')}
  </h2>
  </div>
  <button
  type="button"
  onClick={onClose}
  aria-label={t('notificationSettings:cancel')}
  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
  >
  <X className="w-6 h-6"/>
  </button>
  </div>
  )}

  {!isStandalone && (
    <div className="settings-page-heading">
      <h2 className="text-xl font-semibold app-theme-text-primary mb-1">
        {t('notificationSettings:title')}
      </h2>
      <p className="text-sm app-theme-text-muted">
        {t('settingsHub:notificationSubtitle')}
      </p>
    </div>
  )}

 {/* Content */}
 <div className={isStandalone ? "p-6 space-y-6" : "space-y-5"}>
 {/* 未登录引导 */}
 {!user && (
 <div className="settings-inset flex overflow-hidden">
 <div className="w-0.5 shrink-0 bg-emerald-500 dark:bg-emerald-400" aria-hidden="true" />
 <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
 <div className="min-w-0">
 <p className="text-sm leading-relaxed app-theme-text-secondary">
 {t('notificationSettings:loginGuide')}
 </p>
 <p className="mt-1 text-xs leading-relaxed app-theme-text-muted">
 {t('notificationSettings:loginGuideHint')}
 </p>
 </div>
 {onOpenAuth && (
 <button
 onClick={() => {
 onClose();
 onOpenAuth();
 }}
 className="settings-button-primary shrink-0"
 >
 <LogIn className="w-4 h-4"/>
 {t('notificationSettings:loginToEnable')}
 </button>
 )}
 </div>
 </div>
 )}

 {/* 全局提示 */}
 <div className="settings-card">
 <p className="text-sm leading-relaxed app-theme-text-secondary">
 <strong>{t('notificationSettings:noteTitle')}</strong> {t('notificationSettings:noteBody')}
 </p>
 </div>

 {/* Bark Push */}
 <div>
 <h3 className="text-sm font-semibold app-theme-text-primary mb-2">
 {t('notificationSettings:barkSectionTitle')}
 </h3>
 <p className="text-sm app-theme-text-muted mb-4">
 {t('notificationSettings:barkSectionDescription')}
 </p>

 {/* Documentation link */}
 <a
 href={reminderGuideUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="settings-card settings-guide-link mb-4 flex items-center gap-3"
 >
 <span className="settings-section-icon">
 <BookOpen className="h-[18px] w-[18px]" />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block text-sm font-medium app-theme-text-primary">
 {t('notificationSettings:setupGuide')}
 </span>
 <span className="mt-0.5 block text-xs leading-relaxed app-theme-text-muted">
 {t('notificationSettings:setupGuideDescription')}
 </span>
 </span>
 <ExternalLink className="h-4 w-4 shrink-0 app-theme-text-muted" />
 </a>

 <div className="settings-inset p-4 space-y-4">
 <label className={`flex items-center gap-3 ${requiresLogin ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
 <input
 type="checkbox"
 checked={localSettings.barkPush.enabled}
 disabled={requiresLogin}
 onChange={(e) => {
  setSaveStatus('idle');
  clearSaveTimer();
  setLocalSettings({
   ...localSettings,
   barkPush: {
    ...localSettings.barkPush,
    enabled: e.target.checked
   }
  });
 }}
 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 border-gray-300 rounded-lg focus:ring-emerald-500"
 />
 <span className="text-sm app-theme-text-secondary">
 {t('notificationSettings:enableBark')}
 </span>
 </label>

 {localSettings.barkPush.enabled && (
 <div className="space-y-3 ml-7">
 <div>
 <label className="block text-sm font-medium app-theme-text-secondary mb-1">
 {t('notificationSettings:barkUrlLabel')}
 </label>
 <input
 type="text"
 value={barkUrl}
 disabled={requiresLogin}
 onChange={(e) => handleBarkUrlChange(e.target.value)}
 placeholder={t('notificationSettings:barkUrlPlaceholder')}
 className="settings-input font-mono disabled:opacity-60"
 />
 <p className="mt-1 text-xs app-theme-text-muted">
 📋 {t('notificationSettings:barkUrlHint')}
 </p>
 {parsedBarkUrl?.valid && (
 <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-xs">
 <p className="text-green-800 dark:text-green-200">
 ✓ {t('notificationSettings:barkUrlValid', {
  serverUrl: parsedBarkUrl.serverUrl,
  deviceKey: parsedBarkUrl.deviceKey,
 })}
 </p>
 </div>
 )}
 {parsedBarkUrl && !parsedBarkUrl.valid && (
 <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs">
 <p className="text-amber-800 dark:text-amber-200">
  {t('notificationSettings:barkUrlInvalidHint')}
 </p>
 </div>
 )}
 </div>

 <div className="flex flex-wrap items-center gap-2">
 <span className="text-sm app-theme-text-secondary">{t('notificationSettings:remindMe')}</span>
 <div className="w-48">
  <CustomSelect
  value={localSettings.barkPush.daysBefore.toString()}
  disabled={requiresLogin}
  onChange={(value) => {
   setSaveStatus('idle');
   clearSaveTimer();
   setLocalSettings({
    ...localSettings,
    barkPush: {
     ...localSettings.barkPush,
     daysBefore: parseInt(value)
    }
   });
  }}
  options={daysOptions}
  />
 </div>
 </div>

 {/* Test Button */}
 <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
 <button
 onClick={handleTestBark}
 disabled={requiresLogin || isTesting || !localSettings.barkPush.serverUrl || !localSettings.barkPush.deviceKey}
 className="settings-button-primary"
 >
 <Send className="w-4 h-4"/>
 {isTesting ? t('notificationSettings:sending') : t('notificationSettings:testPush')}
 </button>

 {requiresLogin && (
 <p className="mt-3 text-sm app-theme-text-muted">
  {t('notificationSettings:signInFirstHint')}
 </p>
 )}

 {testResult && (
 <div className={`mt-3 p-3 rounded-2xl ${
 testResult.success
 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
 : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
 }`}>
 <p className={`text-sm ${
 testResult.success
 ? 'text-green-800 dark:text-green-200'
 : 'text-red-800 dark:text-red-200'
 }`}>
 {testResult.message}
 </p>
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 </div>
 {saveStatus === 'localOnly' && (
  <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
   <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
   <span>{t('notificationSettings:saveCloudFailed')}</span>
  </div>
 )}
 </div>

  <div className={isStandalone
  ? 'sticky bottom-0 z-10 flex items-center gap-3 border-t border-gray-200 dark:border-white/10 mt-auto bg-white p-6 dark:bg-[#1a1c1e]'
  : 'settings-panel-footer items-center'
  }>
  {isStandalone && (
  <button
  type="button"
  onClick={onClose}
  disabled={saveStatus === 'saving'}
  className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 app-theme-text-secondary rounded-2xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
  >
  {t('notificationSettings:cancel')}
  </button>
  )}
  {!isStandalone && saveStatus === 'saved' && (
   <span role="status" className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 mr-auto">
    <Check className="w-4 h-4" />
    {t('notificationSettings:settingsSaved')}
   </span>
  )}
  <button
  type="button"
  onClick={() => void handleSave()}
  disabled={saveStatus === 'saving'}
  className="settings-button-primary ml-auto"
  >
  {user ? (
   saveStatus === 'saving' ? (
    <>
     <Loader2 className="w-4 h-4 animate-spin" />
     {t('notificationSettings:savingSettings')}
    </>
   ) : saveStatus === 'saved' ? (
    <>
     <Check className="w-4 h-4" />
     {t('settingsHub:saved')}
    </>
   ) : (
    t('notificationSettings:saveSettings')
   )
  ) : (
  <span className="flex items-center justify-center gap-2">
  <LogIn className="w-4 h-4"/>
  {t('notificationSettings:loginToConfigure')}
  </span>
  )}
  </button>
  </div>
  </div>
  );

  if (!isStandalone) return content;

  return (
    <div className="fixed inset-0 mobile-modal-viewport bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-lg max-w-2xl w-full max-h-[calc(var(--app-viewport-height,100dvh)*0.9)] overflow-y-auto animate-scale-in">
        {content}
      </div>
    </div>
  );
}
