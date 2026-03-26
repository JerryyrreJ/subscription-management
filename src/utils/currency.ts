import {
 Currency,
 CurrencyConversionResult,
 CurrencyInfo,
 ExchangeRateLoadResult,
 ExchangeRates,
} from '../types';

export const CURRENCIES: CurrencyInfo[] = [
 { code: 'CNY', symbol: '¥', name: '人民币' },
 { code: 'USD', symbol: '$', name: '美元' },
 { code: 'EUR', symbol: '€', name: '欧元' },
 { code: 'JPY', symbol: '¥', name: '日元' },
 { code: 'GBP', symbol: '£', name: '英镑' },
 { code: 'AUD', symbol: 'A$', name: '澳元' },
 { code: 'CAD', symbol: 'C$', name: '加元' },
 { code: 'CHF', symbol: 'CHF', name: '瑞士法郎' },
 { code: 'HKD', symbol: 'HK$', name: '港币' },
 { code: 'SGD', symbol: 'S$', name: '新加坡元' },
];

export const DEFAULT_CURRENCY: Currency = 'CNY';

export const getCurrencyInfo = (code: Currency): CurrencyInfo => {
 return CURRENCIES.find(currency => currency.code === code) || CURRENCIES[0];
};

export const formatCurrency = (amount: number, currency: Currency): string => {
 const currencyInfo = getCurrencyInfo(currency);

 if (currency === 'JPY') {
 return `${currencyInfo.symbol}${Math.round(amount).toLocaleString()}`;
 }

 return `${currencyInfo.symbol}${amount.toFixed(2)}`;
};

const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest';

export const fetchExchangeRatesWithStatus = async (baseCurrency: Currency = 'USD'): Promise<ExchangeRateLoadResult> => {
 try {
 const response = await fetch(`${EXCHANGE_RATE_API_URL}/${baseCurrency}`);

 if (!response.ok) {
 throw new Error(`HTTP error! status: ${response.status}`);
 }

 const data = await response.json();
 const rates = data.rates || {};

 // 确保基准货币本身的汇率为1.0
 rates[baseCurrency] = 1.0;

 return {
  rates,
  source: 'live'
 };
 } catch (error) {
 console.error('Failed to fetch exchange rates:', error);
 return {
  rates: getFallbackRates(baseCurrency),
  source: 'fallback',
  error: error instanceof Error ? error.message : 'Failed to fetch exchange rates'
 };
 }
};

export const fetchExchangeRates = async (baseCurrency: Currency = 'USD'): Promise<ExchangeRates> => {
 const result = await fetchExchangeRatesWithStatus(baseCurrency);
 return result.rates;
};

const getFallbackRates = (baseCurrency: Currency): ExchangeRates => {
 const fallbackRates: Record<Currency, ExchangeRates> = {
 USD: {
 CNY: 7.2,
 USD: 1,
 EUR: 0.85,
 JPY: 110,
 GBP: 0.73,
 AUD: 1.35,
 CAD: 1.25,
 CHF: 0.92,
 HKD: 7.8,
 SGD: 1.35,
 },
 CNY: {
 CNY: 1,
 USD: 0.139,
 EUR: 0.118,
 JPY: 15.28,
 GBP: 0.101,
 AUD: 0.188,
 CAD: 0.174,
 CHF: 0.128,
 HKD: 1.08,
 SGD: 0.188,
 },
 EUR: {
 CNY: 8.47,
 USD: 1.18,
 EUR: 1,
 JPY: 129.4,
 GBP: 0.86,
 AUD: 1.59,
 CAD: 1.47,
 CHF: 1.08,
 HKD: 9.18,
 SGD: 1.59,
 },
 JPY: {
 CNY: 0.0654,
 USD: 0.0091,
 EUR: 0.0077,
 JPY: 1,
 GBP: 0.0066,
 AUD: 0.0123,
 CAD: 0.0114,
 CHF: 0.0084,
 HKD: 0.071,
 SGD: 0.0123,
 },
 GBP: {
 CNY: 9.86,
 USD: 1.37,
 EUR: 1.16,
 JPY: 150.7,
 GBP: 1,
 AUD: 1.85,
 CAD: 1.71,
 CHF: 1.26,
 HKD: 10.69,
 SGD: 1.85,
 },
 AUD: {
 CNY: 5.33,
 USD: 0.74,
 EUR: 0.63,
 JPY: 81.5,
 GBP: 0.54,
 AUD: 1,
 CAD: 0.93,
 CHF: 0.68,
 HKD: 5.78,
 SGD: 1,
 },
 CAD: {
 CNY: 5.76,
 USD: 0.8,
 EUR: 0.68,
 JPY: 88,
 GBP: 0.58,
 AUD: 1.08,
 CAD: 1,
 CHF: 0.74,
 HKD: 6.24,
 SGD: 1.08,
 },
 CHF: {
 CNY: 7.83,
 USD: 1.09,
 EUR: 0.92,
 JPY: 119.6,
 GBP: 0.79,
 AUD: 1.47,
 CAD: 1.36,
 CHF: 1,
 HKD: 8.5,
 SGD: 1.47,
 },
 HKD: {
 CNY: 0.923,
 USD: 0.128,
 EUR: 0.109,
 JPY: 14.1,
 GBP: 0.094,
 AUD: 0.173,
 CAD: 0.16,
 CHF: 0.118,
 HKD: 1,
 SGD: 0.173,
 },
 SGD: {
 CNY: 5.33,
 USD: 0.74,
 EUR: 0.63,
 JPY: 81.5,
 GBP: 0.54,
 AUD: 1,
 CAD: 0.93,
 CHF: 0.68,
 HKD: 5.78,
 SGD: 1,
 },
 };

 const rates = fallbackRates[baseCurrency] || fallbackRates.USD;

 // 确保基准货币本身的汇率为1.0
 rates[baseCurrency] = 1.0;

 return rates;
};

