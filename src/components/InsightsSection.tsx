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
 bg: 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30',
 border: 'border-amber-200/50 dark:border-amber-800/50',
 icon: 'text-amber-600 dark:text-amber-400',
 badge: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-apple',
 };
 case 'multiple_in_category':
 return {
 bg: 'bg-gradient-to-br from-sky-50 dark:from-sky-950/30 dark:',
 border: 'border-sky-200/50 dark:border-sky-800/50',
 icon: 'text-sky-600 dark:text-sky-400',
 badge: 'bg-gradient-to-r from-sky-500 text-white shadow-apple',
 };
 case 'annual_saving':
 return {
 bg: 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30',
 border: 'border-emerald-200/50 dark:border-emerald-800/50',
 icon: 'text-emerald-600 dark:text-emerald-400',
 badge: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-apple',
 };
 default:
 return {
 bg: 'bg-zinc-50 dark:bg-zinc-900/50',
 border: 'border-zinc-200 dark:border-zinc-800 dark:border-zinc-700/50 dark:border-zinc-700/50',
 icon: 'text-emerald-700 dark:text-emerald-400 dark:text-zinc-600 dark:text-zinc-400',
 badge: 'bg-gradient-to-r text-white shadow-apple',
 };
 }
};

export function InsightsSection({ suggestions, baseCurrency }: InsightsSectionProps) {
 if (suggestions.length === 0) {
 return (
 <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-fey hover:shadow-apple-lg transition-shadow p-6 border border-gray-100 dark:border-gray-700">
 <div className="flex items-center gap-2 mb-4">
 <div className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
 <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
 Insights & Recommendations
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
 <div className="bg-white dark:bg-[#1a1c1e] rounded-3xl shadow-fey hover:shadow-apple-lg transition-shadow p-6 border border-gray-100 dark:border-gray-700">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <div className="w-1 h-6 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full"></div>
 <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
 Insights & Recommendations
 </h3>
 </div>
 {totalPotentialSaving > 0 && (
 <div className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-3xl shadow-apple hover:shadow-fey transition-shadow">
 <span className="text-sm font-semibold text-white">
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
 className={`p-4 rounded-3xl border ${colors.bg} ${colors.border} shadow-apple hover:shadow-fey transition-all`}
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
 <span className={`text-xs px-3 py-1.5 rounded-2xl ${colors.badge} flex-shrink-0 font-medium`}>
 Save {formatCurrency(suggestion.potentialSaving, baseCurrency)}
 </span>
 )}
 </div>

 <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
 {suggestion.description}
 </p>

 {suggestion.subscriptions.length > 0 && (
 <div className="mt-2">
 <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">
 Affected subscriptions:
 </p>
 <div className="flex flex-wrap gap-1.5">
 {suggestion.subscriptions.slice(0, 5).map((subName, idx) => (
 <span
 key={idx}
 className="text-xs px-2.5 py-1 bg-white dark:bg-[#1a1c1e] rounded-2xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 shadow-apple-sm"
 >
 {subName}
 </span>
 ))}
 {suggestion.subscriptions.length > 5 && (
 <span className="text-xs px-2.5 py-1 text-gray-500 dark:text-gray-400 font-medium">
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
