import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { CategoryAnalysis } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';

interface CategoryPieChartProps {
 data: CategoryAnalysis[];
 baseCurrency: Currency;
}

// Refined color palette - avoiding AI purple/pink
const COLORS = ['#10b981', '#059669', '#0ea5e9', '#f59e0b', '#f43f5e', '#64748b', '#334155', '#0f172a'];

interface PieTooltipEntry {
 name?: string;
 value?: number;
 payload?: {
  percentage?: number;
  count?: number;
 };
}

function CategoryPieTooltip({
 active,
 payload,
 baseCurrency,
}: {
 active?: boolean;
 payload?: PieTooltipEntry[];
 baseCurrency: Currency;
}) {
 if (!active || !payload?.length) return null;
 const item = payload[0];
 const value = Number(item.value ?? 0);
 const percentage = item.payload?.percentage ?? 0;

 return (
  <div className="rounded-xl border border-gray-200 dark:border-white/15 bg-white/95 dark:bg-[#1a1c1e]/95 backdrop-blur-md px-3.5 py-2.5 shadow-lg text-xs">
   <p className="font-semibold text-gray-900 dark:text-white">{item.name}</p>
   <p className="mt-1 text-gray-700 dark:text-gray-300">
    {formatCurrency(value, baseCurrency)}
    <span className="ml-2 text-gray-400">({percentage.toFixed(1)}%)</span>
   </p>
  </div>
 );
}

export function CategoryPieChart({ data, baseCurrency }: CategoryPieChartProps) {
 const { t } = useTranslation(['analytics']);

 // Prepare pie chart data
 const pieData = data.map(item => ({
  name: item.category,
  value: item.totalSpend,
  percentage: item.percentage,
  count: item.subscriptionCount,
 }));

 return (
  <div className="bg-white dark:bg-white/5 rounded-2xl p-4 sm:p-6 border border-gray-200 dark:border-white/10">
   <div className="flex items-center justify-between mb-6 sm:mb-8">
    <h3 className="text-base font-medium text-gray-900 dark:text-white">
     {t('analytics:categorySpendingDistribution')}
    </h3>
   </div>

   <ResponsiveContainer width="100%" height={260}>
    <PieChart>
     <Pie
      data={pieData}
      cx="50%"
      cy="50%"
      labelLine={false}
      innerRadius={52}
      outerRadius={92}
      paddingAngle={2}
      fill="#10b981"
      dataKey="value"
     >
      {pieData.map((entry, index) => (
       <Cell key={`cell-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
      ))}
     </Pie>
     <Tooltip content={<CategoryPieTooltip baseCurrency={baseCurrency} />} />
    </PieChart>
   </ResponsiveContainer>

   {/* Refined Legend List */}
   <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
    {data.map((item, index) => (
     <div
      key={`${item.category}-${index}`}
      className="flex items-center justify-between text-sm p-3 border-b border-gray-100 dark:border-white/5 last:border-0 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors rounded-xl"
     >
      <div className="flex items-center gap-3 flex-1 min-w-0">
       <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: COLORS[index % COLORS.length] }}
       />
       <span className="text-gray-700 dark:text-gray-300 truncate font-light">
        {item.category}
       </span>
       <span className="text-gray-400 flex-shrink-0 text-xs font-light">
        ({item.subscriptionCount})
       </span>
      </div>
      <div className="text-right flex-shrink-0 ml-4">
       <span className="font-medium text-gray-900 dark:text-white">
        {formatCurrency(item.totalSpend, baseCurrency)}
       </span>
       <span className="text-gray-400 ml-3 text-xs font-light inline-block w-10 text-right">
        {item.percentage.toFixed(1)}%
       </span>
      </div>
     </div>
    ))}
   </div>
  </div>
 );
}
