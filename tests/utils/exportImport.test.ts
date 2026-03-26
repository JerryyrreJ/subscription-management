import test from 'node:test';
import assert from 'node:assert/strict';
import { Subscription } from '../../src/types.ts';
import { Category } from '../../src/utils/categories.ts';
import {
 buildCategoryImportPlan,
 buildSubscriptionImportPlan,
} from '../../src/utils/exportImport.ts';
import { normalizeSubscription } from '../../src/utils/subscriptionSync.ts';

const createSubscription = (overrides: Partial<Subscription> = {}): Subscription => normalizeSubscription({
 id: overrides.id || 'sub-1',
 name: overrides.name || 'Netflix',
 category: overrides.category || 'Entertainment',
 amount: overrides.amount || 15,
 currency: overrides.currency || 'USD',
 period: overrides.period || 'monthly',
 lastPaymentDate: overrides.lastPaymentDate || '2026-03-01',
 nextPaymentDate: overrides.nextPaymentDate || '2026-04-01',
 customDate: overrides.customDate,
 createdAt: overrides.createdAt || '2026-03-01T00:00:00.000Z',
 updatedAt: overrides.updatedAt || '2026-03-01T00:00:00.000Z',
 notificationEnabled: overrides.notificationEnabled ?? true,
});

const createCategory = (overrides: Partial<Category> = {}): Category => ({
 id: overrides.id || 'entertainment',
 name: overrides.name || 'Entertainment',
 order: overrides.order ?? 0,
 isBuiltIn: overrides.isBuiltIn ?? true,
 isHidden: overrides.isHidden ?? false,
});

test('buildSubscriptionImportPlan produces create update and delete operations for replace import', () => {
 const currentSubscriptions = [
  createSubscription(),
  createSubscription({
   id: 'sub-2',
   name: 'Spotify',
   amount: 12,
   updatedAt: '2026-03-02T00:00:00.000Z',
  }),
  createSubscription({
   id: 'sub-3',
   name: 'Notion',
  }),
 ];

 const importedSubscriptions = [
  createSubscription({
   id: 'sub-1',
   updatedAt: '2026-03-10T00:00:00.000Z',
  }),
  createSubscription({
   id: 'sub-2',
   name: 'Spotify Premium',
   amount: 15,
  }),
  createSubscription({
   id: 'sub-4',
   name: 'YouTube Premium',
  }),
 ];

 const plan = buildSubscriptionImportPlan(currentSubscriptions, importedSubscriptions);

 assert.deepEqual(plan.create.map(subscription => subscription.id), ['sub-4']);
 assert.deepEqual(plan.update.map(subscription => subscription.id), ['sub-2']);
 assert.deepEqual(plan.deleteIds, ['sub-3']);
});

test('buildCategoryImportPlan deletes existing categories when an empty category list is imported', () => {
 const currentCategories = [
  createCategory(),
  createCategory({
   id: 'software',
   name: 'Software',
   order: 1,
  }),
 ];

 const plan = buildCategoryImportPlan(currentCategories, []);

 assert.deepEqual(plan.create, []);
 assert.deepEqual(plan.update, []);
 assert.deepEqual(plan.deleteIds, ['entertainment', 'software']);
});
