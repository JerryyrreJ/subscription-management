import { useState, useEffect, useCallback } from 'react';
import { CreditCard, TrendingUp, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Subscription, ViewMode, Currency, ExchangeRates, SortConfig, SortBy } from '../types';
import { getCachedExchangeRates, convertCurrency, formatCurrency, CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';
import { CustomSelect } from './CustomSelect';

interface DashboardProps {
  subscriptions: Subscription[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
}

export function Dashboard({ subscriptions, viewMode, onViewModeChange, sortConfig, onSortChange }: DashboardProps) {
  const [baseCurrency, setBaseCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({});
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  const loadExchangeRates = useCallback(async () => {
    setIsLoadingRates(true);
    try {
      const rates = await getCachedExchangeRates(baseCurrency);
      setExchangeRates(rates);
      // 只有在汇率加载完成后才更新显示货币
      setDisplayCurrency(baseCurrency);
    } catch (error) {
      console.error('Failed to load exchange rates:', error);
      // 即使出错也要更新显示货币，避免界面卡住
      setDisplayCurrency(baseCurrency);
    } finally {
      setIsLoadingRates(false);
    }
  }, [baseCurrency]);

  useEffect(() => {
    loadExchangeRates();
  }, [loadExchangeRates]);

  // 排序选项
  const sortOptions = [
    { value: 'amount', label: 'Price' },
    { value: 'name', label: 'Name' },
    { value: 'category', label: 'Category' },
    { value: 'nextPaymentDate', label: 'Due Date' },
    { value: 'createdAt', label: 'Created Date' }
  ];

  const handleSortByChange = (sortBy: string) => {
    onSortChange({
      ...sortConfig,
      sortBy: sortBy as SortBy
    });
  };

  const handleSortOrderToggle = () => {
    onSortChange({
      ...sortConfig,
      sortOrder: sortConfig.sortOrder === 'asc' ? 'desc' : 'asc'
    });
  };

  const calculateTotal = () => {
    return subscriptions.reduce((total, sub) => {
      let amount = sub.amount;

      // 转换为显示货币
      if (sub.currency !== displayCurrency) {
        amount = convertCurrency(amount, sub.currency, displayCurrency, exchangeRates, baseCurrency);
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
    <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 dark:from-gray-700 dark:to-gray-800 rounded-xl shadow-lg p-6 text-white relative z-10">
      {/* 桌面端：原始布局（标题和控件在同一行） */}
      <div className="hidden sm:flex justify-between items-center mb-6">
        <div className="flex items-center space-x-2">
          <CreditCard className="w-6 h-6" />
          <h2 className="text-xl font-semibold">Overview</h2>
        </div>
        <div className="flex items-center space-x-2">
          {/* 基准货币选择 */}
          <div className="min-w-[100px]">
            <CustomSelect
              value={baseCurrency}
              onChange={(value) => setBaseCurrency(value as Currency)}
              options={CURRENCIES.map(currency => ({
                value: currency.code,
                label: `${currency.code} (${currency.symbol})`
              }))}
              className="dashboard-select"
            />
          </div>

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

      {/* 移动端：垂直布局 */}
      <div className="flex sm:hidden flex-col space-y-4 mb-6">
        {/* 标题行 */}
        <div className="flex items-center space-x-2">
          <CreditCard className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Overview</h2>
        </div>

        {/* 控制行 - 移动端垂直布局 */}
        <div className="flex flex-col gap-3">
          {/* 货币选择和刷新按钮 */}
          <div className="flex items-center space-x-2">
            <div className="min-w-[120px]">
              <CustomSelect
                value={baseCurrency}
                onChange={(value) => setBaseCurrency(value as Currency)}
                options={CURRENCIES.map(currency => ({
                  value: currency.code,
                  label: `${currency.code} (${currency.symbol})`
                }))}
                className="dashboard-select"
              />
            </div>
            <button
              onClick={loadExchangeRates}
              disabled={isLoadingRates}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-50 p-2 rounded-lg transition-colors flex-shrink-0"
              title="刷新汇率"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingRates ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* 视图模式切换 - 移动端全宽 */}
          <div className="bg-white/10 rounded-lg p-1 w-full">
            <button
              onClick={() => onViewModeChange('monthly')}
              className={`w-1/2 px-3 py-2 text-sm rounded-md transition-colors ${
                viewMode === 'monthly' ? 'bg-white text-indigo-600' : 'text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => onViewModeChange('yearly')}
              className={`w-1/2 px-3 py-2 text-sm rounded-md transition-colors ${
                viewMode === 'yearly' ? 'bg-white text-indigo-600' : 'text-white'
              }`}
            >
              Yearly
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="flex flex-col">
          <p className="text-sm text-indigo-200">Total {viewMode} cost</p>
          <div className="flex items-center space-x-4">
            <h3 className="text-4xl font-bold leading-none">
              {isLoadingRates && baseCurrency !== displayCurrency ? (
                <span className="animate-pulse">Loading...</span>
              ) : (
                formatCurrency(calculateTotal(), displayCurrency)
              )}
            </h3>

            <div className="flex items-center text-emerald-300 bg-emerald-400/10 px-3 py-1 rounded-full">
              <TrendingUp className="w-4 h-4 mr-1" />
              <span className="text-sm">{subscriptions.length} active</span>
            </div>
          </div>
        </div>

        {/* 紧凑排序控件 - 绝对定位到右下角 */}
        {subscriptions.length > 0 && (
          <div className="absolute bottom-0 right-0 flex items-center space-x-1.5 sm:space-x-2 bg-white/10 rounded-lg p-1.5 sm:p-2">
            <ArrowUpDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70" />

            {/* 排序字段选择器 - 小尺寸 */}
            <div className="min-w-[110px] dashboard-sort-control">
              <CustomSelect
                value={sortConfig.sortBy}
                onChange={handleSortByChange}
                options={sortOptions.map(option => ({
                  value: option.value,
                  label: option.label
                }))}
              />
            </div>

            {/* 排序顺序切换按钮 - 小尺寸 */}
            <button
              onClick={handleSortOrderToggle}
              className="bg-white/10 hover:bg-white/20 p-1 sm:p-1.5 rounded transition-colors"
              title={`Sort ${sortConfig.sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
            >
              {sortConfig.sortOrder === 'asc' ? (
                <ArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              ) : (
                <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              )}
            </button>
          </div>
        )}
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