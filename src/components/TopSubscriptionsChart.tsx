import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTranslation } from 'react-i18next';
import { TopSubscription } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';

interface TopSubscriptionsChartProps {
 data: TopSubscription[];
 baseCurrency: Currency;
}

// Refined gradient colors - teal to emerald spectrum
const COLORS = ['#10b981', '#059669', '#047857', '#34d399', '#6ee7b7'];

export function TopSubscriptionsChart({ data, baseCurrency }: TopSubscriptionsChartProps) {
 const { t } = useTranslation(['analytics']);

 return (
  <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10">
    <div className="flex items-center justify-between mb-8">
      <h3 className="text-base font-medium text-gray-900 dark:text-white">
        {t('analytics:topSubscriptions')}
      </h3>
    </div>

 <ResponsiveContainer width="100%"height={280}>
 <BarChart
 data={data}
 layout="vertical"
 margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
 >
 <CartesianGrid strokeDasharray="3 3"className="stroke-gray-200 dark:stroke-gray-700"/>
 <XAxis
 type="number"
 tick={{ fill: 'currentColor', fontSize: 12 }}
 className="text-gray-600 dark:text-gray-400"
 tickFormatter={(value) => formatCurrency(value, baseCurrency)}
 />
 <YAxis
 type="category"
 dataKey="name"
 tick={{ fill: 'currentColor', fontSize: 11 }}
 className="text-gray-600 dark:text-gray-400"
 width={120}
 tickFormatter={(value) => value.length > 15 ? value.substring(0, 15) + '...' : value}
 />
 <Tooltip
 contentStyle={{
 backgroundColor: 'rgba(255, 255, 255, 0.98)',
 border: '1px solid #e5e7eb',
 borderRadius: '0.75rem',
 boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
 padding: '8px 12px',
 }}
 formatter={(value: number) => [formatCurrency(value, baseCurrency), t('analytics:monthlyCost')]}
 labelStyle={{ color: '#374151', fontWeight: 'bold', fontSize: '14px' }}
 cursor={{ fill: 'transparent' }}
 />
 <Bar
 dataKey="monthlyCost"
 radius={[0, 8, 8, 0]}
 activeBar={{
 opacity: 0.8,
 }}
 >
 {data.map((_, index) => (
 <Cell
 key={`cell-${index}`}
 fill={COLORS[index % COLORS.length]}
 style={{ transition: 'opacity 0.2s ease' }}
 />
 ))}
 </Bar>
 </BarChart>
 </ResponsiveContainer>

 {/* Refined detailed list */}
      <div className="mt-6 space-y-2">
        {data.map((sub, index) => (
          <div
            key={sub.name}
            className="flex items-center justify-between p-3 border border-gray-200/60 dark:border-white/5 bg-transparent hover:bg-gray-50 dark:hover:bg-white/[0.02] rounded-xl transition-colors"
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div
                className="flex items-center justify-center w-6 h-6 rounded-full font-medium text-xs flex-shrink-0 text-white"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              >
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white truncate text-sm">
                  {sub.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-light">
                  {sub.category} · {sub.billingCycle}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <p className="font-medium text-gray-900 dark:text-white text-sm">
                {formatCurrency(sub.monthlyCost, baseCurrency)}<span className="text-gray-400 font-light text-xs ml-1">{t('analytics:perMonthShort')}</span>
              </p>
              <p className="text-xs text-gray-400 font-light">
                {formatCurrency(sub.yearlyCost, baseCurrency)}<span className="ml-1">{t('analytics:perYearShort')}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
 </div>
 );
}
