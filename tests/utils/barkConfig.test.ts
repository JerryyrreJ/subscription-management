import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBarkUrl, updateBarkPushFromUrl } from '../../src/utils/barkConfig.ts';
import { hasValidBarkConfig, isBarkReady } from '../../src/utils/barkSettings.ts';
import type { ReminderSettings } from '../../src/types.ts';

const createBarkPush = (): ReminderSettings['barkPush'] => ({
 enabled: true,
 serverUrl: 'https://api.day.app',
 deviceKey: 'old-device-key',
 daysBefore: 3,
 notificationHistory: {
  sub_1: '2026-04-01T00:00:00.000Z',
 },
});

test('parseBarkUrl extracts the first path segment as device key', () => {
 const parsed = parseBarkUrl('https://api.day.app/AbCd1234/title/body');

 assert.deepEqual(parsed, {
  serverUrl: 'https://api.day.app',
  deviceKey: 'AbCd1234',
  valid: true,
 });
});

test('updateBarkPushFromUrl clears stale config when the input is invalid', () => {
 const next = updateBarkPushFromUrl(createBarkPush(), 'not-a-valid-url');

 assert.deepEqual(next, {
  enabled: true,
  serverUrl: '',
  deviceKey: '',
  daysBefore: 3,
  notificationHistory: {
   sub_1: '2026-04-01T00:00:00.000Z',
  },
 });
});

test('hasValidBarkConfig returns true only for valid Bark settings', () => {
 const settings: Pick<ReminderSettings, 'barkPush'> = {
  barkPush: createBarkPush(),
 };

 assert.equal(hasValidBarkConfig(settings), true);
 assert.equal(
  hasValidBarkConfig({
   barkPush: {
    ...createBarkPush(),
    deviceKey: '',
   },
  }),
  false
 );
});

test('isBarkReady requires both enabled flag and valid config', () => {
 const settings: Pick<ReminderSettings, 'barkPush'> = {
  barkPush: createBarkPush(),
 };

 assert.equal(isBarkReady(settings), true);
 assert.equal(
  isBarkReady({
   barkPush: {
    ...createBarkPush(),
    enabled: false,
   },
  }),
  false
 );
 assert.equal(
  isBarkReady({
   barkPush: {
    ...createBarkPush(),
    deviceKey: '',
   },
  }),
  false
 );
});
