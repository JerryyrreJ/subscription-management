import type { Subscription } from '../types';
import { getAutoRenewedDates, getDaysUntil, getCurrentTimeZone } from './dates';

export interface ResolvedSubscriptionRenewal {
 storedLastPaymentDate: string;
 storedNextPaymentDate: string;
 effectiveLastPaymentDate: string;
 effectiveNextPaymentDate: string;
 daysUntilEffectiveNextPayment: number;
 isAutoRenewed: boolean;
}

export const resolveSubscriptionRenewal = (
 subscription: Pick<Subscription, 'lastPaymentDate' | 'nextPaymentDate' | 'period' | 'customDate'>,
 timeZone: string = getCurrentTimeZone()
): ResolvedSubscriptionRenewal => {
 const renewedDates = getAutoRenewedDates(
  subscription.lastPaymentDate,
  subscription.nextPaymentDate,
  subscription.period,
  subscription.customDate
 );

 return {
  storedLastPaymentDate: subscription.lastPaymentDate,
  storedNextPaymentDate: subscription.nextPaymentDate,
  effectiveLastPaymentDate: renewedDates.lastPaymentDate,
  effectiveNextPaymentDate: renewedDates.nextPaymentDate,
  daysUntilEffectiveNextPayment: getDaysUntil(renewedDates.nextPaymentDate, timeZone),
  isAutoRenewed: renewedDates.nextPaymentDate !== subscription.nextPaymentDate,
 };
};
