import { Subscription, Currency, ExchangeRates } from '../types';
import { convertCurrency } from './currency';

// ===== 类型定义 =====

export interface SpendingTrend {
  month: string; // 'YYYY-MM'
  monthLabel: string; // 'Jan 2024'
  totalSpend: number;
  subscriptionCount: number;
}

export interface CategoryAnalysis {
  category: string;
  totalSpend: number;
  percentage: number;
  subscriptionCount: number;
  avgCost: number;
  subscriptions: {
    name: string;
    cost: number;
    billingCycle: string;
  }[];
}

export interface TopSubscription {
  name: string;
  category: string;
  monthlyCost: number;
  yearlyCost: number;
  billingCycle: string;
}

export interface RenewalHeatmapData {
  date: number; // 1-31
  count: number;
  amount: number;
  subscriptions: {
    name: string;
    cost: number;
  }[];
}

export interface OptimizationSuggestion {
  type: 'expensive' | 'multiple_in_category' | 'annual_saving';
  title: string;
  description: string;
  potentialSaving?: number;
  subscriptions: string[];
}

export interface ReportOverview {
  totalMonthlySpend: number;
  totalYearlySpend: number;
  activeSubscriptions: number;
  avgSubscriptionCost: number;
  categoryBreakdown: {
    category: string;
    amount: number;
    percentage: number;
    count: number;
  }[];
}

export interface ReportData {
  overview: ReportOverview;
  spendingTrend: SpendingTrend[];
  categoryAnalysis: CategoryAnalysis[];
  topSubscriptions: TopSubscription[];
  renewalHeatmap: RenewalHeatmapData[];
  optimizationSuggestions: OptimizationSuggestion[];
}

// ===== 辅助函数 =====

/**
 * 计算订阅的月度成本
 */
export const calculateMonthlyCost = (subscription: Subscription): number => {
  switch (subscription.period) {
    case 'monthly':
      return subscription.amount;
    case 'yearly':
      return subscription.amount / 12;
    case 'custom':
      if (subscription.customDate) {
        const days = parseInt(subscription.customDate);
        return (subscription.amount / days) * 30;
      }
      return subscription.amount;
    default:
      return subscription.amount;
  }
};

/**
 * 计算订阅的年度成本
 */
export const calculateYearlyCost = (subscription: Subscription): number => {
  return calculateMonthlyCost(subscription) * 12;
};

/**
 * 获取过去N个月的月份列表
 */
const getLast12Months = (): { month: string; monthLabel: string }[] => {
  const months: { month: string; monthLabel: string }[] = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    months.push({ month, monthLabel });
  }

  return months;
};

/**
 * 检查订阅在指定月份是否活跃
 */
const isActiveInMonth = (subscription: Subscription, monthStr: string): boolean => {
  const [year, month] = monthStr.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const createdDate = subscription.createdAt ? new Date(subscription.createdAt) : new Date(subscription.lastPaymentDate);

  // 如果订阅创建日期晚于月末，说明这个月还不存在该订阅
  if (createdDate > monthEnd) {
    return false;
  }

  return true;
};

// ===== 核心计算函数 =====

/**
 * 计算支出趋势（过去12个月）
 */
export const calculateSpendingTrend = (
  subscriptions: Subscription[],
  baseCurrency: Currency,
  exchangeRates: ExchangeRates
): SpendingTrend[] => {
  const last12Months = getLast12Months();

  return last12Months.map(({ month, monthLabel }) => {
    const activeInMonth = subscriptions.filter(sub => isActiveInMonth(sub, month));

    const totalSpend = activeInMonth.reduce((sum, sub) => {
      const monthlyCost = calculateMonthlyCost(sub);
      const convertedCost = convertCurrency(
        monthlyCost,
        sub.currency,
        baseCurrency,
        exchangeRates,
        baseCurrency
      );
      return sum + convertedCost;
    }, 0);

    return {
      month,
      monthLabel,
      totalSpend,
      subscriptionCount: activeInMonth.length,
    };
  });
};

/**
 * 计算分类支出分析
 */
