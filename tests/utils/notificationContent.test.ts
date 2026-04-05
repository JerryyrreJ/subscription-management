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
