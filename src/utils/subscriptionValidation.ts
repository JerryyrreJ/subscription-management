import type { Currency } from '../types';
import { getCurrencyFractionDigits } from './currency';

export const MAX_SUBSCRIPTION_AMOUNT = 999999.99;

const DEFAULT_FRACTION_DIGITS = 2;

const getAmountFractionDigits = (currency?: Currency): number =>
 currency ? getCurrencyFractionDigits(currency) : DEFAULT_FRACTION_DIGITS;

const amountInputPattern = (fractionDigits: number): RegExp => {
 if (fractionDigits <= 0) {
  return /^\d*$/;
 }

 return new RegExp(`^(?:\\d+(?:\\.\\d{0,${fractionDigits}})?)?$`);
};

const amountValuePattern = (fractionDigits: number): RegExp => {
 if (fractionDigits <= 0) {
  return /^\d+$/;
 }

 return new RegExp(`^\\d+(\\.\\d{1,${fractionDigits}})?$`);
};

const invalidAmountMessage = (fractionDigits: number): string => {
 if (fractionDigits <= 0) {
  return 'Amount must be a whole number';
 }

 return `Amount must be a valid number with up to ${fractionDigits} decimal places`;
};

export const isAllowedSubscriptionAmountInput = (
 value: string,
 currency?: Currency
): boolean => amountInputPattern(getAmountFractionDigits(currency)).test(value);

export const normalizeSubscriptionAmountInput = (
 value: string,
 currency: Currency
): string => {
 const trimmed = value.trim();
 if (!trimmed) {
  return '';
 }

 const fractionDigits = getCurrencyFractionDigits(currency);
 const numeric = Number(trimmed);

 if (!Number.isFinite(numeric) || numeric < 0) {
  return '';
 }

 const factor = 10 ** fractionDigits;
 const rounded = Math.round(numeric * factor) / factor;

 if (fractionDigits <= 0) {
  return String(Math.round(numeric));
 }

 if (Number.isInteger(rounded)) {
  return String(rounded);
 }

 return rounded.toFixed(fractionDigits).replace(/0+$/, '').replace(/\.$/, '');
};

export const validateSubscriptionAmount = (
 amountValue: string,
 currency?: Currency
): string | null => {
 const trimmedAmount = amountValue.trim();
 const fractionDigits = getAmountFractionDigits(currency);

 if (!trimmedAmount) {
  return 'Amount is required';
 }

 if (!amountValuePattern(fractionDigits).test(trimmedAmount)) {
  return invalidAmountMessage(fractionDigits);
 }

 const amount = Number(trimmedAmount);

 if (!Number.isFinite(amount)) {
  return 'Amount must be a finite number';
 }

 if (amount < 0) {
  return 'Amount cannot be negative';
 }

 if (amount > MAX_SUBSCRIPTION_AMOUNT) {
  return `Amount cannot exceed ${MAX_SUBSCRIPTION_AMOUNT}`;
 }

 return null;
};
