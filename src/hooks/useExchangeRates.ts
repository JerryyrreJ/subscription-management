import { useCallback, useEffect, useState } from 'react';
import type {
  Currency,
  ExchangeRateLoadResult,
  ExchangeRates,
  ExchangeRateSource,
} from '../types';
import {
  getStoredExchangeRatesSnapshot,
  refreshExchangeRatesWithStatus,
} from '../utils/currency';
import { createScopedTaskGate } from '../utils/scopedTaskGate';

const exchangeRateTaskGate = createScopedTaskGate<'exchange-rates'>();
const EXCHANGE_RATE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export interface ExchangeRateState {
  exchangeRates: ExchangeRates;
  exchangeRateSource: ExchangeRateSource;
  exchangeRatesUpdatedAt: number | null;
  exchangeRatesStale: boolean;
  exchangeRateError: string | undefined;
}

export function useExchangeRates(baseCurrency: Currency): ExchangeRateState {
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({});
  const [exchangeRateSource, setExchangeRateSource] = useState<ExchangeRateSource>('live');
  const [exchangeRatesUpdatedAt, setExchangeRatesUpdatedAt] = useState<number | null>(null);
  const [, setIsExchangeRatesRefreshing] = useState(false);
  const [exchangeRatesStale, setExchangeRatesStale] = useState(false);
  const [exchangeRateError, setExchangeRateError] = useState<string | undefined>();

  const applyExchangeRateResult = useCallback((result: ExchangeRateLoadResult) => {
    setExchangeRates(result.rates);
    setExchangeRateSource(result.source);
    setExchangeRatesUpdatedAt(result.updatedAt ?? null);
    setExchangeRatesStale(Boolean(result.stale));
    setExchangeRateError(result.error);
  }, []);

  const refreshExchangeRates = useCallback(async (currency: Currency) => {
    const taskToken = exchangeRateTaskGate.claim('exchange-rates');
    setIsExchangeRatesRefreshing(true);
    if (import.meta.env.DEV) {
      console.log(`[Exchange Rates] Refresh started for base currency: ${currency}`);
    }

    try {
      const result = await refreshExchangeRatesWithStatus(currency);
      if (!exchangeRateTaskGate.isCurrent('exchange-rates', taskToken)) {
        return;
      }

      if (import.meta.env.DEV) {
        console.log('[Exchange Rates] Refresh completed:', {
          currency,
          source: result.source,
          stale: Boolean(result.stale),
          updatedAt: result.updatedAt,
          error: result.error,
        });
      }
      applyExchangeRateResult(result);
    } catch (error) {
      if (!exchangeRateTaskGate.isCurrent('exchange-rates', taskToken)) {
        return;
      }

      console.error(`[Exchange Rates] Refresh failed for ${currency}:`, error);
      setExchangeRateSource('fallback');
      setExchangeRatesStale(true);
      setExchangeRateError(error instanceof Error ? error.message : 'Failed to refresh exchange rates');
    } finally {
      if (exchangeRateTaskGate.isCurrent('exchange-rates', taskToken)) {
        setIsExchangeRatesRefreshing(false);
      }
    }
  }, [applyExchangeRateResult]);

  useEffect(() => {
    const cachedSnapshot = getStoredExchangeRatesSnapshot(baseCurrency);
    if (cachedSnapshot) {
      applyExchangeRateResult(cachedSnapshot);
    } else {
      setExchangeRates({});
      setExchangeRateSource('fallback');
      setExchangeRatesUpdatedAt(null);
      setExchangeRatesStale(true);
      setExchangeRateError(undefined);
    }

    void refreshExchangeRates(baseCurrency);
  }, [applyExchangeRateResult, baseCurrency, refreshExchangeRates]);

  useEffect(() => {
    const refreshIfVisibleAndOnline = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
        return;
      }

      void refreshExchangeRates(baseCurrency);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfVisibleAndOnline();
      }
    };

    const intervalId = window.setInterval(refreshIfVisibleAndOnline, EXCHANGE_RATE_REFRESH_INTERVAL_MS);
    window.addEventListener('online', refreshIfVisibleAndOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', refreshIfVisibleAndOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [baseCurrency, refreshExchangeRates]);

  return {
    exchangeRates,
    exchangeRateSource,
    exchangeRatesUpdatedAt,
    exchangeRatesStale,
    exchangeRateError,
  };
}
