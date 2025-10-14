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
  const [hoveredDay, setHoveredDay] = useState<RenewalHeatmapData | null>(null);
  const [selectedDay, setSelectedDay] = useState<RenewalHeatmapData | null>(null);

  // 找到最大金额用于计算颜色强度
  const maxAmount = Math.max(...data.map(d => d.amount), 1);

  // 计算颜色强度（GitHub 风格：5个级别 - 红色系）
  const getColorClass = (amount: number) => {
    if (amount === 0) return 'bg-gray-100 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700';
    const intensity = amount / maxAmount;
    if (intensity <= 0.2) return 'bg-red-200 dark:bg-red-900/40';
    if (intensity <= 0.4) return 'bg-red-300 dark:bg-red-800/60';
    if (intensity <= 0.6) return 'bg-red-400 dark:bg-red-700/70';
    if (intensity <= 0.8) return 'bg-red-500 dark:bg-red-600/80';
    return 'bg-red-600 dark:bg-red-500';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-red-600" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Monthly Renewal Distribution Heatmap
        </h3>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Subscription renewal distribution for days 1-31 of the month, click cells for details
      </p>

      {/* GitHub-style compact heatmap */}
      <div className="mb-6">
        {/* Date labels (every 5 days) */}
        <div className="grid grid-cols-[repeat(31,1fr)] gap-[3px] mb-1 pl-8">
          {data.map((item) => (
            <div key={item.date} className="text-center">
              {item.date % 5 === 1 && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {item.date}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-6">Day</span>
          <div className="grid grid-cols-[repeat(31,1fr)] gap-[3px] flex-1">
            {data.map((item) => {
              const isHovered = hoveredDay?.date === item.date;
              const isSelected = selectedDay?.date === item.date;

              return (
                <div
                  key={item.date}
                  className={`
                    aspect-square rounded-sm cursor-pointer transition-all duration-150
                    ${getColorClass(item.amount)}
                    ${isHovered ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-800 scale-110 z-10' : ''}
                    ${isSelected ? 'ring-2 ring-orange-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-800' : ''}
                    relative group
                  `}
                  onMouseEnter={() => setHoveredDay(item)}
                  onMouseLeave={() => setHoveredDay(null)}
                  onClick={() => item.count > 0 && setSelectedDay(item)}
                >
                  {/* Hover Tooltip */}
                  {isHovered && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50 pointer-events-none">
                      <div className="font-semibold mb-1">Day {item.date}</div>
                      {item.count > 0 ? (
                        <>
                          <div>{item.count} subscription{item.count > 1 ? 's' : ''}</div>
                          <div className="text-red-300">{formatCurrency(item.amount, baseCurrency)}</div>
                        </>
                      ) : (
                        <div className="text-gray-400">No renewals</div>
                      )}
                      {/* Arrow */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                        <div className="border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Compact legend */}
      <div className="flex items-center justify-between mb-6 text-xs">
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <span>Spending:</span>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Less</span>
            <div className="flex gap-1">
              <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700"></div>
              <div className="w-3 h-3 rounded-sm bg-red-200 dark:bg-red-900/40"></div>
              <div className="w-3 h-3 rounded-sm bg-red-300 dark:bg-red-800/60"></div>
              <div className="w-3 h-3 rounded-sm bg-red-400 dark:bg-red-700/70"></div>
              <div className="w-3 h-3 rounded-sm bg-red-500 dark:bg-red-600/80"></div>
              <div className="w-3 h-3 rounded-sm bg-red-600 dark:bg-red-500"></div>
            </div>
            <span className="text-gray-500">More</span>
          </div>
        </div>
        <div className="text-gray-500 dark:text-gray-400">
          Click cells for details
        </div>
      </div>

      {/* Selected date details */}
      {selectedDay && selectedDay.count > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900 dark:text-white">
              Day {selectedDay.date} Renewal Details
            </h4>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              aria-label="Close details"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="flex flex-col">
              <span className="text-xs text-gray-600 dark:text-gray-400 mb-1">Subscriptions</span>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {selectedDay.count}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Amount</span>
              <span className="text-lg font-semibold text-red-600 dark:text-red-400">
                {formatCurrency(selectedDay.amount, baseCurrency)}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-red-200 dark:border-red-800">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Subscription List</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {selectedDay.subscriptions.map((sub, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center text-sm bg-white dark:bg-gray-800 px-3 py-2 rounded-lg"
                >
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{sub.name}</span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatCurrency(sub.cost, baseCurrency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compact statistics */}
      <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {data.filter(d => d.count > 0).length}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Days with Renewals</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {data.reduce((sum, d) => sum + d.count, 0)}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total Monthly Renewals</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {data.filter(d => d.count > 0).length > 0
              ? Math.round(
                  data.reduce((sum, d) => sum + d.count, 0) /
                    data.filter(d => d.count > 0).length
                )
              : 0}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Avg Renewals/Day</p>
        </div>
      </div>
    </div>
  );
}
