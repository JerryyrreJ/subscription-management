import { useState, useEffect } from 'react';
import { Plus, LogOut, User, Edit3 } from 'lucide-react';
import { Subscription, ViewMode, Theme, SortConfig } from './types';
import { Dashboard } from './components/Dashboard';
import { AddSubscriptionModal } from './components/AddSubscriptionModal';
import { SubscriptionCard } from './components/SubscriptionCard';
import { SubscriptionDetailsModal } from './components/SubscriptionDetailsModal';
import { EditSubscriptionModal } from './components/EditSubscriptionModal';
import { ThemeToggle } from './components/ThemeToggle';
import { AuthModal } from './components/AuthModal';
import { EditNicknameModal } from './components/EditNicknameModal';
import { SyncIndicator } from './components/SyncIndicator';
import { useAuth } from './contexts/AuthContext';
import { useSubscriptionSync } from './hooks/useSubscriptionSync';
import { loadSubscriptions, saveSubscriptions } from './utils/storage';
import { convertCurrency, DEFAULT_CURRENCY } from './utils/currency';
import { Footer } from './components/Footer';
import { config } from './lib/config';

export function App() {
  const { user, userProfile, loading, signOut } = useAuth();
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasInitialSync, setHasInitialSync] = useState(false);

  // 使用数据同步Hook
  const {
    syncStatus,
    syncSubscriptions,
    uploadLocalData,
    createSubscription,
    updateSubscription,
    deleteSubscription
  } = useSubscriptionSync(user, subscriptions, setSubscriptions);

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
        case 'amount':
          // 将所有价格转换为CNY进行比较
          const amountA = a.currency === DEFAULT_CURRENCY
            ? a.amount
            : convertCurrency(a.amount, a.currency, DEFAULT_CURRENCY, {}, DEFAULT_CURRENCY);
          const amountB = b.currency === DEFAULT_CURRENCY
            ? b.amount
            : convertCurrency(b.amount, b.currency, DEFAULT_CURRENCY, {}, DEFAULT_CURRENCY);
          comparison = amountA - amountB;
          break;
        case 'nextPaymentDate':
          const dateA = new Date(a.nextPaymentDate).getTime();
          const dateB = new Date(b.nextPaymentDate).getTime();
          comparison = dateA - dateB;
          break;
        default:
          comparison = 0;
      }

      return config.sortOrder === 'desc' ? -comparison : comparison;
    });
  };

  // 获取排序后的订阅列表
  const sortedSubscriptions = sortSubscriptions(subscriptions, sortConfig);

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
  }, []);

  // 主题切换效果
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 在线状态监听
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 用户登录后的数据同步 - 只执行一次
  useEffect(() => {
    if (!user || hasInitialSync) return; // 如果用户未登录或已经同步过，直接返回

    // 标记开始同步，防止重复
    setHasInitialSync(true);

    // 使用一个标志来防止重复执行
    const performInitialSync = async () => {
      const currentSubscriptions = loadSubscriptions(); // 直接从存储加载，避免状态依赖
      const hasLocalData = currentSubscriptions.some(sub => sub.id.length === 36); // UUID格式检查

      if (currentSubscriptions.length > 0 && hasLocalData) {
        console.log('User logged in with local data, uploading...');
        try {
          await uploadLocalData(currentSubscriptions);
        } catch (error) {
          console.error('Failed to upload local data:', error);
        }
      } else if (currentSubscriptions.length === 0) {
        console.log('User logged in without local data, syncing from cloud...');
        try {
          await syncSubscriptions();
        } catch (error) {
          console.error('Failed to sync from cloud:', error);
        }
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
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Subscription Manager
              </h1>

              {/* 移动端按钮组 */}
              <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                {config.features.authentication && user ? (
                  <>
                    {/* 移动端简化的用户信息 */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      <SyncIndicator
                        status={syncStatus}
                        isOnline={isOnline}
                        onSync={syncSubscriptions}
                      />

                      {/* 桌面端显示完整用户信息 */}
                      <div className="hidden sm:flex items-center space-x-2 text-sm">
                        <User className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-gray-600 dark:text-gray-400 max-w-32 truncate" title={user.email}>
                          {userProfile?.nickname || user.email}
                        </span>
                        <button
                          onClick={() => setIsEditNicknameModalOpen(true)}
                          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          title="Edit nickname"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 移动端只显示用户图标和编辑按钮 */}
                      <div className="flex sm:hidden items-center gap-1">
                        <User className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <button
                          onClick={() => setIsEditNicknameModalOpen(true)}
                          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
                          title="Edit profile"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleSignOut}
                      className="flex items-center space-x-1 text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors"
                      title="Sign out"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="hidden sm:inline">Sign out</span>
                    </button>
                  </>
                ) : config.features.authentication ? (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg transition-colors font-medium text-sm"
                  >
                    <span className="hidden sm:inline">Login to Sync</span>
                    <span className="sm:hidden">Login</span>
                  </button>
                ) : null}

                <ThemeToggle theme={theme} onToggle={toggleTheme} />
              </div>
            </div>

            <Dashboard
              subscriptions={sortedSubscriptions}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortConfig={sortConfig}
              onSortChange={handleSortChange}
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
          />
        )}

        {config.features.authentication && (
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
          />
        )}

        {config.features.authentication && (
          <EditNicknameModal
            isOpen={isEditNicknameModalOpen}
            onClose={() => setIsEditNicknameModalOpen(false)}
          />
        )}
      </div>

      <Footer />
    </>
  );
}