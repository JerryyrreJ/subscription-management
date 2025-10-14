import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TopSubscription } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';
import { TrendingUp } from 'lucide-react';

interface TopSubscriptionsChartProps {
  data: TopSubscription[];
  baseCurrency: Currency;
}

export function TopSubscriptionsChart({ data, baseCurrency }: TopSubscriptionsChartProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Top 5 订阅排行
        </h3>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="horizontal">
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
            tick={{ fill: 'currentColor', fontSize: 12 }}
            className="text-gray-600 dark:text-gray-400"
            width={100}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
            }}
            formatter={(value: number) => formatCurrency(value, baseCurrency)}
            labelStyle={{ color: '#374151', fontWeight: 'bold' }}
          />
          <Bar dataKey="monthlyCost" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* 详细列表 */}
      <div className="mt-4 space-y-3">
        {data.map((sub, index) => (
          <div
            key={sub.name}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 rounded-full font-semibold text-sm flex-shrink-0">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {sub.name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {sub.category} · {sub.billingCycle}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <p className="font-semibold text-gray-900 dark:text-white">
                {formatCurrency(sub.monthlyCost, baseCurrency)}/月
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatCurrency(sub.yearlyCost, baseCurrency)}/年
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
