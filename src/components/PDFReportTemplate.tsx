import { ReportData } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line,
  Tooltip as RechartsTooltip,
} from 'recharts';

interface PDFReportTemplateProps {
  reportData: ReportData;
  baseCurrency: Currency;
  generatedDate: string;
}

// Modern gradient color palette
const CHART_COLORS = {
  primary: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'],
  spending: '#8b5cf6',
  secondary: '#ec4899',
  accent: '#06b6d4',
};

export function PDFReportTemplate({
  reportData,
  baseCurrency,
  generatedDate,
}: PDFReportTemplateProps) {
  return (
    <div
      id="pdf-report-template"
      style={{
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: '1122px', // 297mm at 96 DPI
        height: '794px', // 210mm at 96 DPI
        backgroundColor: '#ffffff',
        padding: '32px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header Section */}
      <div
        style={{
          position: 'absolute',
          top: '32px',
          left: '32px',
          right: '32px',
          height: '80px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div
              style={{
                fontSize: '36px',
                fontWeight: 'bold',
                background: 'linear-gradient(to right, #9333ea, #ec4899)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                marginBottom: '8px',
              }}
            >
              Subscription Analytics
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280' }}>
              12-Month Performance Report · {baseCurrency}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>Generated</div>
            <div style={{ fontSize: '13px', color: '#374151', fontWeight: '600' }}>{generatedDate}</div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          position: 'absolute',
          top: '132px',
          left: '32px',
          right: '32px',
          bottom: '52px',
        }}
      >
        {/* Left Column - Monthly Spend Card (Large) */}
        <div
          style={{
            position: 'absolute',
            left: '0',
            top: '0',
            width: '280px',
            height: '160px',
            background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
            border: '1px solid #e9d5ff',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#a855f7',
                borderRadius: '4px',
              }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>Monthly Spend</span>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#9333ea', marginBottom: '8px' }}>
            {formatCurrency(reportData.overview.totalMonthlySpend, baseCurrency)}
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>
            Annual: {formatCurrency(reportData.overview.totalYearlySpend, baseCurrency)}
          </div>
        </div>

        {/* Left Column - Two Small Cards */}
        <div
          style={{
            position: 'absolute',
            left: '0',
            top: '176px',
            width: '134px',
            height: '100px',
            background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
            border: '1px solid #bfdbfe',
            borderRadius: '12px',
            padding: '14px',
          }}
        >
          <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '8px' }}>Active</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2563eb', lineHeight: '1' }}>
            {reportData.overview.activeSubscriptions}
          </div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '6px' }}>Subscriptions</div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: '146px',
            top: '176px',
            width: '134px',
            height: '100px',
            background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
            border: '1px solid #a7f3d0',
            borderRadius: '12px',
            padding: '14px',
          }}
        >
          <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '8px' }}>Avg Cost</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#059669', lineHeight: '1' }}>
            {formatCurrency(reportData.overview.avgSubscriptionCost, baseCurrency)}
          </div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '6px' }}>per month</div>
        </div>

        {/* Left Column - Category Pie Chart */}
        <div
          style={{
            position: 'absolute',
            left: '0',
            top: '292px',
            width: '280px',
            height: '318px',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
            Category Distribution
          </div>
          <div style={{ width: '248px', height: '260px' }}>
            <PieChart width={248} height={260}>
              <Pie
                data={reportData.categoryAnalysis}
                cx="50%"
                cy="45%"
                outerRadius={70}
                dataKey="amount"
                label={false}
              >
                {reportData.categoryAnalysis.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS.primary[index % CHART_COLORS.primary.length]} />
                ))}
              </Pie>
              <Legend
                wrapperStyle={{ fontSize: '9px', lineHeight: '1.3' }}
                formatter={(value, entry: any) => entry.payload.category}
                iconSize={8}
              />
            </PieChart>
          </div>
        </div>

        {/* Middle Column - Spending Trend Chart (Large) */}
        <div
          style={{
            position: 'absolute',
            left: '296px',
            top: '0',
            width: '370px',
            height: '380px',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '18px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>12-Month Spending Trend</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div
                style={{
                  width: '16px',
                  height: '3px',
                  backgroundColor: '#8b5cf6',
                  borderRadius: '2px',
                }}
              />
              <span style={{ fontSize: '10px', color: '#6b7280' }}>Spending</span>
            </div>
          </div>
          <div style={{ width: '334px', height: '320px' }}>
            <LineChart width={334} height={320} data={reportData.spendingTrend.slice(-6)} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(value) => value.substring(0, 3)}
              />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} width={50} />
              <RechartsTooltip
                contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                formatter={(value: any) => formatCurrency(value, baseCurrency)}
              />
              <Line
                type="monotone"
                dataKey="spending"
                stroke={CHART_COLORS.spending}
                strokeWidth={3}
                dot={{ fill: CHART_COLORS.spending, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </div>
        </div>

        {/* Middle Column - Top Category Card */}
        <div
          style={{
            position: 'absolute',
            left: '296px',
            top: '396px',
            width: '370px',
            height: '214px',
            background: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
            border: '1px solid #fdba74',
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#ea580c',
                borderRadius: '4px',
              }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>Top Category</span>
          </div>
          <div
            style={{
              fontSize: '32px',
              fontWeight: 'bold',
              color: '#ea580c',
              marginBottom: '16px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {reportData.overview.categoryBreakdown[0]?.category || 'N/A'}
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '24px', color: '#ea580c', fontWeight: '600' }}>
                {reportData.overview.categoryBreakdown[0]?.count || 0}
              </div>
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>Subscriptions</div>
            </div>
            <div>
              <div style={{ fontSize: '18px', color: '#ea580c', fontWeight: '600' }}>
                {formatCurrency(reportData.overview.categoryBreakdown[0]?.totalAmount || 0, baseCurrency)}
              </div>
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>Total/month</div>
            </div>
          </div>
        </div>

        {/* Right Column - Top 5 Subscriptions Chart */}
        <div
          style={{
            position: 'absolute',
            left: '682px',
            top: '0',
            width: '344px',
            height: '340px',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '18px',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
            Top 5 Subscriptions
          </div>
          <div style={{ width: '308px', height: '280px' }}>
            <BarChart
              width={308}
              height={280}
              data={reportData.topSubscriptions}
              layout="vertical"
              margin={{ top: 0, right: 10, left: 90, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                width={85}
                tickFormatter={(value) => (value.length > 12 ? value.substring(0, 12) + '...' : value)}
              />
              <RechartsTooltip
                contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                formatter={(value: any) => formatCurrency(value, baseCurrency)}
              />
              <Bar dataKey="monthlyCost" radius={[0, 6, 6, 0]}>
                {reportData.topSubscriptions.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS.primary[index % CHART_COLORS.primary.length]} />
                ))}
              </Bar>
            </BarChart>
          </div>
        </div>

        {/* Right Column - Optimization Insights */}
        <div
          style={{
            position: 'absolute',
            left: '682px',
            top: '356px',
            width: '344px',
            height: '254px',
            background: 'linear-gradient(135deg, #fae8ff 0%, #fce7f3 50%, #fae8ff 100%)',
            border: '1px solid #f5d0fe',
            borderRadius: '12px',
            padding: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={{ fontSize: '18px' }}>💡</span>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>Optimization Insights</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {reportData.optimizationSuggestions.slice(0, 2).map((suggestion, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #f5d0fe',
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#111827', marginBottom: '6px' }}>
                  {suggestion.title}
                </div>
                <div
                  style={{
                    fontSize: '9px',
                    color: '#6b7280',
                    lineHeight: '1.5',
                    marginBottom: '8px',
                  }}
                >
                  {suggestion.description}
                </div>
                {suggestion.potentialSavings > 0 && (
                  <div style={{ fontSize: '10px', fontWeight: '600', color: '#059669' }}>
                    💰 Save {formatCurrency(suggestion.potentialSavings, baseCurrency)}/year
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: '32px',
          left: '32px',
          right: '32px',
          borderTop: '1px solid #e5e7eb',
          paddingTop: '12px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: '10px', color: '#9ca3af' }}>Generated with Subscription Manager</div>
        <div style={{ fontSize: '10px', color: '#9ca3af' }}>
          © {new Date().getFullYear()} · For personal use only
        </div>
      </div>
    </div>
  );
}