export const calculateCategoryAnalysis = (
  subscriptions: Subscription[],
  baseCurrency: Currency,
  exchangeRates: ExchangeRates
): CategoryAnalysis[] => {
  // 按分类分组
  const categoryMap = new Map<string, Subscription[]>();

  subscriptions.forEach(sub => {
    const category = sub.category || 'Uncategorized';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(sub);
  });

  // 计算总支出
  const totalMonthlySpend = subscriptions.reduce((sum, sub) => {
    const monthlyCost = calculateMonthlyCost(sub);
    const convertedCost = convertCurrency(
      monthlyCost,
      sub.currency,
      baseCurrency,
      exchangeRates,
      baseCurrency
    );
    return sum + convertedCost;
  }, 0);

  // 计算每个分类的数据
  const categoryAnalysis: CategoryAnalysis[] = [];

  categoryMap.forEach((subs, category) => {
    const categorySpend = subs.reduce((sum, sub) => {
      const monthlyCost = calculateMonthlyCost(sub);
      const convertedCost = convertCurrency(
        monthlyCost,
        sub.currency,
        baseCurrency,
        exchangeRates,
        baseCurrency
      );
      return sum + convertedCost;
    }, 0);

    categoryAnalysis.push({
      category,
      totalSpend: categorySpend,
      percentage: totalMonthlySpend > 0 ? (categorySpend / totalMonthlySpend) * 100 : 0,
      subscriptionCount: subs.length,
      avgCost: categorySpend / subs.length,
      subscriptions: subs.map(sub => ({
        name: sub.name,
        cost: convertCurrency(
          calculateMonthlyCost(sub),
          sub.currency,
          baseCurrency,
          exchangeRates,
          baseCurrency
        ),
        billingCycle: sub.period === 'custom' ? `${sub.customDate} days` : sub.period,
      })),
    });
  });

  // 按支出从高到低排序
  return categoryAnalysis.sort((a, b) => b.totalSpend - a.totalSpend);
};

/**
 * 获取Top订阅排行
 */
export const getTopSubscriptions = (
  subscriptions: Subscription[],
  baseCurrency: Currency,
  exchangeRates: ExchangeRates,
  limit: number = 5
): TopSubscription[] => {
  const topSubs = subscriptions.map(sub => {
    const monthlyCost = convertCurrency(
      calculateMonthlyCost(sub),
      sub.currency,
      baseCurrency,
      exchangeRates,
      baseCurrency
    );

    return {
      name: sub.name,
      category: sub.category,
      monthlyCost,
      yearlyCost: monthlyCost * 12,
      billingCycle: sub.period === 'custom' ? `${sub.customDate} days` : sub.period,
    };
  });

  // 按月度成本排序
  return topSubs.sort((a, b) => b.monthlyCost - a.monthlyCost).slice(0, limit);
};

/**
 * 生成续费热力图数据
 */
export const generateRenewalHeatmap = (
  subscriptions: Subscription[],
  baseCurrency: Currency,
  exchangeRates: ExchangeRates
): RenewalHeatmapData[] => {
  // 初始化1-31日的数据
  const heatmapData: RenewalHeatmapData[] = Array.from({ length: 31 }, (_, i) => ({
    date: i + 1,
    count: 0,
    amount: 0,
    subscriptions: [],
  }));

  subscriptions.forEach(sub => {
    const nextPaymentDate = new Date(sub.nextPaymentDate);
    const dayOfMonth = nextPaymentDate.getDate();

    if (dayOfMonth >= 1 && dayOfMonth <= 31) {
      const monthlyCost = convertCurrency(
        calculateMonthlyCost(sub),
        sub.currency,
        baseCurrency,
        exchangeRates,
        baseCurrency
      );

      const data = heatmapData[dayOfMonth - 1];
      data.count++;
      data.amount += monthlyCost;
      data.subscriptions.push({
        name: sub.name,
        cost: monthlyCost,
      });
    }
  });

  return heatmapData;
};

/**
 * 生成优化建议
 */
