import { useState, useRef, useEffect } from 'react';
import { DollarSign, LogIn, LogOut, RotateCcw, Settings, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UserProfile {
 nickname?: string;
}

interface User {
 email?: string;
}

interface UserMenuProps {
 user: User | null; // 改为可选
 userProfile: UserProfile | null;
 syncStatus: 'idle' | 'syncing' | 'success' | 'error';
 lastSyncTime: Date | null;
 onOpenSettings: () => void;
 onPricingClick?: () => void; // 新增定价页面
 onSignOut: () => void;
 onSync: () => void;
 onLogin?: () => void; // 新增登录回调
}

export function UserMenu({
 user,
 userProfile,
 syncStatus,
 lastSyncTime,
 onOpenSettings,
 onPricingClick,
 onSignOut,
 onSync,
 onLogin
}: UserMenuProps) {
 const { t } = useTranslation(['userMenu', 'app']);
 const [isOpen, setIsOpen] = useState(false);
 const [isClosing, setIsClosing] = useState(false);
 const menuRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 function handleClickOutside(event: MouseEvent) {
 if (isOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
 closeMenu();
 }
 }

 document.addEventListener('mousedown', handleClickOutside);
 return () => {
 document.removeEventListener('mousedown', handleClickOutside);
 };
 }, [isOpen]);

 const closeMenu = () => {
 setIsClosing(true);
 setTimeout(() => {
 setIsOpen(false);
 setIsClosing(false);
 }, 200); // 与动画时长一致
 };

 const toggleMenu = () => {
 if (isOpen) {
 closeMenu();
 } else {
 setIsOpen(true);
 }
 };

 const handleMenuItemClick = (action: () => void) => {
 action();
 closeMenu();
 };

 const getTimeAgo = (date: Date | null): string => {
 if (!date) return t('userMenu:neverSynced');

 const now = new Date();
 const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

 if (diffInSeconds < 60) {
 return t('userMenu:syncedSecondsAgo', { count: diffInSeconds });
 } else if (diffInSeconds < 3600) {
 const minutes = Math.floor(diffInSeconds / 60);
 return t('userMenu:syncedMinutesAgo', { count: minutes });
 } else if (diffInSeconds < 86400) {
 const hours = Math.floor(diffInSeconds / 3600);
 return t('userMenu:syncedHoursAgo', { count: hours });
 } else {
 const days = Math.floor(diffInSeconds / 86400);
 return t('userMenu:syncedDaysAgo', { count: days });
 }
 };

 const syncButtonClasses = [
 'mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-2xl border shadow-sm',
 'transition-all duration-200 ease-out',
 'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
 'active:scale-[0.985]',
 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 hover:text-emerald-800 hover:-translate-y-0.5',
 'dark:bg-emerald-400/10 dark:border-emerald-300/20 dark:text-emerald-300 dark:hover:bg-emerald-400/20 dark:hover:border-emerald-200/30 dark:hover:text-emerald-200 dark:focus-visible:ring-offset-[#1a1c1e]' ].join(' ');

 return (
 <div className="relative"ref={menuRef}>
 {/* 用户头像按钮 */}
 <button
 onClick={toggleMenu}
 className="p-2 rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-apple hover:shadow-fey hover:-translate-y-0.5 transition-all duration-200 ease-in-out app-dark-chip"
 >
 <div className="w-5 h-5 flex items-center justify-center">
 <User className="w-4 h-4 text-emerald-700 dark:text-zinc-400 app-dark-text-secondary"/>
 </div>
 </button>

 {/* 下拉菜单 */}
 {(isOpen || isClosing) && (
 <div className={`absolute right-0 mt-2 w-64 bg-white dark:bg-[#1a1c1e] rounded-2xl shadow-fey border border-gray-200 dark:border-gray-700 p-2 z-50 flex flex-col gap-1 app-dark-panel ${
 isClosing ? 'animate-dropdown-close' : 'animate-dropdown'
 }`}>
 {/* 用户信息头部 - 根据登录状态显示不同内容 */}
 {user ? (
 <>
 <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
 <div className="text-center">
 <p className="text-sm font-medium text-gray-900 dark:text-white">
 {userProfile?.nickname || user.email}
 </p>
 <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
 {user.email}
 </p>
 </div>
 </div>

 {/* 同步状态 */}
 <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className={`w-2 h-2 rounded-full ${
 syncStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' :
 syncStatus === 'success' ? 'bg-green-500' :
 syncStatus === 'error' ? 'bg-red-500' :
 'bg-gray-400'
 }`} />
 <span className="text-sm text-gray-700 dark:text-gray-300">
 {syncStatus === 'syncing' ? t('userMenu:syncing') :
 syncStatus === 'error' ? t('userMenu:syncFailed') :
 getTimeAgo(lastSyncTime)}
 </span>
 </div>
 </div>
 {syncStatus !== 'syncing' && (
 <button
 onClick={() => handleMenuItemClick(onSync)}
 className={syncButtonClasses}
 >
 <RotateCcw className="w-3 h-3"/>
 {t('userMenu:syncNow')}
 </button>
 )}
 </div>
 </>
 ) : (
 /* 未登录时显示登录提示 */
 <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
 <button
 onClick={() => {
 closeMenu();
 onLogin?.();
 }}
 className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 text-white rounded-2xl transition-colors font-medium"
 >
 <LogIn className="w-4 h-4"/>
 {t('userMenu:loginToSync')}
 </button>
 </div>
 )}

    {/* 菜单项 */}
    <div className="py-1">
      <button
        onClick={() => handleMenuItemClick(onOpenSettings)}
        className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Settings className="w-4 h-4 text-gray-400"/>
        {t('app:settings', 'Settings')}
      </button>

      {onPricingClick && (
        <button
          onClick={() => handleMenuItemClick(onPricingClick)}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-2xl text-amber-700 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
        >
          <DollarSign className="w-4 h-4"/>
          {t('userMenu:pricing', 'Pricing & Premium')}
        </button>
      )}



 {/* 登出按钮 - 仅已登录时显示 */}
 {user && (
 <>
 <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

 <button
 onClick={() => handleMenuItemClick(onSignOut)}
 className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-2xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
 >
 <LogOut className="w-4 h-4"/>
 {t('userMenu:signOut')}
 </button>
 </>
 )}
 </div>
 </div>
 )}
 </div>
 );
}
