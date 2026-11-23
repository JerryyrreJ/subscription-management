import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { SpendingTrend } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';

interface SpendingTrendChartProps {
 data: SpendingTrend[];
 baseCurrency: Currency;
}

interface TrendTooltipEntry {
 dataKey?: string | number;
 value?: number | string;
 color?: string;
}

interface TrendTooltipProps {
 active?: boolean;
 label?: string;
 payload?: TrendTooltipEntry[];
 baseCurrency: Currency;
 monthlySpendLabel: string;
 subscriptionCountLabel: string;
}

function TrendTooltip({
 active,
 label,
 payload,
 baseCurrency,
 monthlySpendLabel,
 subscriptionCountLabel,
}: TrendTooltipProps) {
 if (!active || !payload?.length) return null;

 return (
  <div className="rounded-xl border border-gray-200 dark:border-white/15 bg-white/95 dark:bg-[#1a1c1e]/95 backdrop-blur-md px-3.5 py-2.5 shadow-lg text-xs">
   {label && (
    <p className="font-semibold text-gray-900 dark:text-white mb-1.5">{label}</p>
   )}
   <div className="space-y-1">
    {payload.map((entry, idx) => {
     const isSpend = String(entry.dataKey) === 'totalSpend';
     const numericValue = Number(entry.value ?? 0);
     return (
      <div key={`${entry.dataKey ?? idx}`} className="flex items-center justify-between gap-4">
       <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
        <span
         className="w-2 h-2 rounded-full shrink-0"
         style={{ backgroundColor: entry.color || (isSpend ? '#10b981' : '#0ea5e9') }}
        />
        {isSpend ? monthlySpendLabel : subscriptionCountLabel}
       </span>
       <span className="font-medium text-gray-900 dark:text-white">
        {isSpend ? formatCurrency(numericValue, baseCurrency) : numericValue}
       </span>
      </div>
     );
    })}
   </div>
  </div>
 );
}

export function SpendingTrendChart({ data, baseCurrency }: SpendingTrendChartProps) {
 const { t } = useTranslation(['analytics']);

 return (
  <div className="bg-white dark:bg-white/5 rounded-2xl p-4 sm:p-6 border border-gray-200 dark:border-white/10">
   <div className="flex items-center justify-between mb-6 sm:mb-8">
    <h3 className="text-base font-medium text-gray-900 dark:text-white">
     {t('analytics:spendingTrendTitle')}
    </h3>
   </div>

   <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data}>
     <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
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
      content={(
       <TrendTooltip
        baseCurrency={baseCurrency}
        monthlySpendLabel={t('analytics:monthlySpend')}
        subscriptionCountLabel={t('analytics:subscriptionCount')}
       />
      )}
     />

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

   <div className="mt-5 flex flex-wrap gap-6 text-sm">
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
