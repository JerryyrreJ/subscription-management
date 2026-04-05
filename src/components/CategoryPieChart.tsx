import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
 <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-fey hover:shadow-apple-lg transition-shadow p-6 border border-gray-100 dark:border-gray-700">
 <div className="flex items-center gap-2 mb-4">
 <div className="w-1 h-6 bg-gradient-to-b from-sky-500 rounded-full"></div>
 <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
 {t('analytics:categorySpendingDistribution')}
 </h3>
 </div>

 <ResponsiveContainer width="100%"height={300}>
 <PieChart>
 <Pie
 data={pieData}
 cx="50%"
 cy="50%"
 labelLine={false}
 label={({ name, percentage }) => `${name} ${percentage.toFixed(1)}%`}
 outerRadius={90}
 fill="#10b981"
 dataKey="value"
 >
 {pieData.map((entry, index) => (
 <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
 ))}
 </Pie>
 <Tooltip
 contentStyle={{
 backgroundColor: 'rgba(255, 255, 255, 0.98)',
 border: '1px solid #e5e7eb',
 borderRadius: '0.75rem',
 boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
 }}
 formatter={(value: number) => formatCurrency(value, baseCurrency)}
 />
 </PieChart>
 </ResponsiveContainer>

 {/* Refined Legend List */}
 <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
 {data.map((item, index) => (
 <div key={item.category} className="flex items-center justify-between text-sm p-2 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
 <div className="flex items-center gap-2 flex-1 min-w-0">
 <div
 className="w-3 h-3 rounded-full flex-shrink-0 shadow-apple-sm"
 style={{ backgroundColor: COLORS[index % COLORS.length] }}
 />
 <span className="text-gray-700 dark:text-gray-300 truncate font-medium">
 {item.category}
 </span>
 <span className="text-gray-500 dark:text-gray-400 flex-shrink-0 text-xs">
 ({item.subscriptionCount})
 </span>
 </div>
 <div className="text-right flex-shrink-0 ml-2">
 <span className="font-semibold text-gray-900 dark:text-white">
 {formatCurrency(item.totalSpend, baseCurrency)}
 </span>
 <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">
 {item.percentage.toFixed(1)}%
 </span>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
}
