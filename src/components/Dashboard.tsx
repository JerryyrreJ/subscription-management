import { useState, useEffect, useCallback } from 'react';
import { CreditCard, TrendingUp, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { Subscription, ViewMode, Currency, ExchangeRates, SortConfig, SortBy } from '../types';
import { getCachedExchangeRates, convertCurrency, formatCurrency, CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency';
import { CustomSelect } from './CustomSelect';
import { getVisibleCategories } from '../utils/categories';

interface DashboardProps {
  subscriptions: Subscription[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  totalSubscriptions: number; // 原始订阅总数（未筛选前）
  baseCurrency: Currency;
  onBaseCurrencyChange: (currency: Currency) => void;
  exchangeRates: ExchangeRates;
  onRefreshRates: () => Promise<void>;
}

export function Dashboard({ subscriptions, viewMode, onViewModeChange, sortConfig, onSortChange, selectedCategory, onCategoryChange, totalSubscriptions, baseCurrency, onBaseCurrencyChange, exchangeRates, onRefreshRates }: DashboardProps) {
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(baseCurrency);
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // 当 baseCurrency 变化时，更新 displayCurrency
  useEffect(() => {
    setDisplayCurrency(baseCurrency);
  }, [baseCurrency]);

  const loadExchangeRates = async () => {
    setIsLoadingRates(true);
    try {
      await onRefreshRates();
      setDisplayCurrency(baseCurrency);
    } catch (error) {
      console.error('Failed to load exchange rates:', error);
      setDisplayCurrency(baseCurrency);
    } finally {
      setIsLoadingRates(false);
    }
  };

  // 类型筛选选项
  const categoryOptions = [
    { value: 'all', label: 'All Categories' },
    ...getVisibleCategories().map(cat => ({
      value: cat.name,
      label: cat.name
    }))
  ];

  const handleCategoryChange = (value: string) => {
    onCategoryChange(value === 'all' ? null : value);
  };

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
    <div className="relative rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-slate-200/60 dark:border-gray-700/60 bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl p-6 z-20">
      {/* Subtle background gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-transparent to-slate-100/30 dark:from-gray-800/50 dark:to-gray-900/30 pointer-events-none rounded-2xl -z-10"></div>

      <div className="relative z-10">
        {/* 桌面端：原始布局（标题和控件在同一行） */}
        <div className="hidden sm:flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-slate-100/80 dark:bg-gray-700/80 rounded-xl">
              <CreditCard className="w-5 h-5 text-slate-600 dark:text-gray-300" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100 tracking-tight">Overview</h2>
          </div>
          <div className="flex items-center space-x-2">
            {/* 基准货币选择 */}
            <div className="min-w-[100px]">
              <CustomSelect
                value={baseCurrency}
                onChange={(value) => onBaseCurrencyChange(value as Currency)}
                options={CURRENCIES.map(currency => ({
                  value: currency.code,
                  label: `${currency.code} (${currency.symbol})`
                }))}
                className="dashboard-select-glass"
              />
            </div>

            {/* 刷新汇率按钮 */}
            <button
              onClick={loadExchangeRates}
              disabled={isLoadingRates}
              className="bg-slate-100/80 hover:bg-slate-200/80 dark:bg-gray-700/80 dark:hover:bg-gray-600/80 disabled:opacity-50 p-2 rounded-xl transition-all duration-200 backdrop-blur-sm border border-slate-200/50 dark:border-gray-600/50"
              title="刷新汇率"
            >
              <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-gray-300 ${isLoadingRates ? 'animate-spin' : ''}`} />
            </button>

            {/* 视图模式切换 */}
            <div className="bg-slate-100/60 dark:bg-gray-700/60 rounded-xl p-1 backdrop-blur-sm border border-slate-200/40 dark:border-gray-600/40">
              <button
                onClick={() => onViewModeChange('monthly')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  viewMode === 'monthly'
                    ? 'bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 shadow-sm'
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => onViewModeChange('yearly')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  viewMode === 'yearly'
                    ? 'bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 shadow-sm'
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'
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
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-slate-100/80 dark:bg-gray-700/80 rounded-lg">
              <CreditCard className="w-4 h-4 text-slate-600 dark:text-gray-300" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-gray-100 tracking-tight">Overview</h2>
          </div>

          {/* 控制行 - 移动端垂直布局 */}
          <div className="flex flex-col gap-3">
            {/* 货币选择和刷新按钮 */}
            <div className="flex items-center space-x-2">
              <div className="min-w-[120px]">
                <CustomSelect
                  value={baseCurrency}
                  onChange={(value) => onBaseCurrencyChange(value as Currency)}
                  options={CURRENCIES.map(currency => ({
                    value: currency.code,
                    label: `${currency.code} (${currency.symbol})`
                  }))}
                  className="dashboard-select-glass"
                />
              </div>
              <button
                onClick={loadExchangeRates}
                disabled={isLoadingRates}
                className="bg-slate-100/80 hover:bg-slate-200/80 dark:bg-gray-700/80 dark:hover:bg-gray-600/80 disabled:opacity-50 p-2 rounded-xl transition-all duration-200 backdrop-blur-sm border border-slate-200/50 dark:border-gray-600/50 flex-shrink-0"
                title="刷新汇率"
              >
                <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-gray-300 ${isLoadingRates ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* 视图模式切换 - 移动端全宽 */}
            <div className="bg-slate-100/60 dark:bg-gray-700/60 rounded-xl p-1 w-full backdrop-blur-sm border border-slate-200/40 dark:border-gray-600/40">
              <button
                onClick={() => onViewModeChange('monthly')}
                className={`w-1/2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  viewMode === 'monthly'
                    ? 'bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 shadow-sm'
                    : 'text-slate-600 dark:text-gray-400'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => onViewModeChange('yearly')}
                className={`w-1/2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  viewMode === 'yearly'
                    ? 'bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 shadow-sm'
                    : 'text-slate-600 dark:text-gray-400'
                }`}
              >
                Yearly
              </button>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="flex flex-col">
            <p className="text-sm font-medium text-slate-500 dark:text-gray-400 mb-2">Total {viewMode} cost</p>
            <div className="flex items-center space-x-4 flex-wrap gap-y-2">
              <h3 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-gray-100 leading-none tracking-tight">
                {isLoadingRates && baseCurrency !== displayCurrency ? (
                  <span className="animate-pulse text-slate-400 dark:text-gray-500">Loading...</span>
                ) : (
                  formatCurrency(calculateTotal(), displayCurrency)
                )}
              </h3>

              <div className="flex items-center text-slate-700 dark:text-gray-300 bg-slate-100/80 dark:bg-gray-700/80 px-3.5 py-1.5 rounded-full backdrop-blur-sm border border-slate-200/60 dark:border-gray-600/60">
                <TrendingUp className="w-4 h-4 mr-1.5 text-slate-600 dark:text-gray-400" />
                <span className="text-sm font-medium">{subscriptions.length} active</span>
              </div>
            </div>
          </div>

          {/* 紧凑筛选和排序控件 - 绝对定位到右下角 */}
          {totalSubscriptions > 0 && (
            <div className="absolute bottom-0 right-0 flex items-center space-x-1.5 sm:space-x-2 bg-slate-100/60 dark:bg-gray-700/60 rounded-xl p-1.5 sm:p-2 backdrop-blur-md border border-slate-200/50 dark:border-gray-600/50">
              {/* 类型筛选 */}
              <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 dark:text-gray-400" />
              <div className="min-w-[120px] dashboard-sort-control">
                <CustomSelect
                  value={selectedCategory || 'all'}
                  onChange={handleCategoryChange}
                  options={categoryOptions}
                />
              </div>

              {/* 分隔线 */}
              <div className="h-6 w-px bg-slate-300/50 dark:bg-gray-600/50"></div>

              {/* 排序控件 */}
              <ArrowUpDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 dark:text-gray-400" />

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
                className="bg-white/60 dark:bg-gray-800/60 hover:bg-white/90 dark:hover:bg-gray-700/90 p-1 sm:p-1.5 rounded-lg transition-all duration-200 border border-slate-200/50 dark:border-gray-600/50"
                title={`Sort ${sortConfig.sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                {sortConfig.sortOrder === 'asc' ? (
                  <ArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600 dark:text-gray-300" />
                ) : (
                  <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600 dark:text-gray-300" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* 汇率状态指示 */}
        {Object.keys(exchangeRates).length === 0 && !isLoadingRates && (
          <div className="mt-4 text-sm text-slate-500 dark:text-gray-400 font-medium">
            使用离线汇率数据
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;