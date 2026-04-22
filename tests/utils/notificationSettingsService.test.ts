import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotificationSettingsConfigPayload } from '../../src/utils/notificationSettingsPayload.ts';
import { ReminderSettings } from '../../src/types.ts';
import { normalizeTimeZone } from '../../src/utils/dates.ts';

test('buildNotificationSettingsConfigPayload excludes backend-managed bark history', () => {
 const settings: ReminderSettings = {
  timeZone: 'Asia/Shanghai',
  locale: 'zh-CN',
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
  time_zone: 'Asia/Shanghai',
  locale: 'zh-CN',
  bark_enabled: true,
  bark_server_url: 'https://api.day.app',
  bark_device_key: 'device-key',
  bark_days_before: 7,
 });
 assert.equal('bark_history' in payload, false);
});

test('notification settings payload preserves valid time zones and normalizes invalid ones upstream', () => {
 const validSettings: ReminderSettings = {
  timeZone: 'Asia/Shanghai',
  locale: 'en',
  barkPush: {
   enabled: true,
   serverUrl: 'https://api.day.app',
   deviceKey: 'device-key',
   daysBefore: 3,
   notificationHistory: {},
  },
 };

 assert.equal(buildNotificationSettingsConfigPayload(validSettings, 'user-1').time_zone, 'Asia/Shanghai');
 assert.equal(normalizeTimeZone('Definitely/Invalid', 'UTC'), 'UTC');
});
