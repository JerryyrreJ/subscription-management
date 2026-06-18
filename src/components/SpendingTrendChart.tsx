import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { SpendingTrend } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';

interface SpendingTrendChartProps {
 data: SpendingTrend[];
 baseCurrency: Currency;
}

export function SpendingTrendChart({ data, baseCurrency }: SpendingTrendChartProps) {
 const { t } = useTranslation(['analytics']);

 return (
  <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10">
    <div className="flex items-center justify-between mb-8">
      <h3 className="text-base font-medium text-gray-900 dark:text-white">
        {t('analytics:spendingTrendTitle')}
      </h3>
    </div>

 <ResponsiveContainer width="100%"height={300}>
 <LineChart data={data}>
 <CartesianGrid strokeDasharray="3 3"className="stroke-gray-200 dark:stroke-gray-700"/>
 <XAxis
 dataKey="monthLabel"
 tick={{ fill: 'currentColor', fontSize: 12 }}
 className="text-gray-600 dark:text-gray-400"
 />
 <YAxis
 yAxisId="left"
 tick={{ fill: 'currentColor', fontSize: 12 }}
 className="text-gray-600 dark:text-gray-400"
 tickFormatter={(value) => formatCurrency(value, baseCurrency)}
 />
 <YAxis
 yAxisId="right"
 orientation="right"
 tick={{ fill: 'currentColor', fontSize: 12 }}
 className="text-gray-600 dark:text-gray-400"
 />
 <Tooltip
 contentStyle={{
 backgroundColor: 'rgba(255, 255, 255, 0.98)',
 border: '1px solid #e5e7eb',
 borderRadius: '0.75rem',
 boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
 }}
 formatter={(value, _name, item) => {
 const numericValue = Number(value);
 if (String(item?.dataKey) === 'totalSpend') {
 return [formatCurrency(numericValue, baseCurrency), t('analytics:monthlySpend')];
 }
 return [numericValue, t('analytics:subscriptionCount')];
 }}
 />
 <Legend />

 {/* Emerald/Teal gradient for spending */}
 <Line
 yAxisId="left"
 type="monotone"
 dataKey="totalSpend"
 stroke="#10b981"
 strokeWidth={2.5}
 name={t('analytics:monthlySpend')}
 dot={{ fill: '#10b981', r: 4, strokeWidth: 2, stroke: '#fff' }}
 activeDot={{ r: 6, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
 />
 {/* Sky blue for count */}
 <Line
 yAxisId="right"
 type="monotone"
 dataKey="subscriptionCount"
 stroke="#0ea5e9"
 strokeWidth={2.5}
 name={t('analytics:subscriptionCount')}
 dot={{ fill: '#0ea5e9', r: 4, strokeWidth: 2, stroke: '#fff' }}
 activeDot={{ r: 6, fill: '#0284c7', stroke: '#fff', strokeWidth: 2 }}
 />
 </LineChart>
 </ResponsiveContainer>

    <div className="mt-6 flex flex-wrap gap-6 text-sm">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 bg-[#10b981] rounded-full"></div>
        <span className="text-gray-500 dark:text-gray-400 font-light">{t('analytics:monthlySpendTrend')}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 bg-[#0ea5e9] rounded-full"></div>
        <span className="text-gray-500 dark:text-gray-400 font-light">{t('analytics:subscriptionCountChange')}</span>
      </div>
    </div>
  </div>
 );
}
