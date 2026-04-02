import { useCallback } from 'react';
import { CreditCard, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import CountUp from 'react-countup';
import {
 Subscription,
 ViewMode,
 Currency,
 ExchangeRateSource,
 ExchangeRates,
 SortConfig,
 SortBy
} from '../types';
import {
 convertCurrencySafe,
 formatCurrency,
 CURRENCIES
} from '../utils/currency';
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
 exchangeRateSource: ExchangeRateSource;
 exchangeRatesUpdatedAt: number | null;
 exchangeRatesStale: boolean;
 exchangeRateError?: string;
}

export function Dashboard({
 subscriptions,
 viewMode,
 onViewModeChange,
 sortConfig,
 onSortChange,
 selectedCategory,
 onCategoryChange,
 totalSubscriptions,
 baseCurrency,
 onBaseCurrencyChange,
 exchangeRates,
 exchangeRateSource,
 exchangeRatesUpdatedAt,
 exchangeRatesStale,
 exchangeRateError,
}: DashboardProps) {
 const displayCurrency = baseCurrency;

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

 const totalAmount = useCallback(() => {
 let usesFallbackRates = false;

 const amount = subscriptions.reduce((total, sub) => {
 let amount = sub.amount;

 // 转换为显示货币
 if (sub.currency !== displayCurrency) {
 const conversionResult = convertCurrencySafe(
 amount,
 sub.currency,
 displayCurrency,
 exchangeRates,
 baseCurrency
 );

 amount = conversionResult.amount;
 usesFallbackRates = usesFallbackRates || conversionResult.usedFallback || !conversionResult.isAccurate;
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
 return {
 total: amount,
 usesFallbackRates
 };
 }, [subscriptions, displayCurrency, exchangeRates, baseCurrency, viewMode]);

 const totalAmountResult = totalAmount();
 const currentTotal = totalAmountResult.total;

 // Memoize formatting function to prevent CountUp from restarting on every render
 const formatValue = useCallback(
 (value: number) => formatCurrency(value, displayCurrency),
 [displayCurrency]
 );

 const exchangeRateStatus = (() => {
  if (exchangeRateSource === 'fallback' || totalAmountResult.usesFallbackRates) {
   return {
    className: 'text-xs text-amber-700 dark:text-amber-300 mt-1',
    message: `Using offline exchange rates. Totals may be approximate.${exchangeRateError ? ` ${exchangeRateError}` : ''}`
   };
  }

  if (exchangeRatesStale && exchangeRatesUpdatedAt) {
   return {
    className: 'text-xs text-amber-700 dark:text-amber-300 mt-1',
    message: `Latest exchange rate refresh failed.${exchangeRateError ? ` ${exchangeRateError}` : ''}`
   };
  }

  return null;
 })();

 return (
  <div className="relative rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-slate-200/60 dark:border-gray-700/60 bg-white/70 dark:bg-[#1a1c1e]/70 backdrop-blur-xl p-6 z-20 app-dark-panel">
 {/* Subtle background gradient overlay for depth */}
 <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-transparent to-slate-100/30 dark:from-slate-700/10 dark:via-transparent dark:to-slate-900/20 pointer-events-none rounded-2xl -z-10"></div>

 <div className="relative z-10">
 {/* 桌面端：原始布局（标题和控件在同一行） */}
 <div className="hidden sm:flex justify-between items-center mb-6">
     <div className="flex items-center space-x-2.5">
      <div className="p-2 bg-slate-100/80 dark:bg-gray-700/80 rounded-3xl app-dark-icon-shell">
       <CreditCard className="w-5 h-5 text-slate-600 dark:text-gray-300 app-dark-text-secondary"/>
      </div>
      <div>
       <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100 tracking-tight app-dark-text-primary">Overview</h2>
       {exchangeRateStatus && (
        <p className={exchangeRateStatus.className}>
         {exchangeRateStatus.message}
        </p>
       )}
      </div>
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

 {/* 视图模式切换 */}
 <div className="bg-slate-100/60 dark:bg-gray-700/60 rounded-full p-1 backdrop-blur-sm border border-slate-200/40 dark:border-gray-600/40 flex items-center h-[38px] app-dark-chip">
<button
onClick={() => onViewModeChange('monthly')}
className={`px-4 h-full rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
viewMode === 'monthly'
 ? 'bg-white dark:bg-[#1a1c1e] text-slate-900 dark:text-gray-100 shadow-apple-sm app-dark-chip-active'
 : 'text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200'
}`}
 >
 Monthly
 </button>
 <button
 onClick={() => onViewModeChange('yearly')}
 className={`px-4 h-full rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200 ${
viewMode === 'yearly'
 ? 'bg-white dark:bg-[#1a1c1e] text-slate-900 dark:text-gray-100 shadow-apple-sm app-dark-chip-active'
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
 <div className="p-1.5 bg-slate-100/80 dark:bg-gray-700/80 rounded-2xl app-dark-icon-shell">
 <CreditCard className="w-4 h-4 text-slate-600 dark:text-gray-300 app-dark-text-secondary"/>
 </div>
 <div>
 <h2 className="text-lg font-semibold text-slate-800 dark:text-gray-100 tracking-tight app-dark-text-primary">Overview</h2>
 {exchangeRateStatus && (
 <p className={exchangeRateStatus.className}>
 {exchangeRateStatus.message}
 </p>
 )}
 </div>
 </div>

 {/* 控制行 - 移动端垂直布局 */}
 <div className="flex flex-col gap-3">
 {/* 货币选择 */}
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
 </div>

 {/* 视图模式切换 - 移动端全宽 */}
 <div className="bg-slate-100/60 dark:bg-gray-700/60 rounded-full p-1 w-full backdrop-blur-sm border border-slate-200/40 dark:border-gray-600/40 flex items-center h-[38px] app-dark-chip">
 <button
 onClick={() => onViewModeChange('monthly')}
 className={`w-1/2 h-full flex items-center justify-center text-sm font-medium rounded-full transition-all duration-200 ${
 viewMode === 'monthly'
 ? 'bg-white dark:bg-[#1a1c1e] text-slate-900 dark:text-gray-100 shadow-apple-sm app-dark-chip-active'
 : 'text-slate-600 dark:text-gray-400'
 }`}
 >
 Monthly
 </button>
 <button
 onClick={() => onViewModeChange('yearly')}
 className={`w-1/2 h-full flex items-center justify-center text-sm font-medium rounded-full transition-all duration-200 ${
 viewMode === 'yearly'
 ? 'bg-white dark:bg-[#1a1c1e] text-slate-900 dark:text-gray-100 shadow-apple-sm app-dark-chip-active'
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
 <p className="text-sm font-medium text-slate-500 dark:text-gray-400 mb-2 app-dark-text-muted">Total {viewMode} cost</p>
 <div className="flex items-center space-x-4 flex-wrap gap-y-2">
 <h3 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-gray-100 leading-none tracking-tight flex items-baseline app-dark-text-primary">
 <CountUp
 end={currentTotal}
 duration={1}
 separator=","
 decimals={2}
 formattingFn={formatValue}
 useEasing={true}
 preserveValue={true}
 />
 </h3>

 <div className="flex items-center text-slate-700 dark:text-gray-300 bg-slate-100/80 dark:bg-gray-700/80 px-3.5 py-1.5 rounded-full backdrop-blur-sm border border-slate-200/60 dark:border-gray-600/60 app-dark-chip">
 <TrendingUp className="w-4 h-4 mr-1.5 text-slate-600 dark:text-gray-400 app-dark-text-muted"/>
 <span className="text-sm font-medium">{subscriptions.length} active</span>
 </div>
 </div>
 </div>

 {/* 紧凑筛选和排序控件 - 绝对定位到右下角 */}
 {totalSubscriptions > 0 && (
 <div className="absolute bottom-0 right-0 flex items-center space-x-1.5 sm:space-x-2 bg-slate-100/60 dark:bg-gray-700/60 rounded-3xl p-1.5 sm:p-2 backdrop-blur-md border border-slate-200/50 dark:border-gray-600/50 app-dark-chip">
 {/* 类型筛选 */}
 <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 dark:text-gray-400 app-dark-text-muted"/>
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
 <ArrowUpDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 dark:text-gray-400 app-dark-text-muted"/>

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
 className="bg-white/60 dark:bg-[#1a1c1e]/60 hover:bg-white/90 dark:hover:bg-gray-700/90 p-1 sm:p-1.5 rounded-2xl transition-all duration-200 border border-slate-200/50 dark:border-gray-600/50 app-dark-chip"
 title={`Sort ${sortConfig.sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
 >
 {sortConfig.sortOrder === 'asc' ? (
 <ArrowUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600 dark:text-gray-300 app-dark-text-secondary"/>
) : (
 <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600 dark:text-gray-300 app-dark-text-secondary"/>
)}
 </button>
 </div>
 )}
 </div>
 </div>
 </div>
 );
}

export default Dashboard;
