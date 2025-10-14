import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SpendingTrend } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';

interface SpendingTrendChartProps {
  data: SpendingTrend[];
  baseCurrency: Currency;
}

export function SpendingTrendChart({ data, baseCurrency }: SpendingTrendChartProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        支出趋势 (近12个月)
      </h3>

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
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
            }}
            formatter={(value: number, name: string) => {
              if (name === '月度支出') {
                return [formatCurrency(value, baseCurrency), name];
              }
              return [value, name];
            }}
          />
          <Legend />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="totalSpend"
            stroke="#8b5cf6"
            strokeWidth={2}
            name="月度支出"
            dot={{ fill: '#8b5cf6', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="subscriptionCount"
            stroke="#10b981"
            strokeWidth={2}
            name="订阅数量"
            dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
          <span className="text-gray-600 dark:text-gray-400">月度支出趋势</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-600 rounded-full"></div>
          <span className="text-gray-600 dark:text-gray-400">订阅数量变化</span>
        </div>
      </div>
    </div>
  );
}
