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
      className="relative p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-300 group"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <div className="relative w-6 h-6 overflow-hidden">
        <Sun
          className={`absolute inset-0 w-6 h-6 text-yellow-500 transition-transform duration-300 ${
            theme === 'dark' ? 'translate-y-8 opacity-0' : 'translate-y-0 opacity-100'
          }`}
        />
        <Moon
          className={`absolute inset-0 w-6 h-6 text-blue-500 transition-transform duration-300 ${
            theme === 'light' ? '-translate-y-8 opacity-0' : 'translate-y-0 opacity-100'
          }`}
        />
      </div>
    </button>
  );
}