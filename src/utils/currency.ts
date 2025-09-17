import { Currency, CurrencyInfo, ExchangeRates } from '../types';

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

export const fetchExchangeRates = async (baseCurrency: Currency = 'USD'): Promise<ExchangeRates> => {
  try {
    const response = await fetch(`${EXCHANGE_RATE_API_URL}/${baseCurrency}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const rates = data.rates || {};

    // 确保基准货币本身的汇率为1.0
    rates[baseCurrency] = 1.0;

    return rates;
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error);
    return getFallbackRates(baseCurrency);
  }
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

export const convertCurrency = (
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  exchangeRates: ExchangeRates,
  baseCurrency: Currency = 'USD'
): number => {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  // 如果汇率表为空，使用离线汇率
  if (Object.keys(exchangeRates).length === 0) {
    const fallbackRates = getFallbackRates(fromCurrency);
    return amount * (fallbackRates[toCurrency] || 1);
  }

  // 汇率表是以baseCurrency为基准的
  // 例如：baseCurrency = USD, exchangeRates = {CNY: 7.2, EUR: 0.85}

  let convertedAmount = amount;

  // 第一步：如果原货币不是基准货币，先转换为基准货币
  if (fromCurrency !== baseCurrency) {
    const fromRate = exchangeRates[fromCurrency];
    if (!fromRate) {
      console.warn(`Exchange rate not found for ${fromCurrency}, using fallback`);
      const fallbackRates = getFallbackRates(fromCurrency);
      return amount * (fallbackRates[toCurrency] || 1);
    }
    // 从原货币转换为基准货币需要除以汇率
    convertedAmount = amount / fromRate;
  }

  // 第二步：如果目标货币不是基准货币，从基准货币转换为目标货币
  if (toCurrency !== baseCurrency) {
    const toRate = exchangeRates[toCurrency];
    if (!toRate) {
      console.warn(`Exchange rate not found for ${toCurrency}, using fallback`);
      const fallbackRates = getFallbackRates(baseCurrency);
      return convertedAmount * (fallbackRates[toCurrency] || 1);
    }
    // 从基准货币转换为目标货币需要乘以汇率
    convertedAmount = convertedAmount * toRate;
  }

  return convertedAmount;
};

const RATES_STORAGE_KEY = 'exchange-rates';
const RATES_TIMESTAMP_KEY = 'exchange-rates-timestamp';
const RATES_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export const getCachedExchangeRates = async (baseCurrency: Currency = 'USD'): Promise<ExchangeRates> => {
  try {
    const cachedRates = localStorage.getItem(`${RATES_STORAGE_KEY}-${baseCurrency}`);
    const cachedTimestamp = localStorage.getItem(`${RATES_TIMESTAMP_KEY}-${baseCurrency}`);

    if (cachedRates && cachedTimestamp) {
      const timestamp = parseInt(cachedTimestamp);
      const now = Date.now();

      if (now - timestamp < RATES_CACHE_DURATION) {
        return JSON.parse(cachedRates);
      }
    }

    const freshRates = await fetchExchangeRates(baseCurrency);

    localStorage.setItem(`${RATES_STORAGE_KEY}-${baseCurrency}`, JSON.stringify(freshRates));
    localStorage.setItem(`${RATES_TIMESTAMP_KEY}-${baseCurrency}`, Date.now().toString());

    return freshRates;
  } catch (error) {
    console.error('Error with cached exchange rates:', error);
    return getFallbackRates(baseCurrency);
  }
};