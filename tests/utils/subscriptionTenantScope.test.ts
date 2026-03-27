import test from 'node:test';
import assert from 'node:assert/strict';
import {
 scopeSubscriptionQueryToUser,
 scopeSubscriptionQueryToUserAndId,
} from '../../src/utils/subscriptionTenantScope.ts';

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

test('scopeSubscriptionQueryToUser adds the user_id filter', () => {
 const { calls, query } = createQueryRecorder();

 const result = scopeSubscriptionQueryToUser(query, 'user-123');

 assert.equal(result, query);
 assert.deepEqual(calls, [{ column: 'user_id', value: 'user-123' }]);
});

test('scopeSubscriptionQueryToUserAndId adds both user_id and subscription id filters', () => {
 const { calls, query } = createQueryRecorder();

 const result = scopeSubscriptionQueryToUserAndId(query, 'user-123', 'sub-1');

 assert.equal(result, query);
 assert.deepEqual(calls, [
  { column: 'user_id', value: 'user-123' },
  { column: 'id', value: 'sub-1' },
 ]);
});