export const generateOptimizationSuggestions = (
  subscriptions: Subscription[],
  baseCurrency: Currency,
  exchangeRates: ExchangeRates
): OptimizationSuggestion[] => {
  const suggestions: OptimizationSuggestion[] = [];

  // 建议1: 检测昂贵的订阅（月度成本超过平均值2倍）
  const avgMonthlyCost = subscriptions.reduce((sum, sub) => {
    return sum + convertCurrency(
      calculateMonthlyCost(sub),
      sub.currency,
      baseCurrency,
      exchangeRates,
      baseCurrency
    );
  }, 0) / subscriptions.length;

  const expensiveSubs = subscriptions.filter(sub => {
    const cost = convertCurrency(
      calculateMonthlyCost(sub),
      sub.currency,
      baseCurrency,
      exchangeRates,
      baseCurrency
    );
    return cost > avgMonthlyCost * 2;
  });

  if (expensiveSubs.length > 0) {
    suggestions.push({
      type: 'expensive',
      title: '高成本订阅检测',
      description: `检测到 ${expensiveSubs.length} 个高成本订阅，其月度费用超过平均水平的2倍。建议评估这些订阅的必要性。`,
      subscriptions: expensiveSubs.map(s => s.name),
    });
  }

  // 建议2: 同一分类中有多个订阅
  const categoryMap = new Map<string, Subscription[]>();
  subscriptions.forEach(sub => {
    const category = sub.category || 'Uncategorized';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(sub);
  });

  categoryMap.forEach((subs, category) => {
    if (subs.length >= 3 && category !== 'Uncategorized') {
      const totalCost = subs.reduce((sum, sub) => {
        return sum + convertCurrency(
          calculateMonthlyCost(sub),
          sub.currency,
          baseCurrency,
          exchangeRates,
          baseCurrency
        );
      }, 0);

      suggestions.push({
        type: 'multiple_in_category',
        title: `${category}分类订阅较多`,
        description: `${category}分类中有 ${subs.length} 个订阅，考虑是否可以合并或精简。`,
        potentialSaving: totalCost * 0.3, // 假设可以节省30%
        subscriptions: subs.map(s => s.name),
      });
    }
  });

  // 建议3: 月付改年付可以节省
  const monthlySubs = subscriptions.filter(sub => sub.period === 'monthly');
  if (monthlySubs.length > 0) {
    const potentialSaving = monthlySubs.reduce((sum, sub) => {
      const monthlyCost = convertCurrency(
        sub.amount,
        sub.currency,
        baseCurrency,
        exchangeRates,
        baseCurrency
      );
      // 假设年付可以节省15%
      return sum + monthlyCost * 12 * 0.15;
    }, 0);

    if (potentialSaving > 0) {
      suggestions.push({
        type: 'annual_saving',
        title: '考虑切换到年付',
        description: `您有 ${monthlySubs.length} 个月付订阅。如果这些服务支持年付，通常可以节省10-20%的费用。`,
        potentialSaving,
        subscriptions: monthlySubs.map(s => s.name),
      });
    }
  }

  return suggestions;
};

/**
 * 生成完整的报表数据
 */
export const generateReportData = (
  subscriptions: Subscription[],
  baseCurrency: Currency,
  exchangeRates: ExchangeRates
): ReportData => {
  // 计算概览数据
  const totalMonthlySpend = subscriptions.reduce((sum, sub) => {
    const monthlyCost = calculateMonthlyCost(sub);
    const convertedCost = convertCurrency(
      monthlyCost,
      sub.currency,
      baseCurrency,
      exchangeRates,
      baseCurrency
    );
    return sum + convertedCost;
  }, 0);

  const categoryAnalysis = calculateCategoryAnalysis(subscriptions, baseCurrency, exchangeRates);

  const overview: ReportOverview = {
    totalMonthlySpend,
    totalYearlySpend: totalMonthlySpend * 12,
    activeSubscriptions: subscriptions.length,
    avgSubscriptionCost: subscriptions.length > 0 ? totalMonthlySpend / subscriptions.length : 0,
    categoryBreakdown: categoryAnalysis.map(cat => ({
      category: cat.category,
      amount: cat.totalSpend,
      percentage: cat.percentage,
      count: cat.subscriptionCount,
    })),
  };

  return {
    overview,
    spendingTrend: calculateSpendingTrend(subscriptions, baseCurrency, exchangeRates),
    categoryAnalysis,
    topSubscriptions: getTopSubscriptions(subscriptions, baseCurrency, exchangeRates, 5),
    renewalHeatmap: generateRenewalHeatmap(subscriptions, baseCurrency, exchangeRates),
    optimizationSuggestions: generateOptimizationSuggestions(subscriptions, baseCurrency, exchangeRates),
  };
};
