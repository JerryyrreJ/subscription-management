import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubscriptionReminderContent, buildTestNotificationContent } from '../../src/utils/notificationContent.ts';
import { Subscription } from '../../src/types.ts';

const subscription: Subscription = {
 id: 'sub-1',
 name: 'Netflix',
 category: 'Entertainment',
 amount: 15.99,
 currency: 'USD',
 period: 'monthly',
 lastPaymentDate: '2026-04-01',
 nextPaymentDate: '2026-05-01',
};

test('buildSubscriptionReminderContent localizes English reminder copy', () => {
 const content = buildSubscriptionReminderContent(subscription, 3, 'en');

 assert.equal(content.title, 'Subscription Manager');
 assert.equal(content.group, 'Subscription Manager');
 assert.match(content.body, /Netflix renews in 3 days/);
 assert.match(content.body, /\$15\.99\/month/);
});

test('buildSubscriptionReminderContent localizes Chinese reminder copy', () => {
 const content = buildSubscriptionReminderContent(subscription, 1, 'zh-CN');

 assert.equal(content.title, '订阅管理器');
 assert.equal(content.group, '订阅管理器');
 assert.match(content.body, /Netflix 将于 1 天后续费/);
 assert.match(content.body, /US\$\s?15\.99\/月/);
});

test('buildTestNotificationContent localizes test push copy', () => {
 const content = buildTestNotificationContent('zh-CN');

 assert.equal(content.title, '测试通知');
 assert.equal(content.body, '这是一条来自订阅管理器的测试推送');
});

test('buildSubscriptionReminderContent uses trial-ending copy for free trials', () => {
 const trial: Subscription = {
  ...subscription,
  isTrial: true,
  trialEndsOn: '2026-05-01',
 };

 const english = buildSubscriptionReminderContent(trial, 3, 'en');
 assert.match(english.body, /Netflix trial ends in 3 days — decide cancel or keep/);
 assert.equal(english.body.includes('renews'), false);

 const chinese = buildSubscriptionReminderContent(trial, 0, 'zh-CN');
 assert.match(chinese.body, /Netflix 试用将于今天结束，请决定取消或保留/);
 assert.equal(chinese.body.includes('续费'), false);
});
