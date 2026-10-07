import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, User, Settings, Folder, Bell, Code2, SlidersHorizontal } from 'lucide-react';
import { AccountSettingsContent } from './settings/AccountSettingsContent';
import { GeneralSettingsContent } from './settings/GeneralSettingsContent';
import { CategorySettingsModal } from './CategorySettingsModal';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import { DeveloperApiModal } from './DeveloperApiModal';
import { PremiumEntry } from './settings/PremiumEntry';
import { CloudMutationResult, ReminderSettings, Subscription, Theme } from '../types';
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
  userProfile: { nickname?: string; is_premium?: boolean } | null;
  accessToken?: string;
  onOpenAuth: () => void;
  
  // Account Callbacks
  onUpdateNickname: (newNickname: string) => Promise<void>;
  onUpdateEmail: (newEmail: string) => Promise<void>;
  onUpdatePassword: (newPassword: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onPricingClick: () => void;

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
  theme,
  onThemeChange,
  onPricingClick,
  onExportData,
  onImportData,
  subscriptions,
  onCategoriesChanged,
  onUpdateSubscriptions,
  categorySync,
  notificationSettings,
  onSaveNotificationSettings
}: SettingsHubModalProps) {
 useModalScrollLock(isOpen);
  const { t } = useTranslation(['settingsHub', 'userMenu']);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [isOpen]);

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
    panelRef.current?.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTab, isOpen]);

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
      className="settings-overlay fixed inset-0 mobile-modal-viewport z-[100]"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={event => {
        // Child confirmation dialogs handle their own keyboard interaction.
        if ((event.target as HTMLElement).closest('.mobile-modal-viewport') !== event.currentTarget) return;
        if (document.querySelector('[aria-modal="true"]:not([data-settings-dialog])')) return;
        if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? [])
          .filter(item => item.getClientRects().length > 0 && item.tabIndex >= 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="settings-title" data-settings-dialog className="settings-shell">
        <header className="settings-header">
          <div className="settings-section-icon"><SlidersHorizontal size={19} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="settings-title" className="text-lg font-semibold tracking-tight">{t('settingsHub:title')}</h2>
            <p className="text-xs app-theme-text-muted mt-0.5">{t('settingsHub:subtitle')}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('settingsHub:close')} className="settings-icon-button app-theme-chip">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="settings-body">
          <aside className="settings-sidebar">
            <div className="settings-nav" role="tablist" aria-label={t('settingsHub:title')}
              onKeyDown={event => {
                if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const current = visibleTabs.findIndex(tab => tab.id === selectedTab);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length - 1
                  : (current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + visibleTabs.length) % visibleTabs.length;
                setActiveTab(visibleTabs[next].id);
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
              }}>
              {visibleTabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} type="button" role="tab" id={`settings-tab-${tab.id}`}
                    aria-selected={selectedTab === tab.id} aria-controls="settings-content" tabIndex={selectedTab === tab.id ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)} className="settings-nav-item">
                    <Icon size={17} aria-hidden="true" />{tab.label}
                  </button>
                );
              })}
            </div>
            <div className="settings-sidebar-bottom">
              <PremiumEntry isPremium={userProfile?.is_premium} onClick={onPricingClick} />
              <div className="settings-profile-summary">
                <div className="settings-avatar" aria-hidden="true">{user ? (userProfile?.nickname?.[0] || user.email?.[0] || 'U').toUpperCase() : <User size={16} />}</div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user ? userProfile?.nickname || t('settingsHub:profileFallback') : t('userMenu:localAccount')}</p>
                  <p className="truncate text-xs app-theme-text-muted mt-0.5">{user?.email || t('userMenu:localDescription')}</p>
                </div>
              </div>
            </div>
          </aside>
          <div ref={contentRef} id="settings-content" role="tabpanel" aria-labelledby={`settings-tab-${selectedTab}`} tabIndex={0} className="settings-content">
            {selectedTab === 'general' && (
              <GeneralSettingsContent
                theme={theme}
                onThemeChange={onThemeChange}
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
