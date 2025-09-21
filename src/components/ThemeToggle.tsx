import { Sun, Moon } from 'lucide-react';
import { Theme } from '../types';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="relative p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-500 ease-in-out group overflow-hidden w-10 hover:w-auto"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <div className="flex items-center space-x-2">
        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
          <Sun
            className={`absolute w-4 h-4 text-yellow-500 transition-transform duration-500 ease-in-out ${
              theme === 'dark' ? 'translate-y-8 opacity-0' : 'translate-y-0 opacity-100'
            }`}
          />
          <Moon
            className={`absolute w-4 h-4 text-blue-500 transition-transform duration-500 ease-in-out ${
              theme === 'light' ? '-translate-y-8 opacity-0' : 'translate-y-0 opacity-100'
            }`}
          />
        </div>

        {/* 展开的文字区域 */}
        <span className="whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-all duration-500 ease-in-out max-w-0 group-hover:max-w-xs overflow-hidden">
          {theme === 'light' ? 'Light mode' : 'Dark mode'}
        </span>
      </div>
    </button>
  );
}