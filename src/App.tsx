import { useState, useEffect } from 'react';
import { Plus, LogOut, User, Edit3 } from 'lucide-react';
import { Subscription, ViewMode, Theme } from './types';
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
import { Footer } from './components/Footer';
import { config } from './lib/config';

export function App() {
  const { user, userProfile, loading, signOut } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('monthly');
  const [theme, setTheme] = useState<Theme>('light');
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

    const hasLocalData = subscriptions.some(sub => sub.id.length === 36); // UUID格式检查

    if (subscriptions.length > 0 && hasLocalData) {
      console.log('User logged in with local data, uploading...');
      uploadLocalData(subscriptions).finally(() => setHasInitialSync(true));
    } else if (subscriptions.length === 0) {
      console.log('User logged in without local data, syncing from cloud...');
      syncSubscriptions().finally(() => setHasInitialSync(true));
    } else {
      // 如果有数据但不是本地生成的，直接标记为已同步
      setHasInitialSync(true);
    }
  }, [user, hasInitialSync]); // 添加hasInitialSync到依赖

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
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Subscription Manager
              </h1>
              <div className="flex items-center space-x-4">
                {config.features.authentication && user ? (
                  <div className="flex items-center space-x-3">
                    <SyncIndicator
                      status={syncStatus}
                      isOnline={isOnline}
                      onSync={syncSubscriptions}
                    />
                    <div className="flex items-center space-x-2 text-sm">
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
                    <button
                      onClick={handleSignOut}
                      className="flex items-center space-x-1 text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors"
                      title="Sign out"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                ) : config.features.authentication ? (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
                  >
                    Login to Sync
                  </button>
                ) : null}
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
              </div>
            </div>

            <Dashboard
              subscriptions={subscriptions}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />

            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {subscriptions.map((subscription, index) => (
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
                className="group h-[250px] bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 flex flex-col items-center justify-center gap-4 transition-all duration-300 hover:scale-105 hover:shadow-xl"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800 transition-colors">
                  <Plus className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <p className="text-gray-600 dark:text-gray-300 font-medium">
                  {subscriptions.length === 0
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