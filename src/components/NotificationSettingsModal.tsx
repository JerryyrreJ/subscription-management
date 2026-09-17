import { useState, useEffect } from 'react';
import { X, Bell, Send, BookOpen, ExternalLink, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReminderSettings } from '../types';
import { testBarkPush, validateBarkConfig } from '../utils/barkPush';
import { parseBarkUrl, updateBarkPushFromUrl } from '../utils/barkConfig';
import { CustomSelect } from './CustomSelect';
import { useAuth } from '../contexts/AuthContext';
import { useAppLanguage } from '../hooks/useAppLanguage';

interface NotificationSettingsModalProps {
 isOpen: boolean;
 onClose: () => void;
 settings: ReminderSettings;
 onSave: (settings: ReminderSettings) => void;
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
  const { t } = useTranslation(['notificationSettings', 'settingsHub']);
 const { language } = useAppLanguage();
 const { user } = useAuth();
 const requiresLogin = !user;
 const [localSettings, setLocalSettings] = useState<ReminderSettings>(settings);
 const [isTesting, setIsTesting] = useState(false);
 const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
 const [barkUrl, setBarkUrl] = useState('');

 const reminderGuideUrl = language === 'zh-CN'
  ? 'https://docs.sub.jerrylu.xyz/zh-CN/user-guide/reminders'
  : 'https://docs.sub.jerrylu.xyz/en/user-guide/reminders';

