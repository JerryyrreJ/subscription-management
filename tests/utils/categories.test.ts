import test from 'node:test';
import assert from 'node:assert/strict';
import {
 DEFAULT_CATEGORIES,
 addOrRestoreCustomCategory,
 buildRestoredDefaultCategories,
 loadCategories,
 moveVisibleCategory,
 reorderCategoriesById,
 saveCategories,
 validateCategoryName,
 type Category,
} from '../../src/utils/categories.ts';
import { GUEST_DATA_SCOPE, setActiveDataScope } from '../../src/utils/dataScope.ts';

function withMockLocalStorage(run: () => void) {
 const store = new Map<string, string>();
 const original = globalThis.localStorage;
 Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
   getItem: (key: string) => store.get(key) ?? null,
   setItem: (key: string, value: string) => {
    store.set(key, String(value));
   },
   removeItem: (key: string) => {
    store.delete(key);
   },
   clear: () => {
    store.clear();
   },
  },
 });
 setActiveDataScope(GUEST_DATA_SCOPE);

 try {
  run();
 } finally {
  Object.defineProperty(globalThis, 'localStorage', {
   configurable: true,
   value: original,
  });
 }
}

const sampleCategories = (): Category[] => [
 { id: 'entertainment', name: 'Entertainment', order: 0, isBuiltIn: true, isHidden: true },
 { id: 'software', name: 'Software', order: 1, isBuiltIn: true, isHidden: false },
 { id: 'music', name: 'Music', order: 2, isBuiltIn: true, isHidden: false },
 { id: 'productivity', name: 'Productivity', order: 3, isBuiltIn: true, isHidden: true },
 { id: 'custom-cloud', name: '云服务', order: 4, isBuiltIn: false, isHidden: false },
];

test('validateCategoryName accepts Chinese and international category names while rejecting invalid ones', () => {
 withMockLocalStorage(() => {
  saveCategories([...DEFAULT_CATEGORIES], GUEST_DATA_SCOPE);

  for (const validName of ['云服务', 'AI 工具', '影音/流媒体', 'Dev & Cloud', 'SaaS (Work)', 'サブスク', 'Café']) {
   const result = validateCategoryName(validName);
   assert.equal(result.isValid, true, `Expected "${validName}" to be valid`);
  }

  assert.equal(validateCategoryName('   ').errorCode, 'required');
  assert.equal(validateCategoryName('a'.repeat(51)).errorCode, 'tooLong');
  assert.equal(validateCategoryName('<script>').errorCode, 'invalidCharacters');
  assert.equal(validateCategoryName('line1\nline2').errorCode, 'invalidCharacters');
  assert.equal(validateCategoryName('Uncategorized').errorCode, 'reserved');
  assert.equal(validateCategoryName('未分类').errorCode, 'reserved');
  assert.equal(validateCategoryName('Software').errorCode, 'duplicate');
  assert.equal(validateCategoryName('娱乐').errorCode, 'duplicate');
 });
});

test('addOrRestoreCustomCategory creates Chinese categories and restores hidden built-in categories', () => {
 withMockLocalStorage(() => {
  saveCategories(sampleCategories(), GUEST_DATA_SCOPE);

  const created = addOrRestoreCustomCategory('AI 工具', GUEST_DATA_SCOPE);
  assert.equal(created.success, true);
  assert.equal(created.action, 'created');
  assert.equal(created.category?.name, 'AI 工具');

  const restoredByAlias = addOrRestoreCustomCategory('娱乐', GUEST_DATA_SCOPE);
  assert.equal(restoredByAlias.success, true);
  assert.equal(restoredByAlias.action, 'restored');
  assert.equal(restoredByAlias.category?.id, 'entertainment');
  assert.equal(restoredByAlias.category?.isHidden, false);

  const stored = loadCategories(GUEST_DATA_SCOPE);
  assert.equal(stored.some(cat => cat.name === 'AI 工具'), true);
  assert.equal(stored.find(cat => cat.id === 'entertainment')?.isHidden, false);
 });
});

test('reorderCategoriesById moves the dragged category accurately even when earlier categories are hidden', () => {
 const categories = sampleCategories();
 // Visible list is: ['software', 'music', 'custom-cloud']
 const reordered = reorderCategoriesById(categories, 'software', 'music');
 const visibleIds = reordered.filter(cat => !cat.isHidden).map(cat => cat.id);
 assert.deepEqual(visibleIds, ['music', 'software', 'custom-cloud']);
 // Hidden item at index 0 must remain untouched rather than being accidentally spliced
 assert.equal(reordered[0].id, 'entertainment');
 assert.equal(reordered[0].isHidden, true);
 assert.deepEqual(reordered.map(cat => cat.order), [0, 1, 2, 3, 4]);
});

test('moveVisibleCategory reorders categories cleanly for touch/keyboard controls with hidden items skipped', () => {
 const categories = sampleCategories();
 // Visible order: software -> music -> custom-cloud
 const movedUp = moveVisibleCategory(categories, 'custom-cloud', 'up', false);
 assert.deepEqual(
  movedUp.filter(cat => !cat.isHidden).map(cat => cat.id),
  ['software', 'custom-cloud', 'music']
 );

 const movedDown = moveVisibleCategory(movedUp, 'software', 'down', false);
 assert.deepEqual(
  movedDown.filter(cat => !cat.isHidden).map(cat => cat.id),
  ['custom-cloud', 'software', 'music']
 );

 // Boundary moves are no-ops
 assert.equal(moveVisibleCategory(categories, 'software', 'up', false), categories);
 assert.equal(moveVisibleCategory(categories, 'custom-cloud', 'down', false), categories);
});

test('buildRestoredDefaultCategories unhides built-ins, restores missing defaults, and keeps custom categories', () => {
 const restored = buildRestoredDefaultCategories(sampleCategories());

 for (const defaultCat of DEFAULT_CATEGORIES) {
  const match = restored.find(cat => cat.id === defaultCat.id);
  assert.ok(match, `Missing restored default category ${defaultCat.id}`);
  assert.equal(match.isHidden, false);
 }

 assert.equal(restored.some(cat => cat.id === 'custom-cloud' && cat.name === '云服务'), true);
 assert.deepEqual(restored.map(cat => cat.order), restored.map((_, idx) => idx));
});
