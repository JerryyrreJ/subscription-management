import { useState, useRef, useEffect } from 'react';
import { User, Edit3, LogOut, Wifi, WifiOff, RotateCcw } from 'lucide-react';

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
  isOnline: boolean;
  onEditNickname: () => void;
  onSignOut: () => void;
  onSync: () => void;
}

export function UserMenu({
  user,
  userProfile,
  syncStatus,
  isOnline,
  onEditNickname,
  onSignOut,
  onSync
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleMenuItemClick = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* 用户头像按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-in-out"
      >
        <div className="w-5 h-5 flex items-center justify-center">
          <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </div>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
          {/* 用户信息头部 */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {userProfile?.nickname || user.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* 同步状态 */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  syncStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' :
                  syncStatus === 'success' ? 'bg-green-500' :
                  syncStatus === 'error' ? 'bg-red-500' :
                  'bg-gray-400'
                }`} />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {syncStatus === 'syncing' ? 'Syncing...' :
                   syncStatus === 'success' ? 'Synced' :
                   syncStatus === 'error' ? 'Sync failed' :
                   'Ready'}
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