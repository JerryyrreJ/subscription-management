import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotificationContextPayload } from '../../src/utils/notificationSettingsPayload.ts';

test('automatic context sync preserves notification preferences changed via API', () => {
 const cloud = { bark_enabled: false, bark_days_before: 14, locale: 'zh-CN', time_zone: 'UTC' };
 // A stale browser object must not leak writable preferences into this patch.
 const staleBrowser = { locale: 'en', timeZone: 'Asia/Hong_Kong', bark_enabled: true, bark_days_before: 3 };
 const updated = { ...cloud, ...buildNotificationContextPayload(staleBrowser) };
 assert.deepEqual(updated, { bark_enabled: false, bark_days_before: 14, locale: 'en', time_zone: 'Asia/Hong_Kong' });
 assert.deepEqual(buildNotificationContextPayload({locale: 'en'}), {locale: 'en'});
 assert.deepEqual(buildNotificationContextPayload({}), {});
});
