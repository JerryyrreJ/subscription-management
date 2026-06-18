import { Subscription, Currency, ExchangeRates } from '../types';
import { generateReportData, ReportData } from '../utils/reportAnalytics';
import { formatCurrency, formatCurrencyOptionLabel } from '../utils/currency';
import { SpendingTrendChart } from './SpendingTrendChart';
import { CategoryPieChart } from './CategoryPieChart';
import { TopSubscriptionsChart } from './TopSubscriptionsChart';
import { RenewalHeatmap } from './RenewalHeatmap';
import { InsightsSection } from './InsightsSection';
import { X, TrendingUp, Calendar, DollarSign, Package, HelpCircle, Download } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '../hooks/useAppLanguage';

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
 const { t } = useTranslation(['analytics', 'currency', 'categoryLabels']);
 const { language } = useAppLanguage();
 const [isVisible, setIsVisible] = useState(false);

 // 生成报表数据
 const reportData: ReportData = useMemo(
 () => generateReportData(subscriptions, baseCurrency, exchangeRates, t, language),
 [subscriptions, baseCurrency, exchangeRates, t, language]
 );

 // 入场动画
 useEffect(() => {
 // 延迟一帧触发动画，确保初始状态已渲染
 requestAnimationFrame(() => {
 setIsVisible(true);
 });
 }, []);

 // 处理关闭动画
 const handleClose = () => {
 setIsVisible(false);
 // 等待动画完成后再真正关闭
 setTimeout(() => {
 onClose();
 }, 300); // 匹配 CSS transition 时间
 };

 // 处理 PDF 导出 - 预留接口，功能待实现
 const handleExportPDF = async () => {
 // TODO: 实现新的PDF导出功能
 alert(t('analytics:pdfExportInProgress'));
 };

 return (
 <div
 className={`fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-out ${
 isVisible ? 'opacity-100' : 'opacity-0'
 }`}
 onClick={handleClose}
 >
 <div
 className={`bg-[#fcfcfc]/95 dark:bg-[#0a0a0a]/95 backdrop-blur-2xl rounded-[2rem] border border-gray-200/50 dark:border-white/10 shadow-fey w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden transition-all duration-300 ease-out ${
 isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
 }`}
 onClick={(e) => e.stopPropagation()}
 >
    {/* Elegant Minimalist Header */}
    <div className="flex-shrink-0 border-b border-gray-200/50 dark:border-white/10 bg-transparent px-8 py-6 relative z-10 flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-medium text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
          {t('analytics:title')}
          <span className="px-2.5 py-1 rounded-full border border-gray-200 dark:border-white/10 text-xs text-gray-500 dark:text-gray-400 font-normal tracking-normal bg-white/50 dark:bg-white/5">
            Pro
          </span>
        </h2>
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mt-1.5 font-light">
          <span>{t('analytics:analysisSummary', { currency: formatCurrencyOptionLabel(baseCurrency, t) })}</span>
          <div className="relative group">
            <HelpCircle className="w-4 h-4 cursor-help text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"/>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900/95 dark:bg-white/95 backdrop-blur-sm text-white dark:text-gray-900 text-xs rounded-lg shadow-fey whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {t('analytics:currencyHelp')}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900/95 dark:border-t-white/95"></div>
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={handleClose}
        className="p-2.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-all text-gray-400 hover:text-gray-600 dark:hover:text-white"
        aria-label={t('analytics:closeReportAria')}
      >
        <X className="w-5 h-5"/>
      </button>
    </div>

 {/* Scrollable Content Area */}
 <div id="report-content"className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
 {/* Refined Overview Cards */}
 <div className="p-8 border-b border-gray-200/50 dark:border-white/10">
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 {/* Monthly Spend */}
 <div className="bg-white dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/10">
 <div className="flex items-center gap-3 mb-4">
 <DollarSign className="w-4 h-4 text-gray-400"/>
 <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">{t('analytics:monthlySpend')}</span>
 </div>
 <p className="text-2xl font-semibold text-gray-900 dark:text-white">
 {formatCurrency(reportData.overview.totalMonthlySpend, baseCurrency)}
 </p>
 <p className="text-xs text-gray-400 mt-2">
 {t('analytics:yearlySpend', { amount: formatCurrency(reportData.overview.totalYearlySpend, baseCurrency) })}
 </p>
 </div>

 {/* Active Subscriptions */}
 <div className="bg-white dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/10">
 <div className="flex items-center gap-3 mb-4">
 <Package className="w-4 h-4 text-gray-400"/>
 <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">{t('analytics:activeSubscriptions')}</span>
 </div>
 <p className="text-2xl font-semibold text-gray-900 dark:text-white">
 {reportData.overview.activeSubscriptions}
 </p>
 <p className="text-xs text-gray-400 mt-2">
 {t(
  reportData.overview.categoryBreakdown.length === 1
   ? 'analytics:categoriesCountOne'
   : 'analytics:categoriesCountOther',
  { count: reportData.overview.categoryBreakdown.length }
 )}
 </p>
 </div>

 {/* Average Cost */}
 <div className="bg-white dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/10">
 <div className="flex items-center gap-3 mb-4">
 <TrendingUp className="w-4 h-4 text-gray-400"/>
 <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">{t('analytics:avgCost')}</span>
 </div>
 <p className="text-2xl font-semibold text-gray-900 dark:text-white">
 {formatCurrency(reportData.overview.avgSubscriptionCost, baseCurrency)}
 </p>
 <p className="text-xs text-gray-400 mt-2">{t('analytics:perMonthPerSubscription')}</p>
 </div>

 {/* Largest Category */}
 <div className="bg-white dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/10">
 <div className="flex items-center gap-3 mb-4">
 <Calendar className="w-4 h-4 text-gray-400"/>
 <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">{t('analytics:largestCategory')}</span>
 </div>
 <p className="text-2xl font-semibold text-gray-900 dark:text-white truncate">
 {reportData.overview.categoryBreakdown[0]?.category || t('analytics:notAvailable')}
 </p>
 <p className="text-xs text-gray-400 mt-2">
 {t(
  (reportData.overview.categoryBreakdown[0]?.count || 0) === 1
   ? 'analytics:subscriptionsCountOne'
   : 'analytics:subscriptionsCountOther',
  { count: reportData.overview.categoryBreakdown[0]?.count || 0 }
 )}
 </p>
 </div>
 </div>
 </div>

      {/* Main Content Area */}
      <div className="p-8 space-y-8">
 {/* Spending Trend Chart */}
 <SpendingTrendChart data={reportData.spendingTrend} baseCurrency={baseCurrency} />

 {/* Category Analysis and Top Subscriptions */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <CategoryPieChart data={reportData.categoryAnalysis} baseCurrency={baseCurrency} />
 <TopSubscriptionsChart data={reportData.topSubscriptions} baseCurrency={baseCurrency} />
 </div>

 {/* Renewal Heatmap */}
 <RenewalHeatmap data={reportData.renewalHeatmap} baseCurrency={baseCurrency} />

 {/* Insights Section */}
 <InsightsSection
 suggestions={reportData.optimizationSuggestions}
 baseCurrency={baseCurrency}
 />
        {/* Elegant Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200/50 dark:border-white/5">
          <button
            onClick={handleClose}
            className="px-6 py-2.5 bg-transparent text-gray-600 dark:text-gray-400 rounded-xl hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-white/5 transition-all text-sm font-medium"
          >
            {t('analytics:closeReport')}
          </button>
          <button
            onClick={handleExportPDF}
            className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-all text-sm font-medium shadow-sm flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4"/>
            <span>{t('analytics:exportPdfReport')}</span>
          </button>
        </div>
      </div>
    </div>
 </div>
 </div>
 );
}
