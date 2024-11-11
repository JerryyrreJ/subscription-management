import { CreditCard, TrendingUp } from 'lucide-react';
import { Subscription, ViewMode } from '../types';

interface DashboardProps {
  subscriptions: Subscription[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function Dashboard({ subscriptions, viewMode, onViewModeChange }: DashboardProps) {
  const calculateTotal = () => {
    return subscriptions.reduce((total, sub) => {
      const amount = sub.amount;
      return total + (viewMode === 'yearly' && sub.period === 'monthly' ? amount * 12 : amount);
    }, 0);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl shadow-lg p-6 text-white">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-2">
          <CreditCard className="w-6 h-6" />
          <h2 className="text-xl font-semibold">Total Subscriptions</h2>
        </div>
        <div className="flex items-center space-x-2 bg-white/10 rounded-lg p-1">
          <button
            onClick={() => onViewModeChange('monthly')}
            className={`px-3 py-1 rounded-md transition-colors ${
              viewMode === 'monthly' ? 'bg-white text-indigo-600' : 'text-white'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => onViewModeChange('yearly')}
            className={`px-3 py-1 rounded-md transition-colors ${
              viewMode === 'yearly' ? 'bg-white text-indigo-600' : 'text-white'
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="flex items-end space-x-4">
        <div>
          <p className="text-sm text-indigo-200">Total {viewMode} cost</p>
          <h3 className="text-4xl font-bold">¥{calculateTotal().toFixed(2)}</h3>
        </div>
        <div className="flex items-center text-emerald-300 bg-emerald-400/10 px-3 py-1 rounded-full">
          <TrendingUp className="w-4 h-4 mr-1" />
          <span className="text-sm">{subscriptions.length} active</span>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;