import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TopSubscription } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';
import { TrendingUp } from 'lucide-react';

interface TopSubscriptionsChartProps {
  data: TopSubscription[];
  baseCurrency: Currency;
}

// Gradient colors for bars
const COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];

export function TopSubscriptionsChart({ data, baseCurrency }: TopSubscriptionsChartProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Top 5 Subscriptions
        </h3>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
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
              borderRadius: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              padding: '8px 12px',
            }}
            formatter={(value: number) => [formatCurrency(value, baseCurrency), 'Monthly Cost']}
            labelStyle={{ color: '#374151', fontWeight: 'bold', fontSize: '14px' }}
            cursor={{ fill: 'transparent' }}
          />
          <Bar
            dataKey="monthlyCost"
            radius={[0, 4, 4, 0]}
            activeBar={{
              opacity: 0.8,
            }}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
                style={{ transition: 'opacity 0.2s ease' }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Detailed list */}
      <div className="mt-6 space-y-2.5">
        {data.map((sub, index) => (
          <div
            key={sub.name}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="flex items-center justify-center w-7 h-7 rounded-full font-semibold text-sm flex-shrink-0 text-white"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              >
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white truncate text-sm">
                  {sub.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {sub.category} · {sub.billingCycle}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <p className="font-semibold text-gray-900 dark:text-white text-sm">
                {formatCurrency(sub.monthlyCost, baseCurrency)}/mo
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatCurrency(sub.yearlyCost, baseCurrency)}/yr
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
