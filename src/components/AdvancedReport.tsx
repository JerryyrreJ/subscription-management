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
      className={`fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden transition-all duration-300 ease-out ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Elegant Header - Slate to Teal Gradient */}
        <div className="flex-shrink-0 bg-gradient-to-r from-slate-700 via-slate-600 to-teal-600 dark:from-slate-800 dark:via-slate-700 dark:to-teal-700 text-white p-6 rounded-t-2xl relative overflow-hidden">
          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/10 pointer-events-none"></div>

          <div className="flex items-center justify-between relative z-10">
            <div>
              <h2 className="text-2xl font-bold mb-1 bg-gradient-to-r from-white to-teal-100 bg-clip-text text-transparent">
                Advanced Subscription Analytics
              </h2>
              <div className="flex items-center gap-2 text-teal-100/90 text-sm">
                <span>Analysis Period: Last 12 Months · Base Currency: {baseCurrency}</span>
                <div className="relative group">
                  <HelpCircle className="w-4 h-4 cursor-help" />
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-900/95 backdrop-blur-sm text-white text-xs rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-teal-500/20">
                    Report uses the base currency selected in Overview
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                      <div className="border-4 border-transparent border-t-slate-900/95"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-all hover:shadow-lg hover:scale-105"
              aria-label="Close report"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div id="report-content" className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          {/* Refined Overview Cards */}
          <div className="p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-teal-500 to-emerald-500 rounded-full"></div>
            Data Overview
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Monthly Spend - Emerald Gradient */}
            <div className="group bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-5 rounded-xl border border-emerald-200/50 dark:border-emerald-800/50 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow-lg group-hover:shadow-xl transition-shadow">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Spend</span>
              </div>
              <p className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                {formatCurrency(reportData.overview.totalMonthlySpend, baseCurrency)}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                Yearly: {formatCurrency(reportData.overview.totalYearlySpend, baseCurrency)}
              </p>
            </div>

            {/* Active Subscriptions - Sky Gradient */}
            <div className="group bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/30 p-5 rounded-xl border border-sky-200/50 dark:border-sky-800/50 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-gradient-to-br from-sky-500 to-blue-600 rounded-lg shadow-lg group-hover:shadow-xl transition-shadow">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Subscriptions</span>
              </div>
              <p className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 dark:from-sky-400 dark:to-blue-400 bg-clip-text text-transparent">
                {reportData.overview.activeSubscriptions}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                {reportData.overview.categoryBreakdown.length} Categories
              </p>
            </div>

            {/* Average Cost - Amber Gradient */}
            <div className="group bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-5 rounded-xl border border-amber-200/50 dark:border-amber-800/50 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-lg group-hover:shadow-xl transition-shadow">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Avg Cost</span>
              </div>
              <p className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
                {formatCurrency(reportData.overview.avgSubscriptionCost, baseCurrency)}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">per month/subscription</p>
            </div>

            {/* Largest Category - Indigo Gradient */}
            <div className="group bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 p-5 rounded-xl border border-indigo-200/50 dark:border-indigo-800/50 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-[1.02]">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg shadow-lg group-hover:shadow-xl transition-shadow">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Largest Category</span>
              </div>
              <p className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent truncate">
                {reportData.overview.categoryBreakdown[0]?.category || 'N/A'}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
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

          {/* Elegant Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleClose}
              className="flex-1 px-6 py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-lg transition-all font-medium"
            >
              Close Report
            </button>
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 text-white rounded-xl hover:from-teal-700 hover:to-emerald-700 transition-all font-medium shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
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
