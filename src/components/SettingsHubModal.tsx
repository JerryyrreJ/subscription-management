import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, User, Settings, Folder, Bell, Code2 } from 'lucide-react';
import { AccountSettingsContent } from './settings/AccountSettingsContent';
import { GeneralSettingsContent } from './settings/GeneralSettingsContent';
import { CategorySettingsModal } from './CategorySettingsModal';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import { DeveloperApiModal } from './DeveloperApiModal';
import { CloudMutationResult, ReminderSettings, Subscription } from '../types';
import { Category } from '../utils/categories';

export type SettingsTab = 'general' | 'account' | 'categories' | 'notifications' | 'api';

interface CategorySyncMethods {
  createCategory: (category: Category) => Promise<CloudMutationResult<Category>>;
  updateCategory: (category: Category) => Promise<CloudMutationResult<Category>>;
  deleteCategory: (categoryId: string) => Promise<CloudMutationResult<void>>;
  updateCategoriesOrder: (categories: Category[]) => Promise<CloudMutationResult<Category[]>>;
}

interface SettingsHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: SettingsTab;
  
  // User/Auth
  user: { email?: string } | null;
  userProfile: { nickname?: string } | null;
  accessToken?: string;
  onOpenAuth: () => void;
  
  // Account Callbacks
  onUpdateNickname: (newNickname: string) => Promise<void>;
  onUpdateEmail: (newEmail: string) => Promise<void>;
  onUpdatePassword: (newPassword: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  
  // General Callbacks
  onExportData: () => void;
  onImportData: () => void;
  
  // Category Props
  subscriptions: Subscription[];
  onCategoriesChanged?: () => void;
  onUpdateSubscriptions?: (updatedSubscriptions: Subscription[]) => Promise<void>;
  categorySync?: CategorySyncMethods;
  
  // Notification Props
  notificationSettings: ReminderSettings;
  onSaveNotificationSettings: (settings: ReminderSettings) => void;
}

export function SettingsHubModal({
  isOpen,
  onClose,
  activeTab: initialTab = 'general',
  user,
  userProfile,
  accessToken,
  onOpenAuth,
  onUpdateNickname,
  onUpdateEmail,
  onUpdatePassword,
  onDeleteAccount,
  onExportData,
  onImportData,
  subscriptions,
  onCategoriesChanged,
  onUpdateSubscriptions,
  categorySync,
  notificationSettings,
  onSaveNotificationSettings
}: SettingsHubModalProps) {
  const { t } = useTranslation(['settingsHub']);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: t('settingsHub:tabs.general'), icon: Settings, requiresAuth: false },
    { id: 'account', label: t('settingsHub:tabs.account'), icon: User, requiresAuth: true },
    { id: 'categories', label: t('settingsHub:tabs.categories'), icon: Folder, requiresAuth: false },
    { id: 'notifications', label: t('settingsHub:tabs.notifications'), icon: Bell, requiresAuth: false },
    { id: 'api', label: t('settingsHub:tabs.api'), icon: Code2, requiresAuth: true },
  ] as const;

  const visibleTabs = tabs.filter(tab => !tab.requiresAuth || user);
  const selectedTab = visibleTabs.some(tab => tab.id === activeTab) ? activeTab : 'general';

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-2xl flex items-center justify-center z-[100] p-2 sm:p-6 transition-all duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-[#fcfcfc]/95 dark:bg-[#0a0a0a]/95 backdrop-blur-3xl rounded-3xl sm:rounded-[2rem] shadow-apple-xl border border-gray-200/50 dark:border-white/10 w-full max-w-6xl h-[92vh] sm:h-[85vh] flex flex-col sm:flex-row overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-full sm:w-72 flex-shrink-0 bg-gray-50/50 dark:bg-white/[0.02] border-b sm:border-b sm:border-b-transparent sm:border-r border-gray-200/50 dark:border-white/10 flex flex-col">
          <div className="p-4 sm:p-6 pb-2 sm:pb-4">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
              {t('settingsHub:title')}
            </h2>
          </div>
          <div className="flex sm:block sm:flex-1 overflow-x-auto sm:overflow-y-auto px-3 pb-3 sm:pb-0 gap-2 sm:space-y-1">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = selectedTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`shrink-0 sm:w-full flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive 
                      ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm border border-gray-200/50 dark:border-white/5' 
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          
          {/* User Profile Summary at bottom of sidebar */}
          {user && (
            <div className="hidden sm:flex p-4 m-3 mt-auto bg-white dark:bg-white/5 rounded-2xl border border-gray-200/50 dark:border-white/10 items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold text-xs uppercase">
                {userProfile?.nickname?.[0] || user.email?.[0] || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {userProfile?.nickname || t('settingsHub:profileFallback')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent">
          <div className="flex justify-end p-3 sm:p-6 pb-0">
            <button
              onClick={onClose}
              aria-label={t('settingsHub:close')}
              className="p-2 rounded-2xl bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-10 pb-8 sm:pb-10">
            {selectedTab === 'general' && (
              <GeneralSettingsContent 
                onExportData={onExportData} 
                onImportData={onImportData} 
              />
            )}
            
            {selectedTab === 'account' && user && (
              <AccountSettingsContent
                userEmail={user.email || ''}
                userNickname={userProfile?.nickname || ''}
                onUpdateNickname={onUpdateNickname}
                onUpdateEmail={onUpdateEmail}
                onUpdatePassword={onUpdatePassword}
                onDeleteAccount={onDeleteAccount}
              />
            )}
            
            {selectedTab === 'categories' && (
              <CategorySettingsModal
                isOpen={true}
                onClose={() => {}}
                subscriptions={subscriptions}
                onCategoriesChanged={onCategoriesChanged}
                onUpdateSubscriptions={onUpdateSubscriptions}
                categorySync={categorySync}
                isStandalone={false}
              />
            )}
            
            {selectedTab === 'notifications' && (
              <NotificationSettingsModal
                isOpen={true}
                onClose={() => {}}
                settings={notificationSettings}
                onSave={onSaveNotificationSettings}
                onOpenAuth={onOpenAuth}
                isStandalone={false}
              />
            )}
            
            {selectedTab === 'api' && user && (
              <DeveloperApiModal
                isOpen={true}
                onClose={() => {}}
                accessToken={accessToken}
                onOpenAuth={onOpenAuth}
                isStandalone={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
