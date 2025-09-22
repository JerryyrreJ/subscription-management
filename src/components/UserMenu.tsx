import { useState, useRef, useEffect } from 'react';
import { User, Edit3, LogOut, RotateCcw } from 'lucide-react';

interface UserProfile {
  nickname?: string;
}

interface User {
  email: string;
}

interface UserMenuProps {
  user: User;
  userProfile: UserProfile | null;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncTime: Date | null;
  onEditNickname: () => void;
  onSignOut: () => void;
  onSync: () => void;
}

export function UserMenu({
  user,
  userProfile,
  syncStatus,
  lastSyncTime,
  onEditNickname,
  onSignOut,
  onSync
}: UserMenuProps) {
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
    if (!date) return 'Never synced';

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return `Synced ${diffInSeconds}s ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `Synced ${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `Synced ${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `Synced ${days}d ago`;
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* 用户头像按钮 */}
      <button
        onClick={toggleMenu}
        className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-in-out"
      >
        <div className="w-5 h-5 flex items-center justify-center">
          <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </div>
      </button>

      {/* 下拉菜单 */}
      {(isOpen || isClosing) && (
        <div className={`absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 ${
          isClosing ? 'animate-dropdown-close' : 'animate-dropdown'
        }`}>
          {/* 用户信息头部 */}
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
                  {syncStatus === 'syncing' ? 'Syncing...' :
                   syncStatus === 'error' ? 'Sync failed' :
                   getTimeAgo(lastSyncTime)}
                </span>
              </div>
            </div>
            {syncStatus !== 'syncing' && (
              <button
                onClick={() => handleMenuItemClick(onSync)}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Sync Now
              </button>
            )}
          </div>

          {/* 菜单项 */}
          <div className="py-1">
            <button
              onClick={() => handleMenuItemClick(onEditNickname)}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Edit3 className="w-4 h-4 text-gray-400" />
              Edit Nickname
            </button>

            <button
              onClick={() => handleMenuItemClick(onSignOut)}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}