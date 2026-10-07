import { useState, useRef, useEffect, useId } from 'react';
import { ChevronRight, Cloud, Loader2, LogIn, LogOut, RotateCcw, Settings, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PremiumEntry } from './settings/PremiumEntry';

interface UserMenuProps {
  user: { email?: string } | null;
  userProfile: { nickname?: string; is_premium?: boolean } | null;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncTime: Date | null;
  onOpenSettings: () => void;
  onPricingClick?: () => void;
  onSignOut: () => void;
  onSync: () => void;
  onLogin?: () => void;
}

export function UserMenu({ user, userProfile, syncStatus, lastSyncTime, onOpenSettings, onPricingClick, onSignOut, onSync, onLogin }: UserMenuProps) {
  const { t } = useTranslation(['userMenu', 'settingsHub']);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;
    popupRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const runAction = (action: () => void) => {
    setIsOpen(false);
    triggerRef.current?.focus();
    action();
  };

  const getTimeAgo = () => {
    if (!lastSyncTime) return t('userMenu:neverSynced');
    const seconds = Math.max(0, Math.floor((Date.now() - lastSyncTime.getTime()) / 1000));
    if (seconds < 60) return t('userMenu:syncedSecondsAgo', { count: seconds });
    if (seconds < 3600) return t('userMenu:syncedMinutesAgo', { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return t('userMenu:syncedHoursAgo', { count: Math.floor(seconds / 3600) });
    return t('userMenu:syncedDaysAgo', { count: Math.floor(seconds / 86400) });
  };

  return (
    <div
      className="relative"
      ref={menuRef}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          if (!isOpen) { setIsOpen(true); return; }
          const items = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('userMenu:accountMenu')}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        className="settings-icon-button app-theme-chip"
      >
        <User size={17} aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          ref={popupRef}
          id={menuId}
          role="menu"
          aria-label={t('userMenu:accountMenu')}
          className="account-menu absolute left-0 sm:left-auto sm:right-0 mt-2 w-72 max-w-[calc(100vw-3rem)] origin-top-left sm:origin-top-right animate-dropdown"
        >
          <div className="account-menu-profile">
            <div className="settings-avatar" aria-hidden="true">
              {user ? (userProfile?.nickname?.[0] || user.email?.[0] || 'U').toUpperCase() : <User size={19} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white break-words app-theme-text-primary">
                {user ? userProfile?.nickname || user.email : t('userMenu:localAccount')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all app-theme-text-muted">
                {user ? user.email : t('userMenu:localDescription')}
              </p>
            </div>
          </div>
          {user ? (
            <div className="account-menu-sync">
              {syncStatus === 'syncing' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Cloud size={15} aria-hidden="true" />}
              <span role="status" className={`min-w-0 flex-1 ${syncStatus === 'error' ? 'text-red-600 dark:text-red-400' : ''}`}>
                {syncStatus === 'syncing' ? t('userMenu:syncing') : syncStatus === 'error' ? t('userMenu:syncFailed') : getTimeAgo()}
              </span>
              <button type="button" role="menuitem" disabled={syncStatus === 'syncing'} onClick={onSync}
                aria-label={t('userMenu:syncNow')} title={t('userMenu:syncNow')} className="account-menu-sync-button">
                <RotateCcw size={14} aria-hidden="true" />
              </button>
            </div>
          ) : onLogin && (
            <button role="menuitem" className="account-menu-item" onClick={() => runAction(onLogin)}>
              <LogIn size={17} aria-hidden="true" />{t('userMenu:loginToSync')}
              <ChevronRight size={15} className="ml-auto" aria-hidden="true" />
            </button>
          )}
          <button role="menuitem" className="account-menu-item" onClick={() => runAction(onOpenSettings)}>
            <Settings size={17} aria-hidden="true" />{t('settingsHub:title')}
            <ChevronRight size={15} className="ml-auto" aria-hidden="true" />
          </button>
          {onPricingClick && <PremiumEntry role="menuitem" isPremium={userProfile?.is_premium} onClick={() => runAction(onPricingClick)} />}
          {user && (
            <div className="account-menu-footer">
              <button role="menuitem" className="account-menu-item account-menu-signout" onClick={() => runAction(onSignOut)}>
                <LogOut size={17} aria-hidden="true" />{t('userMenu:signOut')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
