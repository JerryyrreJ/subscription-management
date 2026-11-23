import type { Subscription } from '../types';
import {
 calculatePreviousPaymentDate,
 getAutoRenewedDates,
 getDateOnlyDay,
 getDaysUntil,
 getCurrentTimeZone,
} from './dates';
import { updateSubscriptionRecord } from './subscriptionDomain';
import { isTrialSubscription } from './subscriptionReminder';

export interface ResolvedSubscriptionRenewal {
 storedLastPaymentDate: string;
 storedNextPaymentDate: string;
 effectiveLastPaymentDate: string;
 effectiveNextPaymentDate: string;
 daysUntilEffectiveNextPayment: number;
 isAutoRenewed: boolean;
}

export const resolveSubscriptionRenewal = (
 subscription: Pick<Subscription, 'nextPaymentDate' | 'period' | 'customDate' | 'billingAnchorDay' | 'isTrial' | 'trialEndsOn'>,
 timeZone: string = getCurrentTimeZone(),
 now: Date = new Date()
): ResolvedSubscriptionRenewal => {
 const storedNextPaymentDate = subscription.isTrial
  ? subscription.trialEndsOn || subscription.nextPaymentDate
  : subscription.nextPaymentDate;

 if (subscription.isTrial) {
  const storedLastPaymentDate = calculatePreviousPaymentDate(
   storedNextPaymentDate,
   subscription.period,
   subscription.customDate,
   subscription.billingAnchorDay
  );

  return {
   storedLastPaymentDate,
   storedNextPaymentDate,
   effectiveLastPaymentDate: storedLastPaymentDate,
   effectiveNextPaymentDate: storedNextPaymentDate,
   daysUntilEffectiveNextPayment: getDaysUntil(storedNextPaymentDate, timeZone, now),
   isAutoRenewed: false,
  };
 }

 const renewedDates = getAutoRenewedDates(
  storedNextPaymentDate,
  subscription.period,
  subscription.customDate,
  subscription.billingAnchorDay,
  timeZone,
  now
 );

 return {
  storedLastPaymentDate: calculatePreviousPaymentDate(
   subscription.nextPaymentDate,
   subscription.period,
   subscription.customDate,
   subscription.billingAnchorDay
  ),
  storedNextPaymentDate,
  effectiveLastPaymentDate: renewedDates.lastPaymentDate,
  effectiveNextPaymentDate: renewedDates.nextPaymentDate,
  daysUntilEffectiveNextPayment: getDaysUntil(renewedDates.nextPaymentDate, timeZone, now),
  isAutoRenewed: renewedDates.nextPaymentDate !== subscription.nextPaymentDate,
 };
};

export const isExpiredTrial = (
 subscription: Pick<Subscription, 'nextPaymentDate' | 'period' | 'customDate' | 'billingAnchorDay' | 'isTrial' | 'trialEndsOn'>,
 timeZone: string = getCurrentTimeZone(),
 now: Date = new Date()
): boolean => {
 if (!isTrialSubscription(subscription)) {
  return false;
 }
 const renewal = resolveSubscriptionRenewal(subscription, timeZone, now);
 return renewal.daysUntilEffectiveNextPayment < 0;
};

export const resolveTrialConversionDates = (
 subscription: Pick<Subscription, 'nextPaymentDate' | 'period' | 'customDate' | 'billingAnchorDay' | 'isTrial' | 'trialEndsOn'>,
 timeZone: string = getCurrentTimeZone(),
 now: Date = new Date()
): { lastPaymentDate: string; nextPaymentDate: string; billingAnchorDay?: number } => {
 const trialEndDate = subscription.trialEndsOn || subscription.nextPaymentDate;
 const billingAnchorDay = subscription.period === 'monthly'
  ? (subscription.billingAnchorDay ?? getDateOnlyDay(trialEndDate))
  : undefined;
 const daysUntilTrialEnd = getDaysUntil(trialEndDate, timeZone, now);

 if (daysUntilTrialEnd < 0) {
  const rolled = getAutoRenewedDates(
   trialEndDate,
   subscription.period,
   subscription.customDate,
   billingAnchorDay,
   timeZone,
   now
  );
  return {
   lastPaymentDate: rolled.lastPaymentDate,
   nextPaymentDate: rolled.nextPaymentDate,
   billingAnchorDay,
  };
 }

 return {
  lastPaymentDate: calculatePreviousPaymentDate(
   trialEndDate,
   subscription.period,
   subscription.customDate,
   billingAnchorDay
  ),
  nextPaymentDate: trialEndDate,
  billingAnchorDay,
 };
};

export const buildConvertedPaidSubscription = (
 subscription: Subscription,
 timeZone: string = getCurrentTimeZone(),
 now: Date = new Date()
): Subscription => {
 const convertedDates = resolveTrialConversionDates(subscription, timeZone, now);
 return updateSubscriptionRecord(
  subscription,
  {
   ...subscription,
   isTrial: false,
   trialEndsOn: undefined,
   lastPaymentDate: convertedDates.lastPaymentDate,
   nextPaymentDate: convertedDates.nextPaymentDate,
   billingAnchorDay: convertedDates.billingAnchorDay,
  },
  now.toISOString()
 );
};