const resolveRate = (
 currency: Currency,
 exchangeRates: ExchangeRates,
 fallbackRates: ExchangeRates,
 baseCurrency: Currency
): {
 rate?: number;
 usedFallback: boolean;
 error?: string;
} => {
 if (currency === baseCurrency) {
  return {
   rate: 1,
   usedFallback: false
  };
 }

 const liveRate = exchangeRates[currency];
 if (typeof liveRate === 'number' && liveRate > 0) {
  return {
   rate: liveRate,
   usedFallback: false
  };
 }

 const fallbackRate = fallbackRates[currency];
 if (typeof fallbackRate === 'number' && fallbackRate > 0) {
  return {
   rate: fallbackRate,
   usedFallback: true,
   error: `Exchange rate not found for ${currency}, using fallback rate`
  };
 }

 return {
  usedFallback: true,
  error: `Exchange rate not available for ${currency}`
 };
};

export const convertCurrencySafe = (
 amount: number,
 fromCurrency: Currency,
 toCurrency: Currency,
 exchangeRates: ExchangeRates,
 baseCurrency: Currency = 'USD'
): CurrencyConversionResult => {
 if (fromCurrency === toCurrency) {
 return {
  amount,
  usedFallback: false,
  isAccurate: true
 };
 }

 const fallbackRates = getFallbackRates(baseCurrency);
 const rateErrors: string[] = [];
 let usedFallback = false;

 let convertedAmount = amount;

 // 第一步：如果原货币不是基准货币，先转换为基准货币
 if (fromCurrency !== baseCurrency) {
 const fromRate = resolveRate(fromCurrency, exchangeRates, fallbackRates, baseCurrency);
 if (!fromRate.rate) {
  return {
   amount,
   usedFallback: true,
   isAccurate: false,
   error: fromRate.error || `Exchange rate not available for ${fromCurrency}`
  };
 }

 usedFallback = usedFallback || fromRate.usedFallback;
 if (fromRate.error) {
  rateErrors.push(fromRate.error);
 }

 // 从原货币转换为基准货币需要除以汇率
 convertedAmount = amount / fromRate.rate;
 }

 // 第二步：如果目标货币不是基准货币，从基准货币转换为目标货币
 if (toCurrency !== baseCurrency) {
 const toRate = resolveRate(toCurrency, exchangeRates, fallbackRates, baseCurrency);
 if (!toRate.rate) {
  return {
   amount: convertedAmount,
   usedFallback: true,
   isAccurate: false,
   error: toRate.error || `Exchange rate not available for ${toCurrency}`
  };
 }

 usedFallback = usedFallback || toRate.usedFallback;
 if (toRate.error) {
  rateErrors.push(toRate.error);
 }

 // 从基准货币转换为目标货币需要乘以汇率
 convertedAmount = convertedAmount * toRate.rate;
 }

 return {
  amount: convertedAmount,
  usedFallback,
  isAccurate: !usedFallback && rateErrors.length === 0,
  error: rateErrors[0]
 };
};

export const convertCurrency = (
 amount: number,
 fromCurrency: Currency,
 toCurrency: Currency,
 exchangeRates: ExchangeRates,
 baseCurrency: Currency = 'USD'
): number => {
 const result = convertCurrencySafe(amount, fromCurrency, toCurrency, exchangeRates, baseCurrency);

 if (result.error) {
  console.warn(result.error);
 }

 return result.amount;
};

const RATES_STORAGE_KEY = 'exchange-rates';
const RATES_TIMESTAMP_KEY = 'exchange-rates-timestamp';
const RATES_SOURCE_KEY = 'exchange-rates-source';
const RATES_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export const getCachedExchangeRatesWithStatus = async (baseCurrency: Currency = 'USD'): Promise<ExchangeRateLoadResult> => {
 try {
 const cachedRates = localStorage.getItem(`${RATES_STORAGE_KEY}-${baseCurrency}`);
 const cachedTimestamp = localStorage.getItem(`${RATES_TIMESTAMP_KEY}-${baseCurrency}`);
 const cachedSource = localStorage.getItem(`${RATES_SOURCE_KEY}-${baseCurrency}`);

 if (cachedRates && cachedTimestamp) {
 const timestamp = parseInt(cachedTimestamp);
 const now = Date.now();

 if (now - timestamp < RATES_CACHE_DURATION) {
  return {
   rates: JSON.parse(cachedRates),
   source: cachedSource === 'fallback' ? 'fallback' : 'live'
  };
 }
 }

 const freshRates = await fetchExchangeRatesWithStatus(baseCurrency);

 localStorage.setItem(`${RATES_STORAGE_KEY}-${baseCurrency}`, JSON.stringify(freshRates.rates));
 localStorage.setItem(`${RATES_TIMESTAMP_KEY}-${baseCurrency}`, Date.now().toString());
 localStorage.setItem(`${RATES_SOURCE_KEY}-${baseCurrency}`, freshRates.source);

 return freshRates;
 } catch (error) {
 console.error('Error with cached exchange rates:', error);
 return {
  rates: getFallbackRates(baseCurrency),
  source: 'fallback',
  error: error instanceof Error ? error.message : 'Failed to read cached exchange rates'
 };
 }
};

export const getCachedExchangeRates = async (baseCurrency: Currency = 'USD'): Promise<ExchangeRates> => {
 const result = await getCachedExchangeRatesWithStatus(baseCurrency);
 return result.rates;
};
