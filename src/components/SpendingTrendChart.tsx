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
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Spending Trend (Last 12 Months)
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
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              border: '1px solid #e5e7eb',
              borderRadius: '0.75rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'Monthly Spend') {
                return [formatCurrency(value, baseCurrency), name];
              }
              return [value, name];
            }}
          />
          <Legend />

          {/* Emerald/Teal gradient for spending */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="totalSpend"
            stroke="#14b8a6"
            strokeWidth={2.5}
            name="Monthly Spend"
            dot={{ fill: '#14b8a6', r: 4, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, fill: '#0d9488', stroke: '#fff', strokeWidth: 2 }}
          />
          {/* Sky blue for count */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="subscriptionCount"
            stroke="#0ea5e9"
            strokeWidth={2.5}
            name="Subscription Count"
            dot={{ fill: '#0ea5e9', r: 4, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, fill: '#0284c7', stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 rounded-lg border border-teal-200/50 dark:border-teal-800/50">
          <div className="w-3 h-3 bg-teal-500 rounded-full shadow-sm"></div>
          <span className="text-gray-700 dark:text-gray-300 font-medium">Monthly Spend Trend</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/30 rounded-lg border border-sky-200/50 dark:border-sky-800/50">
          <div className="w-3 h-3 bg-sky-500 rounded-full shadow-sm"></div>
          <span className="text-gray-700 dark:text-gray-300 font-medium">Subscription Count Change</span>
        </div>
      </div>
    </div>
  );
}
