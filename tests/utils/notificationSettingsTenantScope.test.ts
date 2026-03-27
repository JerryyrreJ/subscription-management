import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeNotificationSettingsQueryToUser } from '../../src/utils/notificationSettingsTenantScope.ts';

test('scopeNotificationSettingsQueryToUser adds the user_id filter', () => {
 const calls: Array<{ column: string; value: string }> = [];

 const query = {
  eq(column: string, value: string) {
   calls.push({ column, value });
   return this;
  },
 };

 const result = scopeNotificationSettingsQueryToUser(query, 'user-123');

 assert.equal(result, query);
 assert.deepEqual(calls, [{ column: 'user_id', value: 'user-123' }]);
});