 // Handle Bark URL input change
 const handleBarkUrlChange = (url: string) => {
 setBarkUrl(url);

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
 // Initialize Bark URL if server and device key exist
 if (settings.barkPush.serverUrl && settings.barkPush.deviceKey) {
 setBarkUrl(`${settings.barkPush.serverUrl}/${settings.barkPush.deviceKey}`);
 }
 }, [settings]);

 const handleSave = () => {
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

 onSave(localSettings);
 onClose();
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
  <div className="flex min-h-full flex-col">
  {isStandalone && (
  <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-[#1a1c1e] z-10">
  <div className="flex items-center gap-3">
  <div className="w-10 h-10 rounded-full bg-[#e5e7eb] dark:bg-[#2a2d31] dark:bg-zinc-800/50 flex items-center justify-center">
  <Bell className="w-5 h-5 text-emerald-700 dark:text-emerald-400 dark:text-zinc-600 dark:text-zinc-400"/>
  </div>
  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
  {t('notificationSettings:title')}
  </h2>
  </div>
  <button
  onClick={onClose}
  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
  >
  <X className="w-6 h-6"/>
  </button>
  </div>
  )}

  {!isStandalone && (
    <div className="px-6 pt-2 pb-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
        {t('notificationSettings:title')}
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t('settingsHub:notificationSubtitle')}
      </p>
    </div>
  )}

 {/* Content */}
 <div className="p-6 space-y-6">
 {/* 未登录引导 */}
 {!user && (
 <div className="flex overflow-hidden rounded-2xl border border-zinc-200 bg-[#f4f5f7] dark:border-zinc-700 dark:bg-[#202225]">
 <div className="w-0.5 shrink-0 bg-emerald-500 dark:bg-emerald-400" aria-hidden="true" />
 <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
 <div className="min-w-0">
 <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
 {t('notificationSettings:loginGuide')}
 </p>
 <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
 {t('notificationSettings:loginGuideHint')}
 </p>
 </div>
 {onOpenAuth && (
 <button
 onClick={() => {
 onClose();
 onOpenAuth();
 }}
 className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
 >
 <LogIn className="w-4 h-4"/>
 {t('notificationSettings:loginToEnable')}
 </button>
 )}
 </div>
 </div>
 )}

 {/* 全局提示 */}
 <div className="bg-[#f4f5f7] dark:bg-[#202225] dark:bg-zinc-800/20 border border-zinc-200 dark:border-zinc-800 dark:border-zinc-700 dark:border-zinc-700 rounded-2xl p-4">
 <p className="text-sm text-emerald-600 dark:text-emerald-300">
 <strong>{t('notificationSettings:noteTitle')}</strong> {t('notificationSettings:noteBody')}
 </p>
 </div>

 {/* Bark Push */}
 <div>
 <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
 {t('notificationSettings:barkSectionTitle')}
 </h3>
 <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
 {t('notificationSettings:barkSectionDescription')}
 </p>

 {/* Documentation link */}
 <a
 href={reminderGuideUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="group mb-4 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/70 px-4 py-3.5 transition-all hover:border-emerald-300 hover:bg-emerald-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/[0.07]"
 >
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
 <BookOpen className="h-[18px] w-[18px]" />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
 {t('notificationSettings:setupGuide')}
 </span>
 <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
 {t('notificationSettings:setupGuideDescription')}
 </span>
 </span>
 <ExternalLink className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
 </a>

 <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4 space-y-4">
 <label className={`flex items-center gap-3 ${requiresLogin ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
 <input
 type="checkbox"
 checked={localSettings.barkPush.enabled}
 disabled={requiresLogin}
 onChange={(e) => setLocalSettings({
 ...localSettings,
 barkPush: {
 ...localSettings.barkPush,
 enabled: e.target.checked
 }
 })}
 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 border-gray-300 rounded-lg focus:ring-emerald-500"
 />
 <span className="text-sm text-gray-700 dark:text-gray-300">
 {t('notificationSettings:enableBark')}
 </span>
 </label>

 {localSettings.barkPush.enabled && (
 <div className="space-y-3 ml-7">
 <div>
 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
 {t('notificationSettings:barkUrlLabel')}
 </label>
 <input
 type="text"
 value={barkUrl}
 disabled={requiresLogin}
 onChange={(e) => handleBarkUrlChange(e.target.value)}
 placeholder={t('notificationSettings:barkUrlPlaceholder')}
 className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
 />
 <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
 📋 {t('notificationSettings:barkUrlHint')}
 </p>
 {barkUrl && parseBarkUrl(barkUrl).valid && (
 <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-xs">
 <p className="text-green-800 dark:text-green-200">
 ✓ {t('notificationSettings:barkUrlValid', {
  serverUrl: parseBarkUrl(barkUrl).serverUrl,
  deviceKey: parseBarkUrl(barkUrl).deviceKey,
 })}
 </p>
 </div>
 )}
 </div>

 <div className="flex items-center gap-2">
 <span className="text-sm text-gray-700 dark:text-gray-300">{t('notificationSettings:remindMe')}</span>
 <div className="w-48">
  <CustomSelect
  value={localSettings.barkPush.daysBefore.toString()}
  disabled={requiresLogin}
  onChange={(value) => setLocalSettings({
  ...localSettings,
  barkPush: {
 ...localSettings.barkPush,
 daysBefore: parseInt(value)
 }
 })}
 options={daysOptions}
 />
 </div>
 </div>

 {/* Test Button */}
 <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
 <button
 onClick={handleTestBark}
 disabled={requiresLogin || isTesting || !localSettings.barkPush.serverUrl || !localSettings.barkPush.deviceKey}
 className="flex items-center gap-2 px-4 py-2 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:bg-gray-400 text-white rounded-2xl transition-colors disabled:cursor-not-allowed"
 >
 <Send className="w-4 h-4"/>
 {isTesting ? t('notificationSettings:sending') : t('notificationSettings:testPush')}
 </button>

 {requiresLogin && (
 <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
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
 </div>

  <div className={`flex gap-3 border-t border-gray-200 dark:border-white/10 mt-auto ${
  isStandalone
  ? 'sticky bottom-0 z-10 bg-white p-6 dark:bg-[#1a1c1e]'
  : 'mx-6 mt-8 bg-transparent px-0 pb-2 pt-6'
  }`}>
  {isStandalone && (
  <button
  onClick={onClose}
  className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
  >
  {t('notificationSettings:cancel')}
  </button>
  )}
  <button
  onClick={handleSave}
  className="flex-1 px-4 py-2.5 rounded-2xl font-medium transition-colors bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 text-white"
  >
  {user ? (
  t('notificationSettings:saveSettings')
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-apple-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        {content}
      </div>
    </div>
  );
}
