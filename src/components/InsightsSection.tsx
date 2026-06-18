import { OptimizationSuggestion } from '../utils/reportAnalytics';
import { useTranslation } from 'react-i18next';
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
 return <AlertTriangle className="w-5 h-5"/>;
 case 'multiple_in_category':
 return <TrendingDown className="w-5 h-5"/>;
 case 'annual_saving':
 return <DollarSign className="w-5 h-5"/>;
 default:
 return <Lightbulb className="w-5 h-5"/>;
 }
};

const getSuggestionColor = (type: OptimizationSuggestion['type']) => {
  switch (type) {
    case 'expensive':
      return {
        bg: 'bg-transparent',
        border: 'border-gray-200 dark:border-white/10',
        icon: 'text-gray-500 dark:text-gray-400',
        badge: 'bg-gray-900 text-white dark:bg-white dark:text-gray-900',
      };
    case 'multiple_in_category':
      return {
        bg: 'bg-transparent',
        border: 'border-gray-200 dark:border-white/10',
        icon: 'text-gray-500 dark:text-gray-400',
        badge: 'bg-gray-900 text-white dark:bg-white dark:text-gray-900',
      };
    case 'annual_saving':
      return {
        bg: 'bg-transparent',
        border: 'border-gray-200 dark:border-white/10',
        icon: 'text-gray-500 dark:text-gray-400',
        badge: 'bg-gray-900 text-white dark:bg-white dark:text-gray-900',
      };
    default:
      return {
        bg: 'bg-transparent',
        border: 'border-gray-200 dark:border-white/10',
        icon: 'text-gray-500 dark:text-gray-400',
        badge: 'bg-gray-900 text-white dark:bg-white dark:text-gray-900',
      };
  }
};

export function InsightsSection({ suggestions, baseCurrency }: InsightsSectionProps) {
 const { t } = useTranslation(['analytics']);

 if (suggestions.length === 0) {
 return (
 <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-base font-medium text-gray-900 dark:text-white">
          {t('analytics:insightsTitle')}
        </h3>
      </div>
 <div className="text-center py-8">
 <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-fey">
 <svg
 className="w-8 h-8 text-white"
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
 <p className="text-gray-600 dark:text-gray-400 font-medium">
 {t('analytics:healthyState')}
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
 <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-base font-medium text-gray-900 dark:text-white">
          {t('analytics:insightsTitle')}
        </h3>
        {totalPotentialSaving > 0 && (
          <div className="px-3 py-1 bg-gray-100 dark:bg-white/10 rounded-lg border border-gray-200 dark:border-white/10">
            <span className="text-xs font-medium text-gray-900 dark:text-white">
              {t('analytics:potentialSavings', { amount: formatCurrency(totalPotentialSaving, baseCurrency) })}
            </span>
          </div>
        )}
      </div>

 <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
 {t(
  suggestions.length === 1
   ? 'analytics:opportunitiesFoundOne'
   : 'analytics:opportunitiesFoundOther',
  { count: suggestions.length }
 )}
 </p>

 <div className="space-y-4">
 {suggestions.map((suggestion, index) => {
 const colors = getSuggestionColor(suggestion.type);

 return (
 <div
 key={index}
 className={`p-5 rounded-xl border ${colors.bg} ${colors.border} transition-all`}
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
 <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${colors.badge} flex-shrink-0 font-bold`}>
 {t('analytics:saveAmount', { amount: formatCurrency(suggestion.potentialSaving, baseCurrency) })}
 </span>
 )}
 </div>

 <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
 {suggestion.description}
 </p>

 {suggestion.subscriptions.length > 0 && (
 <div className="mt-2">
 <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">
 {t('analytics:affectedSubscriptions')}
 </p>
 <div className="flex flex-wrap gap-1.5">
 {suggestion.subscriptions.slice(0, 5).map((subName, idx) => (
 <span
 key={idx}
 className="text-xs px-2 py-1 bg-gray-50 dark:bg-white/[0.02] rounded-md border border-gray-200/50 dark:border-white/5 text-gray-600 dark:text-gray-400 font-light"
 >
 {subName}
 </span>
 ))}
 {suggestion.subscriptions.length > 5 && (
 <span className="text-xs px-2.5 py-1 text-gray-500 dark:text-gray-400 font-medium">
 {t('analytics:moreSubscriptions', { count: suggestion.subscriptions.length - 5 })}
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
 {t('analytics:insightsFootnote')}
 </p>
 </div>
 </div>
 );
}
