import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Subscription, ViewMode, Theme, SortConfig } from './types';
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
import { UserMenu } from './components/UserMenu';
import { useAuth } from './contexts/AuthContext';
import { useSubscriptionSync } from './hooks/useSubscriptionSync';
import { loadSubscriptions, saveSubscriptions } from './utils/storage';
import { convertCurrency, DEFAULT_CURRENCY } from './utils/currency';
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
  const [hasInitialSync, setHasInitialSync] = useState(false);

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

              {/* 按钮组 */}
              <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                {config.features.authentication && user ? (
                  <UserMenu
                    user={user}
                    userProfile={userProfile}
                    syncStatus={syncStatus}
                    lastSyncTime={lastSyncTime}
                    onEditNickname={() => setIsEditNicknameModalOpen(true)}
                    onEditEmail={() => setIsEditEmailModalOpen(true)}
                    onEditPassword={() => setIsEditPasswordModalOpen(true)}
                    onSignOut={handleSignOut}
                    onSync={syncSubscriptions}
                  />
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
      </div>

      <Footer />
    </>
  );
}