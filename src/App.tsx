import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Plus, BarChart3 } from 'lucide-react';
import {
 Subscription,
 ViewMode,
 Theme,
 SortConfig,
 ReminderSettings,
 Currency,
 ExchangeRates,
 ExchangeRateSource
} from './types';
import { Dashboard } from './components/Dashboard';
import { AddSubscriptionModal } from './components/AddSubscriptionModal';
import { SubscriptionCard } from './components/SubscriptionCard';
import { SubscriptionDetailsModal } from './components/SubscriptionDetailsModal';
import { EditSubscriptionModal } from './components/EditSubscriptionModal';
import { ThemeToggle } from './components/ThemeToggle';
import { AuthModal } from './components/AuthModal';
import { EditNicknameModal } from './components/EditNicknameModal';
import { EditEmailModal } from './components/EditEmailModal';
import { EditPasswordModal } from './components/EditPasswordModal';
import { CategorySettingsModal } from './components/CategorySettingsModal';
import { ImportDataModal } from './components/ImportDataModal';
import { UserMenu } from './components/UserMenu';
import { useAuth } from './contexts/AuthContext';
import { useSubscriptionSync } from './hooks/useSubscriptionSync';
import { useCategorySync } from './hooks/useCategorySync';
import { loadSubscriptions } from './utils/storage';
import { loadCategories } from './utils/categories';
import { CategoryService } from './services/categoryService';
import {
 convertCurrency,
 DEFAULT_CURRENCY,
 getCachedExchangeRatesWithStatus
} from './utils/currency';
import {
 buildCategoryImportPlan,
 buildSubscriptionImportPlan,
 exportData,
 validateImportData,
 ExportData
} from './utils/exportImport';
import { loadNotificationSettings, saveNotificationSettings } from './utils/notificationChecker';
import { NotificationSettingsService } from './services/notificationSettingsService';
import { Footer } from './components/Footer';
import { config } from './lib/config';
import { sortSubscriptions } from './utils/subscriptionSorting';
import { GUEST_DATA_SCOPE, getUserDataScope, setActiveDataScope } from './utils/dataScope';

const AdvancedReport = lazy(() =>
 import('./components/AdvancedReport').then(module => ({ default: module.AdvancedReport }))
);
const PricingModal = lazy(() =>
 import('./components/PricingModal').then(module => ({ default: module.PricingModal }))
);
const NotificationSettingsModal = lazy(() =>
 import('./components/NotificationSettingsModal').then(module => ({ default: module.NotificationSettingsModal }))
);

function LazyModalFallback({
 title,
 description,
 onClose,
}: {
 title: string;
 description: string;
 onClose: () => void;
}) {
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
 Cancel
 </button>
 </div>
 </div>
 );
}

