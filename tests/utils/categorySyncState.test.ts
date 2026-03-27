import test from 'node:test';
import assert from 'node:assert/strict';
import { Category } from '../../src/utils/categories.ts';
import {
 executeCategorySync,
 executeCategoryUpload,
 finalizeCategoryCloudMutation,
 stageCategorySnapshot,
} from '../../src/utils/categorySyncState.ts';

const createCategory = (overrides: Partial<Category> = {}): Category => ({
 id: overrides.id || 'entertainment',
 name: overrides.name || 'Entertainment',
 order: overrides.order ?? 0,
 isBuiltIn: overrides.isBuiltIn ?? true,
 isHidden: overrides.isHidden ?? false,
});

test('stageCategorySnapshot persists categories locally and saves a pending snapshot', () => {
 const nextCategories = [
  createCategory(),
  createCategory({ id: 'software', name: 'Software', order: 1 }),
 ];

 let persistedCategories: Category[] | null = null;
 let pendingSnapshot: Category[] | null = null;

 const result = stageCategorySnapshot(nextCategories, {
  persistCategories: (categories) => {
   persistedCategories = categories;
  },
  savePendingSnapshot: (categories) => {
   pendingSnapshot = categories;
  },
 });

 assert.deepEqual(result, nextCategories);
 assert.deepEqual(persistedCategories, nextCategories);
 assert.deepEqual(pendingSnapshot, nextCategories);
});

test('executeCategorySync prefers pending snapshot and clears it after successful reconcile', async () => {
 const localCategories = [createCategory()];
 const pendingCategories = [createCategory({ isHidden: true })];
 const reconciledCategories = [createCategory({ isHidden: true, order: 1 })];

 let syncedWithLocal = false;
 let reconciledWithPending: Category[] | null = null;
 let clearedPending = false;
 let persistedCategories: Category[] | null = null;

 const result = await executeCategorySync({
  loadLocalCategories: () => localCategories,
  loadPendingSnapshot: () => pendingCategories,
  syncCloudCategories: async () => {
   syncedWithLocal = true;
   return localCategories;
  },
  reconcilePendingCategories: async (categories) => {
   reconciledWithPending = categories;
   return reconciledCategories;
  },
  persistCategories: (categories) => {
   persistedCategories = categories;
  },
  clearPendingSnapshot: () => {
   clearedPending = true;
  },
 });

 assert.equal(syncedWithLocal, false);
 assert.deepEqual(reconciledWithPending, pendingCategories);
 assert.deepEqual(persistedCategories, reconciledCategories);
 assert.equal(clearedPending, true);
 assert.deepEqual(result, reconciledCategories);
});

test('executeCategorySync leaves pending snapshot untouched when reconcile fails', async () => {
 const pendingCategories = [createCategory({ isHidden: true })];
 let clearedPending = false;
 let persistedCategories = false;

 await assert.rejects(
  executeCategorySync({
   loadLocalCategories: () => [createCategory()],
   loadPendingSnapshot: () => pendingCategories,
   syncCloudCategories: async (categories) => categories,
   reconcilePendingCategories: async () => {
    throw new Error('cloud reconcile failed');
   },
   persistCategories: () => {
    persistedCategories = true;
   },
   clearPendingSnapshot: () => {
    clearedPending = true;
   },
  }),
  /cloud reconcile failed/
 );

 assert.equal(persistedCategories, false);
 assert.equal(clearedPending, false);
});

test('executeCategoryUpload reconciles the pending snapshot when one exists', async () => {
 const localCategories = [createCategory()];
 const pendingCategories = [createCategory({ id: 'software', name: 'Software', order: 1 })];
 const syncedCategories = [...pendingCategories, createCategory()];

 let reconciledWith: Category[] | null = null;
 let clearedPending = false;

 const result = await executeCategoryUpload(localCategories, {
  loadPendingSnapshot: () => pendingCategories,
  reconcilePendingCategories: async (categories) => {
   reconciledWith = categories;
   return syncedCategories;
  },
  persistCategories: () => {},
  clearPendingSnapshot: () => {
   clearedPending = true;
  },
 });

 assert.deepEqual(reconciledWith, pendingCategories);
 assert.equal(clearedPending, true);
 assert.deepEqual(result, syncedCategories);
});

test('finalizeCategoryCloudMutation clears pending snapshot and marks success after a successful cloud write', async () => {
 let clearedPending = false;
 let markedSuccess = false;

 const result = await finalizeCategoryCloudMutation({
  hadPendingSnapshot: false,
  executeCloudMutation: async () => 'ok',
  clearPendingSnapshot: () => {
   clearedPending = true;
  },
  markSyncSuccess: () => {
   markedSuccess = true;
  },
 });

 assert.equal(result, 'ok');
 assert.equal(clearedPending, true);
 assert.equal(markedSuccess, true);
});

test('finalizeCategoryCloudMutation keeps pending snapshot and does not mark success when cloud write fails', async () => {
 let clearedPending = false;
 let markedSuccess = false;

 await assert.rejects(
  finalizeCategoryCloudMutation({
   hadPendingSnapshot: false,
   executeCloudMutation: async () => {
    throw new Error('order update failed');
   },
   clearPendingSnapshot: () => {
    clearedPending = true;
   },
   markSyncSuccess: () => {
    markedSuccess = true;
   },
  }),
  /order update failed/
 );

 assert.equal(clearedPending, false);
 assert.equal(markedSuccess, false);
});
