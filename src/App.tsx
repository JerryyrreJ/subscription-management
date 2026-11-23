import { useState, useEffect, useRef, lazy, Suspense, useCallback, useMemo } from 'react';
import { Plus, BarChart3, RotateCcw, Sparkles, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
 Subscription,
 ViewMode,
 Theme,
 SortConfig,
 ReminderSettings,
 Currency,
 ExchangeRates,
 ExchangeRateSource,
 ExchangeRateLoadResult
} from './types';
// Core subscription flows load with the home page so opening them never waits on a chunk.
import { AddSubscriptionModal } from './components/AddSubscriptionModal';
import { AiCaptureModal } from './components/AiCaptureModal';
import { SubscriptionDetailsModal } from './components/SubscriptionDetailsModal';
import { EditSubscriptionModal } from './components/EditSubscriptionModal';
import { Dashboard } from './components/Dashboard';
import { SubscriptionCard } from './components/SubscriptionCard';
import { AppToast, type AppToastMessage, type AppToastVariant } from './components/AppToast';
import './styles/settings.css';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { ThemeToggle } from './components/ThemeToggle';
import { UserMenu } from './components/UserMenu';
import type { SettingsTab } from './components/SettingsHubModal';
import type { UndoableAiAction } from './components/AiCaptureModal';
import { useAuth } from './contexts/AuthContext';
import { useSubscriptionSync } from './hooks/useSubscriptionSync';
import { useInitialAccountSync } from './hooks/useInitialAccountSync';
import { useCategorySync } from './hooks/useCategorySync';
import { loadSubscriptions } from './utils/storage';
import { getCategoryDisplayName, getVisibleCategories, loadCategories } from './utils/categories';
import { CategoryService } from './services/categoryService';
import {
 getStoredExchangeRatesSnapshot,
 refreshExchangeRatesWithStatus
} from './utils/currency';
import {
 loadBaseCurrency,
 saveBaseCurrency,
 loadViewMode,
 saveViewMode,
 loadSortConfig,
 saveSortConfig,
} from './utils/dashboardPreferences';
import {
 buildCategoryImportPlan,
 buildSubscriptionImportPlan,
 exportData,
 ImportDataError,
 validateImportData,
 ExportData
} from './utils/exportImport';
import { loadNotificationSettings, saveNotificationSettings } from './utils/notificationChecker';
import { NotificationSettingsService } from './services/notificationSettingsService';
import { Footer } from './components/Footer';
import { LegacyDomainNotice } from './components/LegacyDomainNotice';
import { config } from './lib/config';
import { sortSubscriptions } from './utils/subscriptionSorting';
import { isTrialSubscription } from './utils/subscriptionReminder';
import {
 buildConvertedPaidSubscription,
 isExpiredTrial,
 resolveSubscriptionRenewal,
} from './utils/subscriptionRenewal';
import { GUEST_DATA_SCOPE, getUserDataScope, setActiveDataScope } from './utils/dataScope';
import { createScopedTaskGate } from './utils/scopedTaskGate';
import { normalizeLocale } from './utils/locale';
import { isBarkReady } from './utils/barkSettings';
import { getCurrentTimeZone } from './utils/dates';
import {
 claimLocalDataOwnership,
 isOwnedGuestDataForUser,
 migrateOwnedGuestDataToUserScope,
 migrateUnownedGuestDataToUserScope,
 refreshLocalDataOwnership,
 clearDeletedUserLocalData
} from './utils/localDataOwnership';

const AdvancedReport = lazy(() =>
 import('./components/AdvancedReport').then(module => ({ default: module.AdvancedReport }))
);
const AuthModal = lazy(() =>
 import('./components/AuthModal').then(module => ({ default: module.AuthModal }))
);
const PasswordRecoveryModal = lazy(() =>
 import('./components/PasswordRecoveryModal').then(module => ({ default: module.PasswordRecoveryModal }))
);
const SettingsHubModal = lazy(() =>
 import('./components/SettingsHubModal').then(module => ({ default: module.SettingsHubModal }))
);
const ImportDataModal = lazy(() =>
 import('./components/ImportDataModal').then(module => ({ default: module.ImportDataModal }))
);
const PricingModal = lazy(() =>
 import('./components/PricingModal').then(module => ({ default: module.PricingModal }))
);

const exchangeRateTaskGate = createScopedTaskGate<'exchange-rates'>();
const EXCHANGE_RATE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const UNDO_TIMEOUT_MS = 5000;
const TOAST_TIMEOUT_MS = 4500;
type QuickFilter = 'all' | 'upcoming' | 'trials';

function LazyModalFallback({
 title,
 description,
 onClose,
}: {
 title: string;
 description: string;
 onClose: () => void;
}) {
 const { t } = useTranslation(['app']);

 return (
 <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4">
 <div className="w-full max-w-md rounded-3xl border border-gray-200/80 dark:border-gray-700/80 bg-white/95 dark:bg-[#1a1c1e]/95 shadow-apple-xl p-8 text-center">
 <div className="w-10 h-10 border-4 border-emerald-600 dark:border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
 <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h2>
 <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{description}</p>
 <button
 onClick={onClose}
 className="px-5 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-colors"
 >
 {t('app:cancel')}
 </button>
 </div>
 </div>
 );
}

export function App() {
 const { t, i18n } = useTranslation(['app', 'auth', 'importData', 'settingsHub', 'userMenu', 'aiCapture', 'categoryLabels']);
 const {
 user,
 userProfile,
 session,
 loading,
 passwordRecoveryPending,
 signOut,
 deleteAccount,
 updateUserNickname,
 updateUserEmail,
 updateUserPassword,
 completePasswordReset,
 dismissPasswordRecovery
 } = useAuth();
 const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
 const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());
 const [theme, setTheme] = useState<Theme>(() => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
 });
 const [sortConfig, setSortConfig] = useState<SortConfig>(() => loadSortConfig());
 const [isAddModalOpen, setIsAddModalOpen] = useState(false);
 const [isAiCaptureOpen, setIsAiCaptureOpen] = useState(false);
 const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
 const [isEditModalOpen, setIsEditModalOpen] = useState(false);
 const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
 const [authModalContext, setAuthModalContext] = useState<'ai-capture' | null>(null);
 const [isSettingsHubOpen, setIsSettingsHubOpen] = useState(false);
 const [settingsHubTab, setSettingsHubTab] = useState<SettingsTab>('general');
 const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState('');
 const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
 const [isImportModalOpen, setIsImportModalOpen] = useState(false);
 const [isImporting, setIsImporting] = useState(false);
 const [importPreviewData, setImportPreviewData] = useState<ExportData | null>(null);
 const fileInputRef = useRef<HTMLInputElement>(null);
 const [notificationSettings, setNotificationSettings] = useState<ReminderSettings>(loadNotificationSettings());
 const [isAdvancedReportOpen, setIsAdvancedReportOpen] = useState(false);
 const canUseAdvancedReport = !config.features.cloudSync || Boolean(userProfile?.is_premium);
 const canOfferAiCapture = config.features.authentication && config.hasSupabaseConfig;

 const openAdvancedReport = () => {
  setIsAdvancedReportOpen(true);
 };

 const openAiCapture = () => {
  if (appUser && appSession?.access_token && config.hasSupabaseConfig) {
   setIsAiCaptureOpen(true);
   return;
  }
  if (canOfferAiCapture) {
   sessionStorage.setItem('ai-capture-return', '1');
   setAuthModalContext('ai-capture');
   setIsAuthModalOpen(true);
   return;
  }
  setIsAddModalOpen(true);
 };
 const [isPricingModalOpen, setIsPricingModalOpen] = useState(() => window.location.pathname === "/pricing" || (new URLSearchParams(window.location.search).has("payment") || new URLSearchParams(window.location.search).get("pricing") === "1"));
 const [baseCurrency, setBaseCurrency] = useState<Currency>(() => loadBaseCurrency(i18n.language));
 const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({});
