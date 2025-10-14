import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CategoryAnalysis } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';

interface CategoryPieChartProps {
  data: CategoryAnalysis[];
  baseCurrency: Currency;
}

const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#ef4444', '#14b8a6'];

export function CategoryPieChart({ data, baseCurrency }: CategoryPieChartProps) {
  // 准备饼图数据
  const pieData = data.map(item => ({
    name: item.category,
    value: item.totalSpend,
    percentage: item.percentage,
    count: item.subscriptionCount,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        分类支出占比
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percentage }) => `${name} ${percentage.toFixed(1)}%`}
            outerRadius={90}
            fill="#8884d8"
            dataKey="value"
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
            }}
            formatter={(value: number) => formatCurrency(value, baseCurrency)}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* 图例列表 */}
      <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
        {data.map((item, index) => (
          <div key={item.category} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-gray-700 dark:text-gray-300 truncate">
                {item.category}
              </span>
              <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                ({item.subscriptionCount})
              </span>
            </div>
            <div className="text-right flex-shrink-0 ml-2">
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(item.totalSpend, baseCurrency)}
              </span>
              <span className="text-gray-500 dark:text-gray-400 ml-2">
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
