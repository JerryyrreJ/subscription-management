import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TopSubscription } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';
import { TrendingUp } from 'lucide-react';

interface TopSubscriptionsChartProps {
  data: TopSubscription[];
  baseCurrency: Currency;
}

// Refined gradient colors - teal to emerald spectrum
const COLORS = ['#14b8a6', '#0d9488', '#10b981', '#059669', '#06b6d4'];

export function TopSubscriptionsChart({ data, baseCurrency }: TopSubscriptionsChartProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-6 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full"></div>
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
              borderRadius: '0.75rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              padding: '8px 12px',
            }}
            formatter={(value: number) => [formatCurrency(value, baseCurrency), 'Monthly Cost']}
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

      {/* Refined detailed list */}
      <div className="mt-6 space-y-2.5">
        {data.map((sub, index) => (
          <div
            key={sub.name}
            className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-800/50 rounded-xl border border-gray-200/50 dark:border-gray-700/50 hover:shadow-md hover:scale-[1.01] transition-all"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg font-semibold text-sm flex-shrink-0 text-white shadow-md"
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
