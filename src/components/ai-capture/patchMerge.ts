import type { Subscription } from '../../types';
import type { AiUpdateOperation } from '../../utils/aiCommand';
import { getDateOnlyDay } from '../../utils/dates';

export const isPositiveWholeDays = (value: unknown): boolean =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value);

export const warnedFields = (warnings: string[]): Set<string> => {
  const set = new Set<string>();
  for (const warning of warnings) {
    if (warning.startsWith('amount')) set.add('amount');
    else if (warning.startsWith('currency')) set.add('currency');
    else if (warning.startsWith('period')) set.add('period');
    else if (warning.startsWith('nextPaymentDate')) set.add('nextPaymentDate');
    else if (warning.startsWith('category')) set.add('category');
    else if (warning.startsWith('customDate')) set.add('customDate');
  }
  return set;
};

export const updateMissingFields = (
  nextCommand: AiUpdateOperation,
  targetSubscription: Subscription | null
): AiUpdateOperation => {
  const period = nextCommand.patch.period ?? targetSubscription?.period;
  const customDate = nextCommand.patch.customDate ?? targetSubscription?.customDate;
  const missingFields = period === 'custom' && !isPositiveWholeDays(customDate)
    ? ['customDate' as const]
    : [];

  return {
    ...nextCommand,
    ...(missingFields.length > 0 ? { missingFields } : { missingFields: undefined }),
  };
};

export const buildUpdatedSubscriptionFromPatch = (
  target: Subscription,
  patch: AiUpdateOperation['patch']
): Subscription => {
  const updatedPeriod = patch.period ?? target.period;
  const updatedNextPaymentDate = patch.nextPaymentDate ?? target.nextPaymentDate;
  const hasDateChange =
    patch.nextPaymentDate !== undefined && patch.nextPaymentDate !== target.nextPaymentDate;

  return {
    ...target,
    ...patch,
    trialEndsOn: target.isTrial
      ? (patch.nextPaymentDate ?? target.trialEndsOn ?? updatedNextPaymentDate)
      : target.trialEndsOn,
    billingAnchorDay: updatedPeriod === 'monthly'
      ? (hasDateChange
        ? getDateOnlyDay(updatedNextPaymentDate)
        : (target.billingAnchorDay ?? getDateOnlyDay(updatedNextPaymentDate)))
      : undefined,
    customDate: patch.period && patch.period !== 'custom'
      ? undefined
      : patch.customDate ?? target.customDate,
  };
};
