import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotificationSettingsConfigPayload } from '../../src/utils/notificationSettingsPayload.ts';
import { ReminderSettings } from '../../src/types.ts';

test('buildNotificationSettingsConfigPayload excludes backend-managed bark history', () => {
 const settings: ReminderSettings = {
  barkPush: {
   enabled: true,
   serverUrl: 'https://api.day.app',
   deviceKey: 'device-key',
   daysBefore: 7,
   notificationHistory: {
    sub_1: '2026-04-01T00:00:00.000Z',
   },
  },
 };

 const payload = buildNotificationSettingsConfigPayload(settings, 'user-123');

 assert.deepEqual(payload, {
  user_id: 'user-123',
  bark_enabled: true,
  bark_server_url: 'https://api.day.app',
  bark_device_key: 'device-key',
  bark_days_before: 7,
 });
 assert.equal('bark_history' in payload, false);
});
