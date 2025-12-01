import { Subscription, Currency, ExchangeRates } from '../types';
import { generateReportData, ReportData } from '../utils/reportAnalytics';
import { formatCurrency } from '../utils/currency';
import { SpendingTrendChart } from './SpendingTrendChart';
import { CategoryPieChart } from './CategoryPieChart';
import { TopSubscriptionsChart } from './TopSubscriptionsChart';
import { RenewalHeatmap } from './RenewalHeatmap';
import { InsightsSection } from './InsightsSection';
import { X, TrendingUp, Calendar, DollarSign, Package, HelpCircle, Download } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { exportReportToPDF, generatePDFFilename } from '../utils/pdfExport';
import { PDFReportTemplate } from './PDFReportTemplate';

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
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // 生成报表数据
  const reportData: ReportData = useMemo(
    () => generateReportData(subscriptions, baseCurrency, exchangeRates),
    [subscriptions, baseCurrency, exchangeRates]
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
    setIsClosing(true);
    setIsVisible(false);
    // 等待动画完成后再真正关闭
    setTimeout(() => {
      onClose();
    }, 300); // 匹配 CSS transition 时间
  };

  // 处理 PDF 导出
  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      const filename = generatePDFFilename('subscription-report');

      // Generate current date for PDF
      const generatedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Create PDF template component
      const pdfTemplate = (
        <PDFReportTemplate
          reportData={reportData}
          baseCurrency={baseCurrency}
          generatedDate={generatedDate}
        />
      );

      await exportReportToPDF(pdfTemplate, {
        filename,
        pageConfig: {
          size: 'A4',
          orientation: 'landscape',
        },
      });
    } catch (error) {
      console.error('Failed to export PDF:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-gray-50 dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden transition-all duration-300 ease-out ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 - 固定在顶部 */}
        <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">Advanced Subscription Analytics</h2>
              <div className="flex items-center gap-2 text-purple-100 text-sm">
                <span>Analysis Period: Last 12 Months · Base Currency: {baseCurrency}</span>
                <div className="relative group">
                  <HelpCircle className="w-4 h-4 cursor-help" />
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Report uses the base currency selected in Overview
                    {/* Arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                      <div className="border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close report"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* 可滚动内容区域 */}
        <div id="report-content" className="flex-1 overflow-y-auto">
          {/* Overview Cards */}
          <div className="p-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            📊 Data Overview
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-4 rounded-xl border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-200 dark:bg-purple-800 rounded-lg">
                  <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-300" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Monthly Spend</span>
              </div>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCurrency(reportData.overview.totalMonthlySpend, baseCurrency)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Yearly: {formatCurrency(reportData.overview.totalYearlySpend, baseCurrency)}
              </p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-200 dark:bg-blue-800 rounded-lg">
                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Active Subscriptions</span>
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {reportData.overview.activeSubscriptions}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {reportData.overview.categoryBreakdown.length} Categories
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-xl border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-200 dark:bg-green-800 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-300" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Avg Cost</span>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(reportData.overview.avgSubscriptionCost, baseCurrency)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">per month/subscription</p>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 p-4 rounded-xl border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-200 dark:bg-orange-800 rounded-lg">
                  <Calendar className="w-5 h-5 text-orange-600 dark:text-orange-300" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Largest Category</span>
              </div>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 truncate">
                {reportData.overview.categoryBreakdown[0]?.category || 'N/A'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {reportData.overview.categoryBreakdown[0]?.count || 0} Subscriptions
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="p-6 space-y-6">
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

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleClose}
              className="flex-1 px-6 py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              Close Report
            </button>
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all font-medium shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isExporting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Export PDF Report</span>
                </>
              )}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
