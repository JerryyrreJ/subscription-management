import type { Subscription, SubscriptionKind, SubscriptionStatus } from '../types';

type TrialFlagSource = Pick<Subscription, 'isTrial'> | { is_trial?: boolean | null };

type ReminderEligibilitySource = {
 notificationEnabled?: boolean;
 notification_enabled?: boolean;
 status?: SubscriptionStatus | string | null;
};

export const isTrialSubscription = (subscription: TrialFlagSource): boolean => {
 if ('isTrial' in subscription && subscription.isTrial !== undefined) {
  return Boolean(subscription.isTrial);
 }

 return Boolean((subscription as { is_trial?: boolean | null }).is_trial);
};

export const getSubscriptionKind = (subscription: TrialFlagSource): SubscriptionKind =>
 isTrialSubscription(subscription) ? 'trial' : 'subscription';

export const isSubscriptionReminderEligible = (subscription: ReminderEligibilitySource): boolean => {
 const notificationEnabled = subscription.notificationEnabled ?? subscription.notification_enabled ?? true;
 if (!notificationEnabled) {
  return false;
 }

 const status = subscription.status ?? 'active';
 return status !== 'paused' && status !== 'cancelled';
};
