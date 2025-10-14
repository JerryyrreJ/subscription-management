import { Subscription, Currency, ExchangeRates } from '../types';
import { generateReportData, ReportData } from '../utils/reportAnalytics';
import { formatCurrency } from '../utils/currency';
import { SpendingTrendChart } from './SpendingTrendChart';
import { CategoryPieChart } from './CategoryPieChart';
import { TopSubscriptionsChart } from './TopSubscriptionsChart';
import { RenewalHeatmap } from './RenewalHeatmap';
import { InsightsSection } from './InsightsSection';
import { X, TrendingUp, Calendar, DollarSign, Package } from 'lucide-react';
import { useMemo } from 'react';

interface AdvancedReportProps {
  subscriptions: Subscription[];
  baseCurrency: Currency;
  exchangeRates: ExchangeRates;
  onClose: () => void;
}

export function AdvancedReport({
  subscriptions,
  baseCurrency,
  exchangeRates,
  onClose,
}: AdvancedReportProps) {
  // 生成报表数据
  const reportData: ReportData = useMemo(
    () => generateReportData(subscriptions, baseCurrency, exchangeRates),
    [subscriptions, baseCurrency, exchangeRates]
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden">
        {/* 头部 - 固定在顶部 */}
        <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">高级订阅分析报表</h2>
              <p className="text-purple-100 text-sm">
                数据分析周期：近12个月 · 基准货币：{baseCurrency}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* 可滚动内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {/* 概览卡片 */}
          <div className="p-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            📊 数据概览
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-200 dark:bg-purple-800 rounded-lg">
                  <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-300" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">月度总支出</span>
              </div>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCurrency(reportData.overview.totalMonthlySpend, baseCurrency)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                年度: {formatCurrency(reportData.overview.totalYearlySpend, baseCurrency)}
              </p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-200 dark:bg-blue-800 rounded-lg">
                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">活跃订阅</span>
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {reportData.overview.activeSubscriptions}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {reportData.overview.categoryBreakdown.length} 个分类
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-xl border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-200 dark:bg-green-800 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-300" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">平均订阅成本</span>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(reportData.overview.avgSubscriptionCost, baseCurrency)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">每月/每订阅</p>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 p-4 rounded-xl border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-200 dark:bg-orange-800 rounded-lg">
                  <Calendar className="w-5 h-5 text-orange-600 dark:text-orange-300" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">最大分类</span>
              </div>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 truncate">
                {reportData.overview.categoryBreakdown[0]?.category || 'N/A'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {reportData.overview.categoryBreakdown[0]?.count || 0} 个订阅
              </p>
            </div>
          </div>
        </div>

        {/* 主要内容区域 */}
        <div className="p-6 space-y-6">
          {/* 支出趋势图 */}
          <SpendingTrendChart data={reportData.spendingTrend} baseCurrency={baseCurrency} />

          {/* 分类分析和Top订阅 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CategoryPieChart data={reportData.categoryAnalysis} baseCurrency={baseCurrency} />
            <TopSubscriptionsChart data={reportData.topSubscriptions} baseCurrency={baseCurrency} />
          </div>

          {/* 续费热力图 */}
          <RenewalHeatmap data={reportData.renewalHeatmap} baseCurrency={baseCurrency} />

          {/* 智能分析 */}
          <InsightsSection
            suggestions={reportData.optimizationSuggestions}
            baseCurrency={baseCurrency}
          />

          {/* 底部操作按钮 */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              关闭报表
            </button>
            <button
              onClick={() => {
                alert('PDF 导出功能将在后续版本中实现');
              }}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all font-medium shadow-lg hover:shadow-xl"
            >
              导出 PDF 报表 (即将上线)
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
