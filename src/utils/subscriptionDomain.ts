import { z } from 'zod';
import type { Subscription } from '../types';
import { calculateNextPaymentDate, formatDateOnly, parseDateOnly } from './dates';
import { DEFAULT_CURRENCY } from './currency';
import { MAX_SUBSCRIPTION_AMOUNT } from './subscriptionValidation';

export const SUBSCRIPTION_CURRENCIES = [
 'CNY', 'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD'
] as const;

export const SUBSCRIPTION_PERIODS = ['monthly', 'yearly', 'custom'] as const;

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD').refine(
 value => {
  try {
   return formatDateOnly(parseDateOnly(value)) === value;
  } catch {
   return false;
  }
 },
 'Date is invalid'
);

const customDateSchema = z.preprocess(
 value => value === '' || value === null ? undefined : value,
 z.string().regex(/^[1-9]\d*$/, 'Custom period must be a positive whole number').optional()
);

const amountSchema = z.number()
 .finite('Amount must be finite')
 .min(0, 'Amount cannot be negative')
 .max(MAX_SUBSCRIPTION_AMOUNT, `Amount cannot exceed ${MAX_SUBSCRIPTION_AMOUNT}`)
 .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, {
  message: 'Amount must have at most 2 decimal places',
 });

const subscriptionInputObject = z.object({
 name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
 category: z.string().trim().min(1, 'Category is required').max(80, 'Category is too long'),
 amount: amountSchema,
 currency: z.enum(SUBSCRIPTION_CURRENCIES).default(DEFAULT_CURRENCY),
 period: z.enum(SUBSCRIPTION_PERIODS),
 lastPaymentDate: dateOnlySchema,
 customDate: customDateSchema,
 notificationEnabled: z.boolean().default(true),
});

const validateCustomPeriod = (
 value: { period: string; customDate?: string },
 context: z.RefinementCtx
): void => {
 if (value.period === 'custom' && !value.customDate) {
  context.addIssue({
   code: 'custom',
   path: ['customDate'],
   message: 'Custom period is required',
  });
 }

 if (value.period !== 'custom' && value.customDate) {
  context.addIssue({
   code: 'custom',
   path: ['customDate'],
   message: 'Custom period is only allowed for custom billing',
  });
 }
};

export const subscriptionCreateInputSchema = subscriptionInputObject.superRefine(validateCustomPeriod);

export const subscriptionPatchInputSchema = subscriptionInputObject.partial();

export const subscriptionRecordSchema = subscriptionInputObject.extend({
 id: z.string().trim().min(1, 'Subscription id is required'),
 nextPaymentDate: dateOnlySchema,
 createdAt: z.string().datetime({ offset: true }).optional(),
 updatedAt: z.string().datetime({ offset: true }).optional(),
}).superRefine(validateCustomPeriod);

export type SubscriptionCreateInput = z.infer<typeof subscriptionCreateInputSchema>;

interface CreateSubscriptionOptions {
 id?: string;
 now?: string;
 createdAt?: string;
}

export const createSubscriptionRecord = (
 input: unknown,
 options: CreateSubscriptionOptions = {}
): Subscription => {
 const parsed = subscriptionCreateInputSchema.parse(input);
 const now = options.now || new Date().toISOString();

 return {
  ...parsed,
  id: options.id || crypto.randomUUID(),
  customDate: parsed.period === 'custom' ? parsed.customDate : undefined,
  nextPaymentDate: calculateNextPaymentDate(
   parsed.lastPaymentDate,
   parsed.period,
   parsed.customDate
  ),
  createdAt: options.createdAt || now,
  updatedAt: now,
 };
};

export const updateSubscriptionRecord = (
 existing: Subscription,
 input: unknown,
 now: string = new Date().toISOString()
): Subscription => createSubscriptionRecord(input, {
 id: existing.id,
 createdAt: existing.createdAt || now,
 now,
});

export const normalizeSubscriptionRecord = (input: unknown): Subscription => {
 const parsed = subscriptionRecordSchema.parse(input);
 const createdAt = parsed.createdAt || new Date().toISOString();

 return createSubscriptionRecord(parsed, {
  id: parsed.id,
  createdAt,
  now: parsed.updatedAt || createdAt,
 });
};

export const getSubscriptionValidationMessage = (error: unknown): string => {
 if (error instanceof z.ZodError) {
  return error.issues[0]?.message || 'Subscription data is invalid';
 }

 return error instanceof Error ? error.message : 'Subscription data is invalid';
};
