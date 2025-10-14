import { OptimizationSuggestion } from '../utils/reportAnalytics';
import { Currency } from '../types';
import { formatCurrency } from '../utils/currency';
import { Lightbulb, AlertTriangle, TrendingDown, DollarSign } from 'lucide-react';

interface InsightsSectionProps {
  suggestions: OptimizationSuggestion[];
  baseCurrency: Currency;
}

const getSuggestionIcon = (type: OptimizationSuggestion['type']) => {
  switch (type) {
    case 'expensive':
      return <AlertTriangle className="w-5 h-5" />;
    case 'multiple_in_category':
      return <TrendingDown className="w-5 h-5" />;
    case 'annual_saving':
      return <DollarSign className="w-5 h-5" />;
    default:
      return <Lightbulb className="w-5 h-5" />;
  }
};

const getSuggestionColor = (type: OptimizationSuggestion['type']) => {
  switch (type) {
    case 'expensive':
      return {
        bg: 'bg-orange-50 dark:bg-orange-900/20',
        border: 'border-orange-200 dark:border-orange-800',
        icon: 'text-orange-600 dark:text-orange-400',
        badge: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300',
      };
    case 'multiple_in_category':
      return {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-800',
        icon: 'text-blue-600 dark:text-blue-400',
        badge: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
      };
    case 'annual_saving':
      return {
        bg: 'bg-green-50 dark:bg-green-900/20',
        border: 'border-green-200 dark:border-green-800',
        icon: 'text-green-600 dark:text-green-400',
        badge: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
      };
    default:
      return {
        bg: 'bg-purple-50 dark:bg-purple-900/20',
        border: 'border-purple-200 dark:border-purple-800',
        icon: 'text-purple-600 dark:text-purple-400',
        badge: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300',
      };
  }
};

export function InsightsSection({ suggestions, baseCurrency }: InsightsSectionProps) {
  if (suggestions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Insights & Recommendations
          </h3>
        </div>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-8 h-8 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Great! Your subscription management looks healthy. No optimization suggestions at this time.
          </p>
        </div>
      </div>
    );
  }

  // Calculate total potential savings
  const totalPotentialSaving = suggestions.reduce(
    (sum, s) => sum + (s.potentialSaving || 0),
    0
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Insights & Recommendations
          </h3>
        </div>
        {totalPotentialSaving > 0 && (
          <div className="px-3 py-1 bg-green-100 dark:bg-green-900/30 rounded-full">
            <span className="text-sm font-semibold text-green-700 dark:text-green-300">
              Potential Savings: {formatCurrency(totalPotentialSaving, baseCurrency)}/yr
            </span>
          </div>
        )}
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Based on your subscription data, we've identified {suggestions.length} optimization opportunit{suggestions.length > 1 ? 'ies' : 'y'}
      </p>

      <div className="space-y-4">
        {suggestions.map((suggestion, index) => {
          const colors = getSuggestionColor(suggestion.type);

          return (
            <div
              key={index}
              className={`p-4 rounded-lg border ${colors.bg} ${colors.border}`}
            >
              <div className="flex items-start gap-3">
                <div className={`${colors.icon} flex-shrink-0 mt-0.5`}>
                  {getSuggestionIcon(suggestion.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      {suggestion.title}
                    </h4>
                    {suggestion.potentialSaving && suggestion.potentialSaving > 0 && (
                      <span className={`text-xs px-2 py-1 rounded-full ${colors.badge} flex-shrink-0`}>
                        Save {formatCurrency(suggestion.potentialSaving, baseCurrency)}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    {suggestion.description}
                  </p>

                  {suggestion.subscriptions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Affected subscriptions:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {suggestion.subscriptions.slice(0, 5).map((subName, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-1 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                          >
                            {subName}
                          </span>
                        ))}
                        {suggestion.subscriptions.length > 5 && (
                          <span className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400">
                            +{suggestion.subscriptions.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom tip */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          💡 These suggestions are generated based on data analysis. Please evaluate based on your actual needs.
        </p>
      </div>
    </div>
  );
}
