import { useState, useEffect, useRef } from 'react';
import { Plus, BarChart3 } from 'lucide-react';
import { Subscription, ViewMode, Theme, SortConfig, ReminderSettings, Currency, ExchangeRates } from './types';
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
import { NotificationSettingsModal } from './components/NotificationSettingsModal';
import { AdvancedReport } from './components/AdvancedReport';
import { UserMenu } from './components/UserMenu';
import { useAuth } from './contexts/AuthContext';
import { useSubscriptionSync } from './hooks/useSubscriptionSync';
import { useCategorySync } from './hooks/useCategorySync';
import { loadSubscriptions, saveSubscriptions } from './utils/storage';
import { loadCategories } from './utils/categories';
import { CategoryService } from './services/categoryService';
import { convertCurrency, DEFAULT_CURRENCY, getCachedExchangeRates } from './utils/currency';
import { exportData, importData, validateImportData, ExportData } from './utils/exportImport';
import { loadNotificationSettings, saveNotificationSettings, checkAndSendNotifications, cleanupNotificationHistory } from './utils/notificationChecker';
import { Footer } from './components/Footer';
import { config } from './lib/config';

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
  const [baseCurrency, setBaseCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({});

  // 使用数据同步Hook
  const {
    syncStatus,
    lastSyncTime,
    syncSubscriptions,
    uploadLocalData,
    createSubscription,
    updateSubscription,
    deleteSubscription
  } = useSubscriptionSync(user, subscriptions, setSubscriptions);

  // 使用类别同步Hook
  const {
    syncStatus: categorySyncStatus,
    lastSyncTime: categoryLastSyncTime,
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

  // 排序函数
  const sortSubscriptions = (subs: Subscription[], config: SortConfig): Subscription[] => {
    return [...subs].sort((a, b) => {
      let comparison = 0;

      switch (config.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'amount': {
          // 计算每日价格进行比较
          const getDailyPrice = (sub: Subscription) => {
            // 先转换为基准货币
            const amount = sub.currency === DEFAULT_CURRENCY
              ? sub.amount
              : convertCurrency(sub.amount, sub.currency, DEFAULT_CURRENCY, {}, DEFAULT_CURRENCY);

            // 转换为每日价格
            if (sub.period === 'monthly') {
              return amount / 30; // 月费 / 30天
            } else if (sub.period === 'yearly') {
              return amount / 365; // 年费 / 365天
            } else if (sub.period === 'custom') {
              const daysInPeriod = parseInt(sub.customDate || '30');
              return amount / daysInPeriod; // 自定义周期费用 / 自定义天数
            }
            return amount / 30; // 默认按月计算
          };

          const dailyPriceA = getDailyPrice(a);
          const dailyPriceB = getDailyPrice(b);
          comparison = dailyPriceA - dailyPriceB;
          break;
        }
        case 'nextPaymentDate': {
          const dateA = new Date(a.nextPaymentDate).getTime();
          const dateB = new Date(b.nextPaymentDate).getTime();
          comparison = dateA - dateB;
          break;
        }
        case 'createdAt': {
          const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          comparison = createdA - createdB;
          break;
        }
        default:
          comparison = 0;
      }

      return config.sortOrder === 'desc' ? -comparison : comparison;
    });
  };

  // 获取筛选后的订阅列表
  const filteredSubscriptions = selectedCategory
    ? subscriptions.filter(sub => sub.category === selectedCategory)
    : subscriptions;

  // 获取排序后的订阅列表
  const sortedSubscriptions = sortSubscriptions(filteredSubscriptions, sortConfig);

  // 初始化数据和主题
  useEffect(() => {
    const localSubs = loadSubscriptions();
    setSubscriptions(localSubs);

    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }

    // 加载汇率数据
    getCachedExchangeRates(baseCurrency).then(rates => {
      setExchangeRates(rates);
    }).catch(error => {
      console.error('Failed to load exchange rates:', error);
    });
  }, [baseCurrency]);

  // 主题切换效果
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 通知检查和清理
  useEffect(() => {
    // 初始检查
    checkAndSendNotifications(subscriptions, notificationSettings);

    // 定期检查 - 每小时检查一次
    const notificationInterval = setInterval(() => {
      checkAndSendNotifications(subscriptions, notificationSettings);
    }, 60 * 60 * 1000); // 1 hour

    // 每天清理一次过期的通知历史
    const cleanupInterval = setInterval(() => {
      cleanupNotificationHistory(notificationSettings);
    }, 24 * 60 * 60 * 1000); // 24 hours

    return () => {
      clearInterval(notificationInterval);
      clearInterval(cleanupInterval);
    };
  }, [subscriptions, notificationSettings]);

  // 用户登录后的数据同步 - 只执行一次
  useEffect(() => {
    if (!user || hasInitialSync) return; // 如果用户未登录或已经同步过，直接返回

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
      } catch (error) {
        console.error('Failed to perform initial sync:', error);
      }
    };

    performInitialSync();
  }, [user]); // 只依赖user，避免循环

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

  const handleAutoRenew = (
    subscriptionId: string,
    newDates: { lastPaymentDate: string; nextPaymentDate: string }
  ) => {
    const updatedSubscriptions = subscriptions.map(sub =>
      sub.id === subscriptionId
        ? { ...sub, ...newDates }
        : sub
    );
    setSubscriptions(updatedSubscriptions);
    saveSubscriptions(updatedSubscriptions);
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
      // 创建临时文件对象用于导入
      const blob = new Blob([JSON.stringify(importPreviewData)], { type: 'application/json' });
      const file = new File([blob], 'import.json', { type: 'application/json' });

      await importData(file);

      // 重新加载数据
      const newSubscriptions = loadSubscriptions();
      setSubscriptions(newSubscriptions);

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
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen pb-20 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <div className="px-4 py-8">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* 移动端优化的头部布局 */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  Subscription Manager
                </h1>
                {subscriptions.length > 0 && (
                  <button
                    onClick={() => setIsAdvancedReportOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl text-sm font-medium"
                    title="查看高级报表"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span className="hidden sm:inline">高级报表</span>
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
                className="group h-[200px] sm:h-[250px] bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 flex flex-col items-center justify-center gap-3 sm:gap-4 transition-all duration-300 hover:scale-105 hover:shadow-xl"
              >
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800 transition-colors">
                  <Plus className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="text-gray-600 dark:text-gray-300 font-medium text-sm sm:text-base text-center">
                  {sortedSubscriptions.length === 0
                    ? "Add your first subscription"
                    : "Add a subscription"}
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
          onUpdateSubscriptions={(updatedSubscriptions) => {
            setSubscriptions(updatedSubscriptions);
            saveSubscriptions(updatedSubscriptions);
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

        <NotificationSettingsModal
          isOpen={isNotificationSettingsModalOpen}
          onClose={() => setIsNotificationSettingsModalOpen(false)}
          settings={notificationSettings}
          onSave={(newSettings) => {
            setNotificationSettings(newSettings);
            saveNotificationSettings(newSettings);
          }}
        />

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
          <AdvancedReport
            subscriptions={subscriptions}
            baseCurrency={baseCurrency}
            exchangeRates={exchangeRates}
            onClose={() => setIsAdvancedReportOpen(false)}
          />
        )}
      </div>

      <Footer />
    </>
  );
}