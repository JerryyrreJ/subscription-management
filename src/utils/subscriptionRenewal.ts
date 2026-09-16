import type { Subscription } from '../types';
import {
 calculatePreviousPaymentDate,
 getAutoRenewedDates,
 getDaysUntil,
 getCurrentTimeZone,
} from './dates';

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
 timeZone: string = getCurrentTimeZone()
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
   daysUntilEffectiveNextPayment: getDaysUntil(storedNextPaymentDate, timeZone),
   isAutoRenewed: false,
  };
 }

 const renewedDates = getAutoRenewedDates(
  storedNextPaymentDate,
  subscription.period,
  subscription.customDate,
  subscription.billingAnchorDay,
  timeZone
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
  daysUntilEffectiveNextPayment: getDaysUntil(renewedDates.nextPaymentDate, timeZone),
  isAutoRenewed: renewedDates.nextPaymentDate !== subscription.nextPaymentDate,
 };
};
