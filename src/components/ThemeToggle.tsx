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
 className="p-2 rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-apple hover:shadow-fey hover:-translate-y-0.5 transition-all duration-200 ease-in-out app-dark-chip"
 aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
 >
 <div className="w-5 h-5 flex items-center justify-center relative overflow-hidden">
 <Sun
 className={`absolute w-4 h-4 text-yellow-500 transition-transform duration-500 ease-in-out ${
 theme === 'dark' ? 'translate-y-8 opacity-0' : 'translate-y-0 opacity-100'
 }`}
 />
 <Moon
 className={`absolute w-4 h-4 text-emerald-600 dark:text-emerald-300 transition-transform duration-500 ease-in-out ${
 theme === 'light' ? '-translate-y-8 opacity-0' : 'translate-y-0 opacity-100'
 }`}
 />
 </div>
 </button>
 );
}
