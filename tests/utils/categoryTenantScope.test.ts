import test from 'node:test';
import assert from 'node:assert/strict';
import {
 scopeCategoryQueryToUser,
 scopeCategoryQueryToUserAndId,
} from '../../src/utils/categoryTenantScope.ts';

const createQueryRecorder = () => {
 const calls: Array<{ column: string; value: string }> = [];

 const query = {
  eq(column: string, value: string) {
   calls.push({ column, value });
   return this;
  },
 };

 return { calls, query };
};

test('scopeCategoryQueryToUser adds the user_id filter', () => {
 const { calls, query } = createQueryRecorder();

 const result = scopeCategoryQueryToUser(query, 'user-123');

 assert.equal(result, query);
 assert.deepEqual(calls, [{ column: 'user_id', value: 'user-123' }]);
});

test('scopeCategoryQueryToUserAndId adds both user_id and category_id filters', () => {
 const { calls, query } = createQueryRecorder();

 const result = scopeCategoryQueryToUserAndId(query, 'user-123', 'software');

 assert.equal(result, query);
 assert.deepEqual(calls, [
  { column: 'user_id', value: 'user-123' },
  { column: 'category_id', value: 'software' },
 ]);
});
