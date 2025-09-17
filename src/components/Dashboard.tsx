import { useState, useEffect, useCallback } from 'react';
import { CreditCard, TrendingUp, RefreshCw } from 'lucide-react';
import { Subscription, ViewMode, Currency, ExchangeRates } from '../types';
import { getCachedExchangeRates, convertCurrency, formatCurrency, CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';

interface DashboardProps {
  subscriptions: Subscription[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function Dashboard({ subscriptions, viewMode, onViewModeChange }: DashboardProps) {
  const [baseCurrency, setBaseCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({});
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  const loadExchangeRates = useCallback(async () => {
    setIsLoadingRates(true);
    try {
      const rates = await getCachedExchangeRates(baseCurrency);
      setExchangeRates(rates);
    } catch (error) {
      console.error('Failed to load exchange rates:', error);
    } finally {
      setIsLoadingRates(false);
    }
  }, [baseCurrency]);

  useEffect(() => {
    loadExchangeRates();
  }, [loadExchangeRates]);

  const calculateTotal = () => {
    return subscriptions.reduce((total, sub) => {
      let amount = sub.amount;

      // 转换为基准货币
      if (sub.currency !== baseCurrency) {
        amount = convertCurrency(amount, sub.currency, baseCurrency, exchangeRates, baseCurrency);
      }

      // 根据订阅周期和查看模式调整金额
      if (sub.period === 'monthly') {
        // 月付订阅
        if (viewMode === 'yearly') {
          amount = amount * 12; // 月费 x 12 = 年费
        }
        // 如果viewMode是monthly，保持原值
      } else if (sub.period === 'yearly') {
        // 年付订阅
        if (viewMode === 'monthly') {
          amount = amount / 12; // 年费 / 12 = 月费
        }
        // 如果viewMode是yearly，保持原值
      } else if (sub.period === 'custom') {
        // 自定义周期订阅
        const daysInPeriod = parseInt(sub.customDate || '30');
        const periodsPerYear = 365 / daysInPeriod;

        if (viewMode === 'yearly') {
          // 转换为年费：自定义费用 x 一年内的周期数
          amount = amount * periodsPerYear;
        } else { // monthly
          // 转换为月费：(自定义费用 x 一年内的周期数) / 12
          amount = (amount * periodsPerYear) / 12;
        }
      }

      return total + amount;
    }, 0);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl shadow-lg p-6 text-white relative z-10">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-2">
          <CreditCard className="w-6 h-6" />
          <h2 className="text-xl font-semibold">Total Subscriptions</h2>
        </div>
        <div className="flex items-center space-x-2">
          {/* 基准货币选择 */}
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value as Currency)}
            className="bg-white/10 text-white text-sm rounded-lg px-3 py-1 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code} className="text-gray-800">
                {currency.code} ({currency.symbol})
              </option>
            ))}
          </select>

          {/* 刷新汇率按钮 */}
          <button
            onClick={loadExchangeRates}
            disabled={isLoadingRates}
            className="bg-white/10 hover:bg-white/20 disabled:opacity-50 p-2 rounded-lg transition-colors"
            title="刷新汇率"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingRates ? 'animate-spin' : ''}`} />
          </button>

          {/* 视图模式切换 */}
          <div className="bg-white/10 rounded-lg p-1">
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
      </div>

      <div className="flex items-end space-x-4">
        <div>
          <p className="text-sm text-indigo-200">Total {viewMode} cost</p>
          <h3 className="text-4xl font-bold">
            {formatCurrency(calculateTotal(), baseCurrency)}
          </h3>
        </div>
        <div className="flex items-center text-emerald-300 bg-emerald-400/10 px-3 py-1 rounded-full">
          <TrendingUp className="w-4 h-4 mr-1" />
          <span className="text-sm">{subscriptions.length} active</span>
        </div>
      </div>

      {/* 汇率状态指示 */}
      {Object.keys(exchangeRates).length === 0 && !isLoadingRates && (
        <div className="mt-4 text-sm text-indigo-200 opacity-75">
          使用离线汇率数据
        </div>
      )}
    </div>
  );
}

export default Dashboard;