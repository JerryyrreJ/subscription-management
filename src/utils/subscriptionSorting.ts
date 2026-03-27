import { Currency, ExchangeRates, SortConfig, Subscription } from '../types';
import { convertCurrency } from './currency';
import { parseDateOnly } from './dates';

const getCustomPeriodDays = (subscription: Subscription): number => {
 const parsedDays = Number.parseInt(subscription.customDate || '30', 10);
 return parsedDays > 0 ? parsedDays : 30;
};

export const getSubscriptionDailyPrice = (
 subscription: Subscription,
 baseCurrency: Currency,
 exchangeRates: ExchangeRates
): number => {
 const convertedAmount = convertCurrency(
  subscription.amount,
  subscription.currency,
  baseCurrency,
  exchangeRates,
  baseCurrency
 );

 switch (subscription.period) {
 case 'monthly':
  return convertedAmount / 30;
 case 'yearly':
  return convertedAmount / 365;
 case 'custom':
  return convertedAmount / getCustomPeriodDays(subscription);
 default:
  return convertedAmount / 30;
 }
};

export const sortSubscriptions = (
 subscriptions: Subscription[],
 sortConfig: SortConfig,
 baseCurrency: Currency,
 exchangeRates: ExchangeRates
): Subscription[] => {
 return [...subscriptions].sort((left, right) => {
  let comparison = 0;

  switch (sortConfig.sortBy) {
  case 'name':
   comparison = left.name.localeCompare(right.name);
   break;
  case 'category':
   comparison = left.category.localeCompare(right.category);
   break;
  case 'amount':
   comparison = getSubscriptionDailyPrice(left, baseCurrency, exchangeRates) -
    getSubscriptionDailyPrice(right, baseCurrency, exchangeRates);
   break;
  case 'nextPaymentDate':
   comparison = parseDateOnly(left.nextPaymentDate).getTime() - parseDateOnly(right.nextPaymentDate).getTime();
   break;
  case 'createdAt':
   comparison = (left.createdAt ? new Date(left.createdAt).getTime() : 0) -
    (right.createdAt ? new Date(right.createdAt).getTime() : 0);
   break;
  default:
   comparison = 0;
  }

  return sortConfig.sortOrder === 'desc' ? -comparison : comparison;
 });
};
