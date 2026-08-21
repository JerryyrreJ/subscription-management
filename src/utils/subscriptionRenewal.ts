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
 subscription: Pick<Subscription, 'nextPaymentDate' | 'period' | 'customDate' | 'billingAnchorDay'>,
 timeZone: string = getCurrentTimeZone()
): ResolvedSubscriptionRenewal => {
 const renewedDates = getAutoRenewedDates(
  subscription.nextPaymentDate,
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
  storedNextPaymentDate: subscription.nextPaymentDate,
  effectiveLastPaymentDate: renewedDates.lastPaymentDate,
  effectiveNextPaymentDate: renewedDates.nextPaymentDate,
  daysUntilEffectiveNextPayment: getDaysUntil(renewedDates.nextPaymentDate, timeZone),
  isAutoRenewed: renewedDates.nextPaymentDate !== subscription.nextPaymentDate,
 };
};