export function App() {
 const { user, userProfile, loading, signOut, updateUserEmail, updateUserPassword } = useAuth();
 const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
 const [viewMode, setViewMode] = useState<ViewMode>('monthly');
 const [theme, setTheme] = useState<Theme>('light');
 const [sortConfig, setSortConfig] = useState<SortConfig>({
 sortBy: 'nextPaymentDate',
 sortOrder: 'asc'
 });
 const [isAddModalOpen, setIsAddModalOpen] = useState(false);
 const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
 const [isEditModalOpen, setIsEditModalOpen] = useState(false);
 const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
 const [isEditNicknameModalOpen, setIsEditNicknameModalOpen] = useState(false);
 const [isEditEmailModalOpen, setIsEditEmailModalOpen] = useState(false);
 const [isEditPasswordModalOpen, setIsEditPasswordModalOpen] = useState(false);
 const [isCategorySettingsModalOpen, setIsCategorySettingsModalOpen] = useState(false);
 const [hasInitialSync, setHasInitialSync] = useState(false);
 const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
 const [isImportModalOpen, setIsImportModalOpen] = useState(false);
 const [importPreviewData, setImportPreviewData] = useState<ExportData | null>(null);
 const fileInputRef = useRef<HTMLInputElement>(null);
 const [notificationSettings, setNotificationSettings] = useState<ReminderSettings>(loadNotificationSettings());
 const [isNotificationSettingsModalOpen, setIsNotificationSettingsModalOpen] = useState(false);
 const [isAdvancedReportOpen, setIsAdvancedReportOpen] = useState(false);
 const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
 const [baseCurrency, setBaseCurrency] = useState<Currency>(DEFAULT_CURRENCY);
 const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({});
 const [exchangeRateSource, setExchangeRateSource] = useState<ExchangeRateSource>('live');
 const [exchangeRateError, setExchangeRateError] = useState<string | undefined>();

 // 使用数据同步Hook
 const {
 syncStatus,
 lastSyncTime,
 syncSubscriptions,
 uploadLocalData,
 createSubscription,
 updateSubscription,
 updateSubscriptionsBatch,
 deleteSubscription
 } = useSubscriptionSync(user, setSubscriptions);

 // 使用类别同步Hook
 const {
 syncCategories,
 uploadLocalCategories,
 createCategory,
 updateCategory,
 deleteCategory: deleteCategorySync,
 updateCategoriesOrder
 } = useCategorySync(user, () => {
 // 类别变更时触发UI更新
 setSubscriptions([...subscriptions]);
 });

 // 获取筛选后的订阅列表
 const filteredSubscriptions = selectedCategory
 ? subscriptions.filter(sub => sub.category === selectedCategory)
 : subscriptions;

 // 获取排序后的订阅列表
 const sortedSubscriptions = sortSubscriptions(filteredSubscriptions, sortConfig, baseCurrency, exchangeRates);

 // 初始化数据和主题
 useEffect(() => {
 const savedTheme = localStorage.getItem('theme') as Theme | null;
 if (savedTheme) {
 setTheme(savedTheme);
 } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
 setTheme('dark');
 }

 // 加载汇率数据
 getCachedExchangeRatesWithStatus(baseCurrency).then(result => {
 setExchangeRates(result.rates);
 setExchangeRateSource(result.source);
 setExchangeRateError(result.error);
 }).catch(error => {
 console.error('Failed to load exchange rates:', error);
 setExchangeRates({});
 setExchangeRateSource('fallback');
 setExchangeRateError(error instanceof Error ? error.message : 'Failed to load exchange rates');
 });
 }, [baseCurrency]);

 // 根据当前用户切换本地数据作用域
 useEffect(() => {
 if (loading) {
 return;
 }

 const nextScope = user ? getUserDataScope(user.id) : GUEST_DATA_SCOPE;
 setActiveDataScope(nextScope);
 setSubscriptions(loadSubscriptions());
 setNotificationSettings(loadNotificationSettings());
 }, [user, loading]);

 // 主题切换效果
 useEffect(() => {
 if (theme === 'dark') {
 document.documentElement.classList.add('dark');
 } else {
 document.documentElement.classList.remove('dark');
 }
 localStorage.setItem('theme', theme);
 }, [theme]);

 // 用户登录后的数据同步 - 只执行一次
 useEffect(() => {
 if (loading || !user || hasInitialSync) return; // 如果认证未完成、用户未登录或已经同步过，直接返回

 // 标记开始同步，防止重复
 setHasInitialSync(true);

 // 首次登录同步策略：云端为准
 const performInitialSync = async () => {
 try {
 console.log('User logged in, checking cloud data...');

 // 1. 同步订阅数据
 const cloudSubscriptions = await syncSubscriptions();

 // 如果云端为空，则上传本地数据
 if (cloudSubscriptions.length === 0) {
 const currentSubscriptions = loadSubscriptions();
 if (currentSubscriptions.length > 0) {
 console.log('Cloud is empty, uploading local subscriptions...');
 await uploadLocalData(currentSubscriptions);
 } else {
 console.log('Both cloud and local subscriptions are empty');
 }
 } else {
 console.log(`Cloud data loaded: ${cloudSubscriptions.length} subscriptions (cloud is authoritative)`);
 }

 // 2. 同步类别数据
 // 先检查云端是否有数据（不保存到本地，避免清空默认类别）
 try {
 const cloudCategoriesCheck = await CategoryService.getCategories();

 if (cloudCategoriesCheck.length === 0) {
 // 云端为空，先上传本地类别到云端
 const currentCategories = loadCategories();
 if (currentCategories.length > 0) {
 console.log('Cloud is empty, uploading local categories first...');
 await uploadLocalCategories(currentCategories);
 } else {
 console.log('Both cloud and local categories are empty');
 }
 } else {
 // 云端有数据，下载并同步到本地
 console.log(`Cloud has ${cloudCategoriesCheck.length} categories, syncing...`);
 await syncCategories();
 }
 } catch (error) {
 console.error('Category sync check failed:', error);
 // 同步失败，保持本地数据不变
 }

 // 3. 同步通知设置
 try {
 const cloudNotificationSettings = await NotificationSettingsService.getSettings();
 if (cloudNotificationSettings) {
 console.log('Cloud notification settings loaded');
 setNotificationSettings(cloudNotificationSettings);
 // 同时保存到本地以保持一致性
 saveNotificationSettings(cloudNotificationSettings);
 } else {
 // 云端为空，上传本地设置
 const localNotificationSettings = loadNotificationSettings();
 if (localNotificationSettings.barkPush.enabled) {
 console.log('Cloud notification settings empty, uploading local settings...');
 await NotificationSettingsService.saveSettings(localNotificationSettings);
 }
 }
 } catch (error) {
 console.error('Notification settings sync failed:', error);
 // 同步失败，保持本地数据不变
 }
 } catch (error) {
 console.error('Failed to perform initial sync:', error);
 }
 };

 performInitialSync();
 }, [user, loading]); // 依赖认证状态，确保作用域切换后再同步

 // 重置同步状态当用户登出时
 useEffect(() => {
 if (!user) {
 setHasInitialSync(false);
 }
 }, [user]);

 const handleAddSubscription = async (subscription: Subscription) => {
 try {
 await createSubscription(subscription);
 setIsAddModalOpen(false);
 } catch (error) {
 console.error('Failed to add subscription:', error);
 // 错误处理已在Hook中完成，这里只是确保模态框关闭
 setIsAddModalOpen(false);
 }
 };

 const handleDeleteSubscription = async () => {
 if (selectedSubscription) {
 try {
 await deleteSubscription(selectedSubscription.id);
 setSelectedSubscription(null);
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
 // 错误处理已在Hook中完成
 setSelectedSubscription(null);
 setIsEditModalOpen(false);
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
 targetSubscription.lastPaymentDate === newDates.lastPaymentDate &&
 targetSubscription.nextPaymentDate === newDates.nextPaymentDate
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

 const handleSortChange = (newSortConfig: SortConfig) => {
 setSortConfig(newSortConfig);
 };

 const handleSignOut = async () => {
 await signOut();
 // 可选：清空本地数据或保留
 // setSubscriptions([]);
 };

 // 刷新汇率
 const handleRefreshRates = async () => {
 try {
 const result = await getCachedExchangeRatesWithStatus(baseCurrency);
 setExchangeRates(result.rates);
 setExchangeRateSource(result.source);
 setExchangeRateError(result.error);
 } catch (error) {
 console.error('Failed to refresh exchange rates:', error);
 setExchangeRateSource('fallback');
 setExchangeRateError(error instanceof Error ? error.message : 'Failed to refresh exchange rates');
 throw error;
 }
 };

 // 导出数据
 const handleExportData = () => {
 try {
 exportData();
 } catch (error) {
 console.error('Failed to export data:', error);
 alert('Failed to export data. Please try again.');
 }
 };

 // 导入数据 - 打开文件选择器
 const handleImportData = () => {
 fileInputRef.current?.click();
 };

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
 alert(error instanceof Error ? error.message : 'Invalid import file');
 }

 // 重置文件输入，允许重复选择同一文件
 event.target.value = '';
 };

 // 确认导入
 const handleConfirmImport = async () => {
 if (!importPreviewData) return;

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

 alert('Data imported successfully!');
 } catch (error) {
 console.error('Failed to import data:', error);
 alert(error instanceof Error ? error.message : 'Failed to import data');
 }
 };

 // 显示加载状态
 if (loading) {
 return (
 <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
 <div className="text-center">
 <div className="w-8 h-8 border-4 border-emerald-600 dark:border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
 <p className="text-gray-600 dark:text-gray-400">Loading...</p>
 </div>
 </div>
 );
 }

 return (
 <>
 <div className="min-h-screen pb-20 relative overflow-hidden transition-colors duration-300">
 {/* Animated flowing gradient background */}
 <div className="fixed inset-0 -z-10 dark:opacity-0 animated-gradient-bg"></div>
 {/* Dark mode fallback */}
 <div className="fixed inset-0 -z-10 bg-gray-900 dark:opacity-100 opacity-0 transition-opacity duration-300"></div>
 <div className="px-4 py-8">
 <div className="max-w-7xl mx-auto space-y-8">
 {/* 移动端优化的头部布局 */}
 <div className="sticky top-4 z-50 p-4 sm:px-6 sm:py-4 mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-[#fcfcfc]/80 dark:bg-[#1a1c1e]/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-800/50 rounded-3xl shadow-fey"> <div className="flex items-center gap-3">
 <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
 Subscription Manager
 </h1>
 {subscriptions.length > 0 && (
 <button
 onClick={() => setIsAdvancedReportOpen(true)}
 className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1a1c1e] text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-apple transition-all text-sm font-medium"
 title="View Advanced Report"
 >
 <BarChart3 className="w-4 h-4"/>
 <span className="hidden sm:inline">Advanced Report</span>
 </button>
 )}
 </div>

 {/* 按钮组 */}
 <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
 {/* 始终显示用户菜单，无论是否登录 */}
 {config.features.authentication ? (
 <UserMenu
 user={user}
 userProfile={userProfile}
 syncStatus={syncStatus}
 lastSyncTime={lastSyncTime}
 onEditNickname={() => setIsEditNicknameModalOpen(true)}
 onEditEmail={() => setIsEditEmailModalOpen(true)}
 onEditPassword={() => setIsEditPasswordModalOpen(true)}
 onCategorySettings={() => setIsCategorySettingsModalOpen(true)}
 onExportData={handleExportData}
 onImportData={handleImportData}
 onNotificationSettings={() => setIsNotificationSettingsModalOpen(true)}
 onPricingClick={() => setIsPricingModalOpen(true)}
 onSignOut={handleSignOut}
 onSync={syncSubscriptions}
 onLogin={() => setIsAuthModalOpen(true)}
 />
 ) : (
 /* 无云同步功能时，使用简化的用户菜单（仅本地功能） */
 <UserMenu
 user={null}
 userProfile={null}
 syncStatus="idle"
 lastSyncTime={null}
 onEditNickname={() => {}}
 onEditEmail={() => {}}
 onEditPassword={() => {}}
 onCategorySettings={() => setIsCategorySettingsModalOpen(true)}
 onExportData={handleExportData}
 onImportData={handleImportData}
 onNotificationSettings={() => setIsNotificationSettingsModalOpen(true)}
 onPricingClick={() => setIsPricingModalOpen(true)}
 onSignOut={() => {}}
 onSync={() => {}}
 />
 )}

 <ThemeToggle theme={theme} onToggle={toggleTheme} />
 </div>
 </div>

 <Dashboard
 subscriptions={sortedSubscriptions}
 viewMode={viewMode}
 onViewModeChange={setViewMode}
 sortConfig={sortConfig}
 onSortChange={handleSortChange}
 selectedCategory={selectedCategory}
 onCategoryChange={setSelectedCategory}
 totalSubscriptions={subscriptions.length}
 baseCurrency={baseCurrency}
 onBaseCurrencyChange={setBaseCurrency}
 exchangeRates={exchangeRates}
 exchangeRateSource={exchangeRateSource}
 exchangeRateError={exchangeRateError}
 onRefreshRates={handleRefreshRates}
 />

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
 className="group h-[200px] sm:h-[250px] bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-fey p-4 sm:p-6 flex flex-col items-center justify-center gap-3 sm:gap-4 transition-all duration-300 hover:scale-105 hover:shadow-apple-lg"
 >
 <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#f4f5f7] dark:bg-[#202225] flex items-center justify-center group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10 transition-colors">
 <Plus className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 group-hover:text-emerald-600 dark:text-gray-500 dark:group-hover:text-emerald-400 transition-colors"/>
 </div>
 <p className="text-gray-600 dark:text-gray-300 font-medium text-sm sm:text-base text-center">
 {sortedSubscriptions.length === 0
 ?"Add your first subscription"
 :"Add a subscription"}
 </p>
 </button>
 </div>
 </div>
 </div>

 <AddSubscriptionModal
 isOpen={isAddModalOpen}
 onClose={() => setIsAddModalOpen(false)}
 onAdd={handleAddSubscription}
 categorySync={{
 createCategory
 }}
 isBarkEnabled={notificationSettings.barkPush.enabled}
 />

 <SubscriptionDetailsModal
 isOpen={selectedSubscription !== null}
 subscription={selectedSubscription!}
 onClose={() => setSelectedSubscription(null)}
 onEdit={handleEditClick}
 onDelete={handleDeleteSubscription}
 />

 {selectedSubscription && (
 <EditSubscriptionModal
 subscription={selectedSubscription}
 isOpen={isEditModalOpen}
 onClose={() => setIsEditModalOpen(false)}
 onEdit={handleEditSubscription}
 categorySync={{
 createCategory
 }}
 isBarkEnabled={notificationSettings.barkPush.enabled}
 />
 )}

 {config.features.authentication && (
 <AuthModal
 isOpen={isAuthModalOpen}
 onClose={() => setIsAuthModalOpen(false)}
 />
 )}

 {config.features.authentication && (
 <>
 <EditNicknameModal
 isOpen={isEditNicknameModalOpen}
 onClose={() => setIsEditNicknameModalOpen(false)}
 />
 <EditEmailModal
 isOpen={isEditEmailModalOpen}
 onClose={() => setIsEditEmailModalOpen(false)}
 currentEmail={user?.email || ''}
 onUpdateEmail={async (newEmail: string) => {
 const result = await updateUserEmail(newEmail);
 if (result.error) {
 throw new Error(result.error.message);
 }
 }}
 />
 <EditPasswordModal
 isOpen={isEditPasswordModalOpen}
 onClose={() => setIsEditPasswordModalOpen(false)}
 onUpdatePassword={async (newPassword: string) => {
 const result = await updateUserPassword(newPassword);
 if (result.error) {
 throw new Error(result.error.message);
 }
 }}
 />
 </>
 )}

 <CategorySettingsModal
 isOpen={isCategorySettingsModalOpen}
 onClose={() => setIsCategorySettingsModalOpen(false)}
 subscriptions={subscriptions}
 onCategoriesChanged={() => {
 // 类型变更时，重新加载订阅列表以确保UI更新
 setSubscriptions([...subscriptions]);
 }}
 onUpdateSubscriptions={async (updatedSubscriptions) => {
 await updateSubscriptionsBatch(updatedSubscriptions);
 }}
 categorySync={{
 createCategory,
 updateCategory,
 deleteCategory: deleteCategorySync,
 updateCategoriesOrder
 }}
 />

 <ImportDataModal
 isOpen={isImportModalOpen}
 onClose={() => {
 setIsImportModalOpen(false);
 setImportPreviewData(null);
 }}
 onConfirm={handleConfirmImport}
 previewData={importPreviewData}
 />

 {isNotificationSettingsModalOpen && (
 <Suspense
 fallback={(
  <LazyModalFallback
   title="Loading Notification Settings"
   description="Preparing your notification preferences..."
   onClose={() => setIsNotificationSettingsModalOpen(false)}
  />
 )}
 >
  <NotificationSettingsModal
  isOpen={isNotificationSettingsModalOpen}
  onClose={() => setIsNotificationSettingsModalOpen(false)}
  settings={notificationSettings}
  onOpenAuth={() => setIsAuthModalOpen(true)}
  onSave={async (newSettings) => {
  setNotificationSettings(newSettings);
  saveNotificationSettings(newSettings);

  // 如果用户已登录且云同步可用，同时保存到云端
  if (user && config.hasSupabaseConfig) {
  try {
  await NotificationSettingsService.saveSettings(newSettings);
  } catch (error) {
  console.error('Failed to sync notification settings to cloud:', error);
  }
  }
  }}
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
   title="Loading Report"
   description="Preparing analytics and charts..."
   onClose={() => setIsAdvancedReportOpen(false)}
  />
 )}
 >
  <AdvancedReport
  subscriptions={subscriptions}
  baseCurrency={baseCurrency}
  exchangeRates={exchangeRates}
  onClose={() => setIsAdvancedReportOpen(false)}
  />
 </Suspense>
 )}

 {/* Pricing Modal */}
 {isPricingModalOpen && (
 <Suspense
 fallback={(
  <LazyModalFallback
   title="Loading Pricing"
   description="Fetching plan details..."
   onClose={() => setIsPricingModalOpen(false)}
  />
 )}
 >
  <PricingModal
  isOpen={isPricingModalOpen}
  onClose={() => setIsPricingModalOpen(false)}
  onUpgrade={() => {
  setIsPricingModalOpen(false);
  if (!user) {
  setIsAuthModalOpen(true);
  }
  }}
  />
 </Suspense>
 )}
 </div>

 <Footer />
 </>
 );
}