const [exchangeRateSource, setExchangeRateSource] = useState<ExchangeRateSource>('live');
const [exchangeRatesUpdatedAt, setExchangeRatesUpdatedAt] = useState<number | null>(null);
const [, setIsExchangeRatesRefreshing] = useState(false);
const [exchangeRatesStale, setExchangeRatesStale] = useState(false);
const [exchangeRateError, setExchangeRateError] = useState<string | undefined>();
 const [undoAction, setUndoAction] = useState<UndoableAiAction | null>(null);
 const [undoError, setUndoError] = useState<string | null>(null);
 const [isUndoPaused, setIsUndoPaused] = useState(false);
 const undoTimerRef = useRef<number | null>(null);
 const undoRemainingMsRef = useRef<number>(UNDO_TIMEOUT_MS);
 const undoStartedAtRef = useRef<number>(0);
 const [toast, setToast] = useState<AppToastMessage | null>(null);
 const toastTimerRef = useRef<number | null>(null);
 const appLocale = normalizeLocale(i18n.language);
 const appUser = passwordRecoveryPending ? null : user;
 const appSession = passwordRecoveryPending ? null : session;
 const notificationReady = isBarkReady(notificationSettings);
 const notificationScope = appUser ? getUserDataScope(appUser.id) : GUEST_DATA_SCOPE;

 const dismissToast = useCallback(() => {
  if (toastTimerRef.current) {
   window.clearTimeout(toastTimerRef.current);
   toastTimerRef.current = null;
  }
  setToast(null);
 }, []);

 const showToast = useCallback((variant: AppToastVariant, message: string) => {
  if (toastTimerRef.current) {
   window.clearTimeout(toastTimerRef.current);
  }
  setToast({ id: crypto.randomUUID(), variant, message });
  toastTimerRef.current = window.setTimeout(() => {
   setToast(null);
   toastTimerRef.current = null;
  }, TOAST_TIMEOUT_MS);
 }, []);

 useEffect(() => () => {
  if (toastTimerRef.current) {
   window.clearTimeout(toastTimerRef.current);
  }
 }, []);

 useEffect(() => {
 document.title = t('app:documentTitle');
 }, [i18n.language, t]);

 const closePricing = () => {
  setIsPricingModalOpen(false);
  const url = new URL(window.location.href);
  if (url.pathname === '/pricing') url.pathname = '/app';
  url.searchParams.delete('payment');
  url.searchParams.delete('session_id');
  if (url.hash === '#pricing-compare') url.hash = '';
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
 };

 useEffect(() => {
  if (appUser && sessionStorage.getItem('pricing-return') === '1') {
   sessionStorage.removeItem('pricing-return');
   setAuthModalContext(null);
   setIsAuthModalOpen(false);
   setIsPricingModalOpen(true);
   return;
  }
  if (appUser && appSession?.access_token && sessionStorage.getItem('ai-capture-return') === '1') {
   sessionStorage.removeItem('ai-capture-return');
   setAuthModalContext(null);
   setIsAuthModalOpen(false);
   setIsAiCaptureOpen(true);
  }
 }, [appSession?.access_token, appUser]);

 useEffect(() => {
  if (loading) {
   return;
  }

  if (notificationSettings.locale === appLocale) {
   return;
  }

  const nextSettings: ReminderSettings = {
   ...notificationSettings,
   locale: appLocale,
  };

  setNotificationSettings(nextSettings);
  saveNotificationSettings(nextSettings, notificationScope);

  if (appUser && config.hasSupabaseConfig && isBarkReady(nextSettings)) {
   void NotificationSettingsService.updateContext({ locale: appLocale }, appUser.id).catch(error => {
    console.error('Failed to sync notification locale to cloud:', error);
   });
  }
 }, [appLocale, appUser, loading, notificationScope, notificationSettings]);

 useEffect(() => {
  if (loading || !appUser || !config.hasSupabaseConfig) {
   return;
  }

  const currentTimeZone = getCurrentTimeZone();
  if (notificationSettings.timeZone === currentTimeZone) {
   return;
  }

  const nextSettings: ReminderSettings = {
   ...notificationSettings,
   timeZone: currentTimeZone,
  };

  setNotificationSettings(nextSettings);
  saveNotificationSettings(nextSettings, notificationScope);

  void NotificationSettingsService.updateContext({ timeZone: currentTimeZone }, appUser.id).catch(error => {
   console.error('Failed to sync notification time zone to cloud:', error);
  });
 }, [appUser, loading, notificationScope, notificationSettings]);

 // 使用数据同步Hook
 const {
 syncStatus,
 lastSyncTime,
 pendingSyncCount,
 syncSubscriptions,
 uploadLocalData,
 createSubscription,
 updateSubscription,
 updateSubscriptionsBatch,
 deleteSubscription
 } = useSubscriptionSync(appUser, setSubscriptions);

 // 使用类别同步Hook
 const {
 syncCategories,
 uploadLocalCategories,
 createCategory,
 updateCategory,
 deleteCategory: deleteCategorySync,
 updateCategoriesOrder,
 restoreDefaultCategories
 } = useCategorySync(appUser, () => {
 // 类别变更时触发UI更新，若当前筛选分类已被隐藏或删除则回退到全部
 setSubscriptions(current => [...current]);
 setSelectedCategory(current => {
  if (!current) return null;
  const visible = getVisibleCategories();
  return visible.some(cat => cat.name === current) ? current : null;
 });
 });

 const { upcomingCount, trialsCount, expiredTrialsCount } = useMemo(() => {
  let upcoming = 0;
  let trials = 0;
  let expiredTrials = 0;
  for (const sub of subscriptions) {
   const renewal = resolveSubscriptionRenewal(sub);
   if (renewal.daysUntilEffectiveNextPayment >= 0 && renewal.daysUntilEffectiveNextPayment <= 7) {
    upcoming += 1;
   }
   if (isTrialSubscription(sub)) {
    trials += 1;
    if (isExpiredTrial(sub)) {
     expiredTrials += 1;
    }
   }
  }
  return { upcomingCount: upcoming, trialsCount: trials, expiredTrialsCount: expiredTrials };
 }, [subscriptions]);

 const normalizedSearchQuery = searchQuery.trim().toLowerCase();
 const hasActiveFilters = Boolean(selectedCategory || quickFilter !== 'all' || normalizedSearchQuery);

 const clearAllFilters = () => {
  setSelectedCategory(null);
  setQuickFilter('all');
  setSearchQuery('');
 };

 // 获取筛选后的订阅列表
 const filteredSubscriptions = useMemo(() => {
  return subscriptions.filter(sub => {
   if (selectedCategory && sub.category !== selectedCategory) {
    return false;
   }
   if (quickFilter === 'upcoming') {
    const days = resolveSubscriptionRenewal(sub).daysUntilEffectiveNextPayment;
    if (days < 0 || days > 7) {
     return false;
    }
   } else if (quickFilter === 'trials') {
    if (!isTrialSubscription(sub)) {
     return false;
    }
   }
   if (normalizedSearchQuery) {
    const localizedCategory = getCategoryDisplayName(sub.category, t).toLowerCase();
    const matches =
     sub.name.toLowerCase().includes(normalizedSearchQuery) ||
     sub.category.toLowerCase().includes(normalizedSearchQuery) ||
     localizedCategory.includes(normalizedSearchQuery);
    if (!matches) {
     return false;
    }
   }
   return true;
  });
 }, [normalizedSearchQuery, quickFilter, selectedCategory, subscriptions, t]);

 // 获取排序后的订阅列表
 const sortedSubscriptions = useMemo(
  () => sortSubscriptions(filteredSubscriptions, sortConfig, baseCurrency, exchangeRates),
  [filteredSubscriptions, sortConfig, baseCurrency, exchangeRates]
 );

 const applyExchangeRateResult = useCallback((result: ExchangeRateLoadResult) => {
 setExchangeRates(result.rates);
 setExchangeRateSource(result.source);
 setExchangeRatesUpdatedAt(result.updatedAt ?? null);
 setExchangeRatesStale(Boolean(result.stale));
 setExchangeRateError(result.error);
 }, []);

 const refreshExchangeRates = useCallback(async (currency: Currency) => {
 const taskToken = exchangeRateTaskGate.claim('exchange-rates');
 setIsExchangeRatesRefreshing(true);
 console.log(`[Exchange Rates] Refresh started for base currency: ${currency}`);

 try {
 const result = await refreshExchangeRatesWithStatus(currency);
 if (!exchangeRateTaskGate.isCurrent('exchange-rates', taskToken)) {
  return;
 }

 console.log('[Exchange Rates] Refresh completed:', {
  currency,
  source: result.source,
  stale: Boolean(result.stale),
  updatedAt: result.updatedAt,
  error: result.error
 });
 applyExchangeRateResult(result);
 } catch (error) {
 if (!exchangeRateTaskGate.isCurrent('exchange-rates', taskToken)) {
  return;
 }

 console.error(`[Exchange Rates] Refresh failed for ${currency}:`, error);
 setExchangeRateSource('fallback');
 setExchangeRatesStale(true);
 setExchangeRateError(error instanceof Error ? error.message : 'Failed to refresh exchange rates');
 } finally {
 if (exchangeRateTaskGate.isCurrent('exchange-rates', taskToken)) {
  setIsExchangeRatesRefreshing(false);
 }
 }
 }, [applyExchangeRateResult]);

 useEffect(() => {
 const cachedSnapshot = getStoredExchangeRatesSnapshot(baseCurrency);
 if (cachedSnapshot) {
  applyExchangeRateResult(cachedSnapshot);
 } else {
  setExchangeRates({});
  setExchangeRateSource('fallback');
  setExchangeRatesUpdatedAt(null);
  setExchangeRatesStale(true);
  setExchangeRateError(undefined);
 }

 void refreshExchangeRates(baseCurrency);
 }, [applyExchangeRateResult, baseCurrency, refreshExchangeRates]);

 useEffect(() => {
  const refreshIfVisibleAndOnline = () => {
   if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
   }

   if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
    return;
   }

   void refreshExchangeRates(baseCurrency);
  };

  const handleVisibilityChange = () => {
   if (document.visibilityState === 'visible') {
    refreshIfVisibleAndOnline();
   }
  };

  const intervalId = window.setInterval(refreshIfVisibleAndOnline, EXCHANGE_RATE_REFRESH_INTERVAL_MS);
  window.addEventListener('online', refreshIfVisibleAndOnline);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
   window.clearInterval(intervalId);
   window.removeEventListener('online', refreshIfVisibleAndOnline);
   document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
 }, [baseCurrency, refreshExchangeRates]);

 // 根据当前用户切换本地数据作用域
 useEffect(() => {
 if (loading) {
  return;
 }

 if (appUser && isOwnedGuestDataForUser(appUser.id)) {
  migrateOwnedGuestDataToUserScope(appUser.id);
 }

 if (appUser) {
  migrateUnownedGuestDataToUserScope(appUser.id);
 }

 const nextScope = appUser ? getUserDataScope(appUser.id) : GUEST_DATA_SCOPE;
 setActiveDataScope(nextScope);
 setSubscriptions(loadSubscriptions(nextScope));
 setNotificationSettings(loadNotificationSettings(nextScope));

 if (appUser) {
  refreshLocalDataOwnership(appUser.id, nextScope);
 }
 }, [appUser, loading]);

 // 主题切换效果
 useEffect(() => {
 if (theme === 'dark') {
 document.documentElement.classList.add('dark');
 } else {
 document.documentElement.classList.remove('dark');
 }
 localStorage.setItem('theme', theme);
 }, [theme]);

 // Initialize once per ready account, independently of incidental renders.
 useInitialAccountSync(appUser?.id, !loading && Boolean(appSession?.access_token), async isCurrentTask => {
 if (!appUser) return;
 const syncScope = getUserDataScope(appUser.id);

 // 首次登录同步策略：云端为准
 try {
 console.log('User logged in, checking cloud data...');
 claimLocalDataOwnership(appUser.id, getUserDataScope(appUser.id));

 // 1. 同步订阅数据
 const cloudSubscriptions = await syncSubscriptions();
 if (!isCurrentTask()) return;

 // 如果云端为空，则上传本地数据
 if (cloudSubscriptions.length === 0) {
 const currentSubscriptions = loadSubscriptions(syncScope);
 if (currentSubscriptions.length > 0) {
 console.log('Cloud is empty, uploading local subscriptions...');
 await uploadLocalData(currentSubscriptions);
 if (!isCurrentTask()) return;
 } else {
 console.log('Both cloud and local subscriptions are empty');
 }
 } else {
 console.log(`Cloud data loaded: ${cloudSubscriptions.length} subscriptions (cloud is authoritative)`);
 }

 // 2. 同步类别数据
 // 先检查云端是否有数据（不保存到本地，避免清空默认类别）
 try {
 const cloudCategoriesCheck = await CategoryService.getCategories(appUser.id);
 if (!isCurrentTask()) return;

 if (cloudCategoriesCheck.length === 0) {
 // 云端为空，先上传本地类别到云端
 const currentCategories = loadCategories(syncScope);
 if (currentCategories.length > 0) {
 console.log('Cloud is empty, uploading local categories first...');
 await uploadLocalCategories(currentCategories);
 if (!isCurrentTask()) return;
 } else {
 console.log('Both cloud and local categories are empty');
 }
 } else {
 // 云端有数据，下载并同步到本地
 console.log(`Cloud has ${cloudCategoriesCheck.length} categories, syncing...`);
 await syncCategories();
 if (!isCurrentTask()) return;
 }
 } catch (error) {
 console.error('Category sync check failed:', error);
 // 同步失败，保持本地数据不变
 }

 if (!isCurrentTask()) return;

 // 3. 同步通知设置
 try {
 const cloudNotificationSettings = await NotificationSettingsService.getSettings(appUser.id);
 if (!isCurrentTask()) return;
 if (cloudNotificationSettings) {
 console.log('Cloud notification settings loaded');
 setNotificationSettings(cloudNotificationSettings);
 // 同时保存到本地以保持一致性
 saveNotificationSettings(cloudNotificationSettings, syncScope);
 } else {
 // 云端为空，上传本地设置
 const localNotificationSettings = loadNotificationSettings(syncScope);
 if (isBarkReady(localNotificationSettings)) {
 console.log('Cloud notification settings empty, uploading local settings...');
 await NotificationSettingsService.saveSettings(localNotificationSettings, appUser.id);
}
 }
 } catch (error) {
 console.error('Notification settings sync failed:', error);
 // 同步失败，保持本地数据不变
 }
 } catch (error) {
 console.error('Failed to perform initial sync:', error);
 }
 });

 const handleAddSubscription = async (subscription: Subscription) => {
 try {
 await createSubscription(subscription);
 setIsAddModalOpen(false);
 } catch (error) {
 console.error('Failed to add subscription:', error);
 throw error;
 }
 };

 const handleDeleteSubscription = async () => {
 if (selectedSubscription) {
 const deletedSnapshot = selectedSubscription;
 try {
 await deleteSubscription(deletedSnapshot.id);
 setSelectedSubscription(null);
 let didUndo = false;
 showUndoAction({
  id: crypto.randomUUID(),
  message: t('aiCapture:undo.deleted', { name: deletedSnapshot.name }),
  undoLabel: t('aiCapture:undo.action'),
  undo: async () => {
   if (didUndo) return;
   didUndo = true;
   await createSubscription(deletedSnapshot);
  },
 });
 } catch (error) {
 console.error('Failed to delete subscription:', error);
 // 错误处理已在Hook中完成
 setSelectedSubscription(null);
 }
 }
 };

 const handleEditSubscription = async (updatedSubscription: Subscription) => {
 try {
 await updateSubscription(updatedSubscription);
 setSelectedSubscription(null);
 setIsEditModalOpen(false);
 } catch (error) {
 console.error('Failed to edit subscription:', error);
 throw error;
 }
 };

 const handleConvertTrialToPaid = async (subscription: Subscription) => {
 const originalSnapshot = subscription;
 const converted = buildConvertedPaidSubscription(subscription);
 try {
 await updateSubscription(converted);
 setSelectedSubscription(null);
 let didUndo = false;
 showUndoAction({
  id: crypto.randomUUID(),
  message: t('app:trialConvertedUndo', { name: originalSnapshot.name }),
  undoLabel: t('aiCapture:undo.action'),
  undo: async () => {
   if (didUndo) return;
   didUndo = true;
   await updateSubscription(originalSnapshot);
  },
 });
 } catch (error) {
 console.error('Failed to convert trial to paid:', error);
 throw error;
 }
 };

 const handleEditClick = () => {
 setIsEditModalOpen(true);
 };

 const handleAutoRenew = async (
 subscriptionId: string,
 newDates: { lastPaymentDate: string; nextPaymentDate: string }
 ) => {
 const targetSubscription = subscriptions.find(sub => sub.id === subscriptionId);
 if (!targetSubscription) {
 return;
 }

 if (
 targetSubscription.isTrial ||
 (
  targetSubscription.lastPaymentDate === newDates.lastPaymentDate &&
  targetSubscription.nextPaymentDate === newDates.nextPaymentDate
 )
 ) {
 return;
 }

 try {
 await updateSubscription({
 ...targetSubscription,
 ...newDates
 });
 } catch (error) {
 console.error('Failed to auto renew subscription:', error);
 }
 };

 const toggleTheme = () => {
 setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
 };

 const handleViewModeChange = (nextMode: ViewMode) => {
 setViewMode(nextMode);
 saveViewMode(nextMode);
 };

 const handleBaseCurrencyChange = (nextCurrency: Currency) => {
 setBaseCurrency(nextCurrency);
 saveBaseCurrency(nextCurrency);
 };

 const handleSortChange = (newSortConfig: SortConfig) => {
 setSortConfig(newSortConfig);
 saveSortConfig(newSortConfig);
 };

 const handleSignOut = async () => {
 await signOut();
 // 可选：清空本地数据或保留
 // setSubscriptions([]);
 };

 const handleDeleteAccount = async () => {
 const deletedUserId = await deleteAccount();

 clearDeletedUserLocalData(deletedUserId);
 setActiveDataScope(GUEST_DATA_SCOPE);
 setSubscriptions(loadSubscriptions(GUEST_DATA_SCOPE));
 setNotificationSettings(loadNotificationSettings(GUEST_DATA_SCOPE));
 setSelectedSubscription(null);
 setSelectedCategory(null);
 setQuickFilter('all');
 setSearchQuery('');
 clearUndoTimer();
 setUndoAction(null);
 setUndoError(null);
 setIsUndoPaused(false);
 setIsSettingsHubOpen(false);
 };

 // 导出数据
 const handleExportData = () => {
 try {
 exportData();
 } catch (error) {
 console.error('Failed to export data:', error);
 showToast('error', t('importData:exportFailed'));
 }
 };

 // 导入数据 - 打开文件选择器
 const handleImportData = () => {
 fileInputRef.current?.click();
 };

 const getImportDataErrorMessage = (error: unknown): string => {
 if (error instanceof ImportDataError) {
  return t(`importData:errors.${error.code}`, error.params);
 }

 return t('importData:errors.invalidFile');
 };

 const handleSaveNotificationSettings = async (newSettings: ReminderSettings): Promise<{ cloudSynced: boolean }> => {
 const targetUserId = appUser?.id;
 const targetScope = notificationScope;
 const nextSettings: ReminderSettings = {
 ...newSettings,
 locale: appLocale,
 };

 setNotificationSettings(nextSettings);
 saveNotificationSettings(nextSettings, targetScope);

 if (targetUserId && config.hasSupabaseConfig) {
 try {
 await NotificationSettingsService.saveSettings(nextSettings, targetUserId);
 return { cloudSynced: true };
 } catch (error) {
 console.error('Failed to sync notification settings to cloud:', error);
 return { cloudSynced: false };
 }
 }

 return { cloudSynced: true };
 };

 const openSettingsHub = (tab: SettingsTab = 'general') => {
 setSettingsHubTab(tab);
 setIsSettingsHubOpen(true);
 };

 const clearUndoTimer = useCallback(() => {
 if (undoTimerRef.current) {
  window.clearTimeout(undoTimerRef.current);
  undoTimerRef.current = null;
 }
 }, []);

 const dismissUndoAction = useCallback(() => {
 clearUndoTimer();
 setUndoAction(null);
 setUndoError(null);
 setIsUndoPaused(false);
 }, [clearUndoTimer]);

 const startUndoTimer = useCallback((durationMs: number) => {
 clearUndoTimer();
 undoRemainingMsRef.current = durationMs;
 undoStartedAtRef.current = Date.now();
 undoTimerRef.current = window.setTimeout(() => {
  setUndoAction(null);
  setUndoError(null);
  setIsUndoPaused(false);
  undoTimerRef.current = null;
 }, durationMs);
 }, [clearUndoTimer]);

 const pauseUndoTimer = useCallback(() => {
 if (!undoTimerRef.current) {
  return;
 }
 const elapsed = Date.now() - undoStartedAtRef.current;
 undoRemainingMsRef.current = Math.max(250, undoRemainingMsRef.current - elapsed);
 clearUndoTimer();
 setIsUndoPaused(true);
 }, [clearUndoTimer]);

 const resumeUndoTimer = useCallback(() => {
 if (!undoAction || undoTimerRef.current || undoError) {
  return;
 }
 setIsUndoPaused(false);
 startUndoTimer(undoRemainingMsRef.current);
 }, [startUndoTimer, undoAction, undoError]);

 const showUndoAction = useCallback((action: UndoableAiAction) => {
 clearUndoTimer();
 setUndoError(null);
 setIsUndoPaused(false);
 setUndoAction(action);
 startUndoTimer(UNDO_TIMEOUT_MS);
 }, [clearUndoTimer, startUndoTimer]);

 const closePasswordRecoveryToLogin = useCallback(async () => {
 await dismissPasswordRecovery();
 if (config.features.authentication) {
  setAuthModalContext(null);
  setIsAuthModalOpen(true);
 }
 }, [dismissPasswordRecovery]);

 const handleUndoAction = useCallback(async () => {
 if (!undoAction) {
  return;
 }

 clearUndoTimer();
 setIsUndoPaused(false);
 try {
  await undoAction.undo();
  undoAction.onRestored?.();
  setUndoAction(null);
  setUndoError(null);
 } catch (error) {
  console.error('Failed to undo AI action:', error);
  setUndoError(t('aiCapture:undo.failed'));
 }
 }, [clearUndoTimer, t, undoAction]);

 useEffect(() => () => {
 clearUndoTimer();
 }, [clearUndoTimer]);

 // 文件选择后的处理
 const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
 const file = event.target.files?.[0];
 if (!file) return;

 try {
 // 验证并预览数据
 const previewData = await validateImportData(file);
 setImportPreviewData(previewData);
 setIsImportModalOpen(true);
 } catch (error) {
 console.error('Failed to validate import file:', error);
 showToast('error', getImportDataErrorMessage(error));
 }

 // 重置文件输入，允许重复选择同一文件
 event.target.value = '';
 };

 // 确认导入
 const handleConfirmImport = async () => {
 if (!importPreviewData || isImporting) return;

 setIsImporting(true);
 try {
 const currentSubscriptions = loadSubscriptions();
 const subscriptionPlan = buildSubscriptionImportPlan(
  currentSubscriptions,
  importPreviewData.subscriptions
 );

 for (const subscriptionId of subscriptionPlan.deleteIds) {
  await deleteSubscription(subscriptionId);
 }

 for (const subscription of subscriptionPlan.update) {
  await updateSubscription(subscription);
 }

 for (const subscription of subscriptionPlan.create) {
  await createSubscription(subscription);
 }

 if (importPreviewData.categories) {
  const currentCategories = loadCategories();
  const categoryPlan = buildCategoryImportPlan(
   currentCategories,
   importPreviewData.categories
  );

  for (const categoryId of categoryPlan.deleteIds) {
   await deleteCategorySync(categoryId);
  }

  for (const category of categoryPlan.update) {
   await updateCategory(category);
  }

  for (const category of categoryPlan.create) {
   await createCategory(category);
  }
 }

 setSubscriptions(loadSubscriptions());

 // 关闭模态框
 setIsImportModalOpen(false);
 setImportPreviewData(null);

 // 重置筛选状态
 setSelectedCategory(null);
 setQuickFilter('all');
 setSearchQuery('');

 showToast('success', t('importData:importSuccess'));
 } catch (error) {
 console.error('Failed to import data:', error);
 showToast('error', t('importData:importFailed'));
 } finally {
 setIsImporting(false);
 }
 };

 // 显示加载状态
 if (loading) {
 return (
 <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
 <div className="text-center">
 <div className="w-8 h-8 border-4 border-emerald-600 dark:border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
 <p className="text-gray-600 dark:text-gray-400">{t('app:loading')}</p>
 </div>
 </div>
 );
 }

 if (passwordRecoveryPending) {
 return (
 <main className="recovery-page">
 <Suspense
 fallback={(
  <LazyModalFallback
   title={t('auth:setNewPasswordTitle')}
   description={t('app:loadingPasswordResetDescription')}
   onClose={closePasswordRecoveryToLogin}
  />
 )}
 >
  <PasswordRecoveryModal
  isOpen={passwordRecoveryPending}
  standalone
  onClose={closePasswordRecoveryToLogin}
  onUpdatePassword={async (newPassword: string) => {
   const result = await completePasswordReset(newPassword);
   if (result.error) {
    throw new Error(result.error.message);
   }
  }}
  />
 </Suspense>
 </main>
 );
 }

 return (
 <>
 <div className="min-h-screen pb-4 relative overflow-x-clip transition-colors duration-300">
<div className="px-4 py-8">
 <div className="max-w-7xl mx-auto space-y-8">
 <LegacyDomainNotice onExport={handleExportData} />
 {/* 移动端优化的头部布局 */}
 <div className="sticky top-4 z-50 p-4 sm:px-6 sm:py-4 mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-[#fcfcfc]/80 dark:bg-[#1a1c1e]/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-3xl shadow-fey app-theme-topbar"> <div className="flex items-center gap-3">
 <h1 className="text-2xl sm:text-2xl font-semibold tracking-tight text-gray-900 dark:text-white app-theme-text-primary">
 {t('app:title')}
 </h1>
 {canOfferAiCapture && (
 <button
 onClick={openAiCapture}
 className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/30 rounded-2xl hover:bg-emerald-100/80 dark:hover:bg-emerald-500/20 transition-all text-sm font-medium"
 title={t('app:aiAssistTooltip')}
 >
 <Sparkles className="w-4 h-4"/>
 <span className="hidden sm:inline">{t('app:aiAssist')}</span>
 </button>
 )}
 {subscriptions.length > 0 && (
 <button
 onClick={openAdvancedReport}
 className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1a1c1e] text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-apple transition-all text-sm font-medium app-theme-chip"
 title={canUseAdvancedReport ? t('app:viewAdvancedReport') : t('app:advancedReportPremiumOnly')}
 >
 <BarChart3 className="w-4 h-4"/>
 <span className="hidden sm:inline">{t('app:advancedReport')}</span>
 </button>
 )}
 </div>

 {/* 按钮组 */}
 <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
 {/* 始终显示用户菜单，无论是否登录 */}
 {config.features.authentication ? (
 <UserMenu
 user={appUser}
 userProfile={appUser ? userProfile : null}
 syncStatus={syncStatus}
 lastSyncTime={lastSyncTime}
 pendingSyncCount={pendingSyncCount}
 onOpenSettings={() => openSettingsHub()}
 onPricingClick={() => setIsPricingModalOpen(true)}
 onSignOut={handleSignOut}
 onSync={syncSubscriptions}
 onLogin={() => {
  setAuthModalContext(null);
  setIsAuthModalOpen(true);
 }}
 />
 ) : (
 /* 无云同步功能时，使用简化的用户菜单（仅本地功能） */
 <UserMenu
 user={null}
 userProfile={null}
 syncStatus="idle"
 lastSyncTime={null}
 onOpenSettings={() => openSettingsHub()}
 onPricingClick={() => setIsPricingModalOpen(true)}
 onSignOut={() => {}}
 onSync={() => {}}
 />
 )}

 <div className="ml-auto flex items-center gap-2">
 <LanguageSwitcher />
 <ThemeToggle theme={theme} onToggle={toggleTheme} />
 </div>
 </div>
 </div>

 <Dashboard
 subscriptions={sortedSubscriptions}
 viewMode={viewMode}
 onViewModeChange={handleViewModeChange}
 sortConfig={sortConfig}
 onSortChange={handleSortChange}
 selectedCategory={selectedCategory}
 onCategoryChange={setSelectedCategory}
 totalSubscriptions={subscriptions.length}
 baseCurrency={baseCurrency}
 onBaseCurrencyChange={handleBaseCurrencyChange}
 exchangeRates={exchangeRates}
 exchangeRateSource={exchangeRateSource}
 exchangeRatesUpdatedAt={exchangeRatesUpdatedAt}
 exchangeRatesStale={exchangeRatesStale}
 exchangeRateError={exchangeRateError}
 onTrialsClick={() => setQuickFilter(prev => prev === 'trials' ? 'all' : 'trials')}
 />

 {subscriptions.length > 0 && (
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
  <div className="relative flex-1 max-w-md">
   <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
   <input
    type="text"
    value={searchQuery}
    onChange={e => setSearchQuery(e.target.value)}
    placeholder={t('app:searchPlaceholder')}
    aria-label={t('app:searchPlaceholder')}
    className="w-full pl-10 pr-9 py-2.5 text-sm rounded-2xl bg-white dark:bg-[#1a1c1e] border border-gray-200/80 dark:border-gray-700/80 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all app-theme-chip"
   />
   {searchQuery && (
    <button
     type="button"
     onClick={() => setSearchQuery('')}
     aria-label={t('app:clearSearch')}
     className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
     <X className="w-3.5 h-3.5" />
    </button>
   )}
  </div>

  <div className="flex flex-wrap items-center gap-2">
   <button
    type="button"
    onClick={() => setQuickFilter('all')}
    aria-pressed={quickFilter === 'all'}
    className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-medium border transition-all ${
     quickFilter === 'all'
      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
      : 'bg-white dark:bg-[#1a1c1e] text-gray-700 dark:text-gray-300 border-gray-200/80 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-800 app-theme-chip'
    }`}
   >
    {t('app:filterAll')} ({subscriptions.length})
   </button>
   <button
    type="button"
    onClick={() => setQuickFilter(prev => prev === 'upcoming' ? 'all' : 'upcoming')}
    aria-pressed={quickFilter === 'upcoming'}
    className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-medium border transition-all ${
     quickFilter === 'upcoming'
      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
      : 'bg-white dark:bg-[#1a1c1e] text-gray-700 dark:text-gray-300 border-gray-200/80 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-800 app-theme-chip'
    }`}
   >
    {t('app:filterUpcoming')} ({upcomingCount})
   </button>
   {trialsCount > 0 && (
    <button
     type="button"
     onClick={() => setQuickFilter(prev => prev === 'trials' ? 'all' : 'trials')}
     aria-pressed={quickFilter === 'trials'}
     className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-medium border transition-all ${
      quickFilter === 'trials'
       ? expiredTrialsCount > 0
        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
        : 'bg-amber-600 text-white border-amber-600 shadow-sm'
       : expiredTrialsCount > 0
        ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-500/30 hover:bg-rose-100/80 dark:hover:bg-rose-500/20'
        : 'bg-white dark:bg-[#1a1c1e] text-gray-700 dark:text-gray-300 border-gray-200/80 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-800 app-theme-chip'
     }`}
    >
     <span>{t('app:filterTrials')} ({trialsCount})</span>
     {expiredTrialsCount > 0 && (
      <span
       className={`w-2 h-2 rounded-full ${
        quickFilter === 'trials' ? 'bg-white' : 'bg-rose-500'
       }`}
       aria-hidden="true"
      />
     )}
    </button>
   )}
  </div>
 </div>
 )}

 {subscriptions.length === 0 && canOfferAiCapture && (
 <div className="rounded-3xl border border-emerald-200/70 dark:border-emerald-500/25 bg-white/80 dark:bg-[#1a1c1e]/80 backdrop-blur-xl p-5 sm:p-6 shadow-fey flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 app-theme-panel">
  <div className="space-y-1">
   <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white app-theme-text-primary">
    {t('app:emptyQuickStartTitle')}
   </h3>
   <p className="text-sm text-gray-600 dark:text-gray-300 app-theme-text-secondary">
    {t('app:emptyQuickStartSubtitle')}
   </p>
  </div>
  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
   <button
    onClick={openAiCapture}
    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
   >
    <Sparkles className="w-4 h-4"/>
    <span>{t('app:emptyAiAction')}</span>
   </button>
   <button
    onClick={() => setIsAddModalOpen(true)}
    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium transition-colors app-theme-chip"
   >
    <Plus className="w-4 h-4"/>
    <span>{t('app:emptyManualAction')}</span>
   </button>
  </div>
 </div>
 )}

 {subscriptions.length > 0 && sortedSubscriptions.length === 0 && hasActiveFilters && (
 <div className="rounded-3xl border border-gray-200/80 dark:border-gray-700/80 bg-white/90 dark:bg-[#1a1c1e]/90 p-6 sm:p-8 text-center space-y-3 app-theme-panel">
  <p className="text-base font-semibold text-gray-900 dark:text-white app-theme-text-primary">
   {t('app:emptyFilterTitle')}
  </p>
  <p className="text-sm text-gray-600 dark:text-gray-400 app-theme-text-secondary">
   {t('app:emptyFilterSubtitle')}
  </p>
  <div>
   <button
    type="button"
    onClick={clearAllFilters}
    className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
   >
    <X className="w-4 h-4" />
    <span>{t('app:clearFilters')}</span>
   </button>
  </div>
 </div>
 )}

 <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
 {sortedSubscriptions.map((subscription, index) => (
 <SubscriptionCard
 key={subscription.id}
 subscription={subscription}
 index={index}
 onClick={() => setSelectedSubscription(subscription)}
 onAutoRenew={handleAutoRenew}
 />
 ))}

 <button
 onClick={() => setIsAddModalOpen(true)}
 className="group min-h-[200px] sm:min-h-[216px] bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-fey p-4 sm:p-6 flex flex-col items-center justify-center gap-3 sm:gap-4 transition-all duration-300 hover:border-emerald-500 app-theme-card"
 >
 <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#f4f5f7] dark:bg-[#202225] flex items-center justify-center group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10 transition-colors app-theme-icon-shell">
 <Plus className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 group-hover:text-emerald-600 dark:text-gray-500 dark:group-hover:text-emerald-400 transition-colors"/>
 </div>
 <p className="text-gray-600 dark:text-gray-300 font-medium text-sm sm:text-base text-center app-theme-text-secondary">
 {subscriptions.length === 0
 ? t('app:addFirstSubscription')
 : t('app:addSubscription')}
 </p>
 </button>
 </div>
 </div>
 </div>

 {isAddModalOpen && (
  <AddSubscriptionModal
  isOpen={isAddModalOpen}
  onClose={() => setIsAddModalOpen(false)}
  onAdd={handleAddSubscription}
  onOpenNotificationSettings={() => openSettingsHub('notifications')}
  categorySync={{
   createCategory,
   updateCategory
  }}
  isNotificationReady={notificationReady}
  />
 )}

 {isAiCaptureOpen && (
  <AiCaptureModal
  isOpen={isAiCaptureOpen}
  onClose={() => setIsAiCaptureOpen(false)}
  accessToken={appSession?.access_token ?? ''}
  subscriptions={subscriptions}
  onCreate={createSubscription}
  onUpdate={updateSubscription}
  onDelete={deleteSubscription}
  onShowUndo={showUndoAction}
  onManualFallback={() => { setIsAiCaptureOpen(false); setIsAddModalOpen(true); }}
  onUpgrade={config.features.payment && config.features.cloudSync ? () => { setIsAiCaptureOpen(false); setIsPricingModalOpen(true); } : undefined}
  />
 )}

 {selectedSubscription && (
  <SubscriptionDetailsModal
  isOpen={selectedSubscription !== null}
  subscription={selectedSubscription}
  onClose={() => setSelectedSubscription(null)}
  onEdit={handleEditClick}
  onDelete={handleDeleteSubscription}
  onConvertTrialToPaid={handleConvertTrialToPaid}
  />
 )}

 {selectedSubscription && isEditModalOpen && (
  <EditSubscriptionModal
  subscription={selectedSubscription}
  isOpen={isEditModalOpen}
  onClose={() => setIsEditModalOpen(false)}
  onEdit={handleEditSubscription}
  onOpenNotificationSettings={() => openSettingsHub('notifications')}
  categorySync={{
   createCategory,
   updateCategory
  }}
  isBarkEnabled={notificationReady}
  />
 )}

 {config.features.authentication && isAuthModalOpen && (
 <Suspense
 fallback={(
  <LazyModalFallback
   title={t('userMenu:loginToSync')}
   description={t('app:loadingAuthDescription')}
   onClose={() => {
    setAuthModalContext(null);
    setIsAuthModalOpen(false);
   }}
  />
 )}
 >
  <AuthModal
  isOpen={isAuthModalOpen}
  contextBanner={authModalContext === 'ai-capture' ? t('auth:aiAssistLoginHint') : undefined}
  onClose={() => {
   sessionStorage.removeItem('ai-capture-return');
   setAuthModalContext(null);
   setIsAuthModalOpen(false);
  }}
 />
 </Suspense>
 )}

 {isSettingsHubOpen && (
 <Suspense
 fallback={(
  <LazyModalFallback
   title={t('settingsHub:title')}
   description={t('settingsHub:loadingDescription')}
   onClose={() => setIsSettingsHubOpen(false)}
  />
 )}
 >
  <SettingsHubModal
  isOpen={isSettingsHubOpen}
  onClose={() => setIsSettingsHubOpen(false)}
  theme={theme}
  onThemeChange={setTheme}
  onPricingClick={() => {
   setIsSettingsHubOpen(false);
   setIsPricingModalOpen(true);
  }}
  activeTab={settingsHubTab}
  user={appUser}
  userProfile={appUser ? userProfile : null}
  accessToken={appSession?.access_token}
  onOpenAuth={() => {
   setIsSettingsHubOpen(false);
   setAuthModalContext(null);
   setIsAuthModalOpen(true);
  }}
  onUpdateNickname={updateUserNickname}
  onUpdateEmail={async (newEmail: string) => {
   const result = await updateUserEmail(newEmail);
   if (result.error) {
    throw new Error(result.error.message);
   }
  }}
  onUpdatePassword={async (newPassword: string) => {
   const result = await updateUserPassword(newPassword);
   if (result.error) {
    throw new Error(result.error.message);
   }
  }}
  onDeleteAccount={handleDeleteAccount}
  onExportData={handleExportData}
  onImportData={() => {
   setIsSettingsHubOpen(false);
   handleImportData();
  }}
  subscriptions={subscriptions}
  onCategoriesChanged={() => {
   // 类型变更时，重新加载订阅列表并校验当前筛选分类是否仍可见
   setSubscriptions(current => [...current]);
   setSelectedCategory(current => {
    if (!current) return null;
    const visible = getVisibleCategories();
    return visible.some(cat => cat.name === current) ? current : null;
   });
  }}
  onUpdateSubscriptions={async (updatedSubscriptions) => {
   await updateSubscriptionsBatch(updatedSubscriptions);
  }}
  categorySync={{
   createCategory,
   updateCategory,
   deleteCategory: deleteCategorySync,
   updateCategoriesOrder,
   restoreDefaultCategories
  }}
  notificationSettings={notificationSettings}
  onSaveNotificationSettings={handleSaveNotificationSettings}
  />
 </Suspense>
 )}

 {isImportModalOpen && (
 <Suspense
 fallback={(
  <LazyModalFallback
   title={t('userMenu:importData')}
   description={t('app:loadingImportDataDescription')}
   onClose={() => {
    setIsImportModalOpen(false);
    setImportPreviewData(null);
   }}
  />
 )}
 >
  <ImportDataModal
  isOpen={isImportModalOpen}
  onClose={() => {
   if (isImporting) return;
   setIsImportModalOpen(false);
   setImportPreviewData(null);
  }}
  onConfirm={handleConfirmImport}
  previewData={importPreviewData}
  isImporting={isImporting}
  />
 </Suspense>
 )}

 {/* 隐藏的文件输入 */}
 <input
 ref={fileInputRef}
 type="file"
 accept=".json"
 onChange={handleFileSelect}
 style={{ display: 'none' }}
 />

 {/* 高级报表 */}
 {isAdvancedReportOpen && (
 <Suspense
 fallback={(
  <LazyModalFallback
   title={t('app:loadingReportTitle')}
   description={t('app:loadingReportDescription')}
   onClose={() => setIsAdvancedReportOpen(false)}
  />
 )}
 >
  <AdvancedReport
  subscriptions={subscriptions}
  baseCurrency={baseCurrency}
  exchangeRates={exchangeRates}
  exchangeRatesUpdatedAt={exchangeRatesUpdatedAt}
  isPreview={!canUseAdvancedReport}
  onUpgrade={() => {
   setIsAdvancedReportOpen(false);
   setIsPricingModalOpen(true);
  }}
  onClose={() => setIsAdvancedReportOpen(false)}
  />
 </Suspense>
 )}

 {/* Pricing Modal */}
 {isPricingModalOpen && (
 <Suspense
 fallback={(
  <LazyModalFallback
   title={t('app:loadingPricingTitle')}
   description={t('app:loadingPricingDescription')}
   onClose={closePricing}
  />
 )}
 >
  <PricingModal
  isOpen={isPricingModalOpen}
  onClose={closePricing}
  onUpgrade={() => {
  setIsPricingModalOpen(false);
  if (!appUser) {
  setAuthModalContext(null);
  setIsAuthModalOpen(true);
  }
  }}
 />
 </Suspense>
 )}

 {undoAction && (
        <div className="fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4 pointer-events-none animate-drawer-up">
          <div
            role="status"
            aria-live="polite"
            onMouseEnter={pauseUndoTimer}
            onMouseLeave={(event) => {
              if (!event.currentTarget.contains(document.activeElement)) {
                resumeUndoTimer();
              }
            }}
            onFocus={pauseUndoTimer}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                resumeUndoTimer();
              }
            }}
            className="pointer-events-auto relative flex items-center justify-between gap-2 bg-gray-900/95 dark:bg-[#1a1c1e]/95 text-white shadow-apple-xl backdrop-blur-xl pl-5 pr-3 py-3 rounded-2xl max-w-md w-full transition-all"
          >
            <div className="absolute inset-0 rounded-2xl border border-gray-800/80 dark:border-gray-700/80 pointer-events-none" />

            <svg
              className="absolute inset-px h-[calc(100%-2px)] w-[calc(100%-2px)] pointer-events-none overflow-visible"
              aria-hidden="true"
            >
              <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                rx="15"
                className="fill-none stroke-emerald-400 opacity-20"
                strokeWidth="2"
              />
              <rect
                key={undoAction.id}
                x="0"
                y="0"
                width="100%"
                height="100%"
                rx="15"
                className="fill-none stroke-emerald-400 animate-undo-perimeter"
                style={{ animationPlayState: isUndoPaused ? 'paused' : 'running' }}
                strokeWidth="2"
                pathLength="100"
                strokeDasharray="100"
                strokeDashoffset="0"
              />
            </svg>

            {/* Content Area */}
            <div className="min-w-0 flex-1 text-left relative z-10">
              <p className="text-sm font-medium truncate">{undoAction.message}</p>
              {undoError && <p className="text-xs text-red-400 mt-0.5">{undoError}</p>}
            </div>

            {/* Undo & Dismiss Actions */}
            <div className="flex items-center gap-1 relative z-10 shrink-0">
              <button
                type="button"
                onClick={handleUndoAction}
                className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-emerald-400 hover:bg-white/10 active:scale-[0.98] font-semibold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <RotateCcw className="w-4 h-4 group-hover:-rotate-12 transition-transform" />
                {undoAction.undoLabel}
              </button>
              <button
                type="button"
                onClick={dismissUndoAction}
                aria-label={t('aiCapture:undo.dismiss')}
                className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

 <AppToast
 toast={toast}
 onDismiss={dismissToast}
 dismissLabel={t('app:dismissNotification')}
 offsetBottom={Boolean(undoAction)}
 />

 </div>

 <Footer />
 </>
 );
}
