import test from 'node:test';
import assert from 'node:assert/strict';
import {
 getSubscriptionKind,
 isSubscriptionReminderEligible,
 isTrialSubscription,
} from '../../src/utils/subscriptionReminder.ts';

test('isTrialSubscription reads camelCase and snake_case flags', () => {
 assert.equal(isTrialSubscription({ isTrial: true }), true);
 assert.equal(isTrialSubscription({ isTrial: false }), false);
 assert.equal(isTrialSubscription({ is_trial: true }), true);
 assert.equal(isTrialSubscription({}), false);
 assert.equal(getSubscriptionKind({ isTrial: true }), 'trial');
 assert.equal(getSubscriptionKind({ isTrial: false }), 'subscription');
});

test('isSubscriptionReminderEligible skips paused and cancelled even when notifications are enabled', () => {
 assert.equal(isSubscriptionReminderEligible({ notificationEnabled: true, status: 'active' }), true);
 assert.equal(isSubscriptionReminderEligible({ notificationEnabled: true, status: 'paused' }), false);
 assert.equal(isSubscriptionReminderEligible({ notificationEnabled: true, status: 'cancelled' }), false);
 assert.equal(isSubscriptionReminderEligible({ notification_enabled: true, status: 'paused' }), false);
 assert.equal(isSubscriptionReminderEligible({ notificationEnabled: false, status: 'active' }), false);
 assert.equal(isSubscriptionReminderEligible({}), true);
});
