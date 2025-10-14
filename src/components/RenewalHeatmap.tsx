import { RenewalHeatmapData } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';
import { Calendar } from 'lucide-react';
import { useState } from 'react';

interface RenewalHeatmapProps {
  data: RenewalHeatmapData[];
  baseCurrency: Currency;
}

export function RenewalHeatmap({ data, baseCurrency }: RenewalHeatmapProps) {
  const [selectedDay, setSelectedDay] = useState<RenewalHeatmapData | null>(null);

  // 找到最大金额用于计算颜色强度
  const maxAmount = Math.max(...data.map(d => d.amount), 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          每月续费分布热力图
        </h3>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        显示每月哪些日期有订阅续费，颜色越深表示支出越多
      </p>

      {/* 热力图网格 */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {data.map((item) => {
          const intensity = item.amount > 0 ? item.amount / maxAmount : 0;
          const bgColor = intensity > 0
            ? `rgba(139, 92, 246, ${Math.max(intensity, 0.2)})`
            : 'transparent';

          return (
            <div
              key={item.date}
              className={`
                aspect-square rounded-lg flex flex-col items-center justify-center
                cursor-pointer transition-all duration-200
                ${item.count > 0
                  ? 'hover:ring-2 hover:ring-purple-500 hover:shadow-lg'
                  : 'border border-gray-200 dark:border-gray-700'
                }
              `}
              style={{
                backgroundColor: bgColor,
              }}
              onClick={() => item.count > 0 && setSelectedDay(item)}
              title={
                item.count > 0
                  ? `${item.date}日: ${item.count}个订阅, ${formatCurrency(item.amount, baseCurrency)}`
                  : `${item.date}日: 无续费`
              }
            >
              <span
                className={`text-xs font-semibold ${
                  intensity > 0.5
                    ? 'text-white'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {item.date}
              </span>
              {item.count > 0 && (
                <span
                  className={`text-xs ${
                    intensity > 0.5
                      ? 'text-white/80'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {item.count}个
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 颜色图例 */}
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
        <span>支出金额：</span>
        <span>低</span>
        <div className="flex gap-1">
          {[0.2, 0.4, 0.6, 0.8, 1.0].map(intensity => (
            <div
              key={intensity}
              className="w-6 h-4 rounded"
              style={{ backgroundColor: `rgba(139, 92, 246, ${intensity})` }}
            />
          ))}
        </div>
        <span>高</span>
      </div>

      {/* 选中日期的详细信息 */}
      {selectedDay && selectedDay.count > 0 && (
        <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {selectedDay.date}日续费详情
            </h4>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">订阅数量：</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {selectedDay.count} 个
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">总金额：</span>
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                {formatCurrency(selectedDay.amount, baseCurrency)}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">订阅列表：</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {selectedDay.subscriptions.map((sub, index) => (
                <div
                  key={index}
                  className="flex justify-between text-sm bg-white dark:bg-gray-800 p-2 rounded"
                >
                  <span className="text-gray-700 dark:text-gray-300">{sub.name}</span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatCurrency(sub.cost, baseCurrency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 统计信息 */}
      <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {data.filter(d => d.count > 0).length}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">有续费的日期</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {data.reduce((sum, d) => sum + d.count, 0)}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">月度总续费次数</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {data.filter(d => d.count > 0).length > 0
              ? Math.round(
                  data.reduce((sum, d) => sum + d.count, 0) /
                    data.filter(d => d.count > 0).length
                )
              : 0}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">平均每日续费数</p>
        </div>
      </div>
    </div>
  );
}
