import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBarkUrl, updateBarkPushFromUrl } from '../../src/utils/barkConfig.ts';
import { hasValidBarkConfig, isBarkReady } from '../../src/utils/barkSettings.ts';
import { isPublicBarkIpAddress, sendBarkNotification, validateBarkConfig } from '../../src/utils/barkPush.ts';
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

test('validateBarkConfig and parseBarkUrl reject unsafe schemes, credentials, and SSRF targets', () => {
 const unsafeServerUrls = [
  'http://api.day.app',
  'file:///etc/passwd',
  'ftp://api.day.app',
  'https://user:pass@api.day.app',
  'https://api.day.app?foo=bar',
  'https://api.day.app#frag',
  'https://localhost',
  'https://localhost.',
  'https://sub.localhost',
  'https://metadata.google.internal',
  'https://bark.local',
  'https://redis',
  'https://127.0.0.1',
  'https://0.0.0.0',
  'https://10.0.0.1',
  'https://172.16.0.1',
  'https://172.31.255.255',
  'https://192.168.1.10',
  'https://100.64.0.1',
  'https://169.254.169.254',
  'https://[::1]',
  'https://[::]',
  'https://[::ffff:127.0.0.1]',
  'https://[::ffff:169.254.169.254]',
  'https://[fc00::1]',
  'https://[fd12:3456:789a::1]',
  'https://[fe80::1]',
  'https://[64:ff9b::127.0.0.1]',
  'https://[2001:db8::1]',
 ];

 for (const serverUrl of unsafeServerUrls) {
  assert.equal(
   validateBarkConfig(serverUrl, 'AbCd1234').valid,
   false,
   `Expected validateBarkConfig to reject ${serverUrl}`
  );
  assert.equal(
   parseBarkUrl(`${serverUrl}/AbCd1234/title/body`).valid,
   false,
   `Expected parseBarkUrl to reject ${serverUrl}`
  );
 }

 // Public HTTPS domain and public global unicast IP literals remain allowed.
 assert.equal(validateBarkConfig('https://api.day.app', 'AbCd_1234-xyz').valid, true);
 assert.equal(validateBarkConfig('https://bark.example-domain.org:8443', 'AbCd1234').valid, true);
 assert.equal(validateBarkConfig('https://[2606:4700:4700::1111]', 'AbCd1234').valid, true);
 assert.equal(isPublicBarkIpAddress('1.1.1.1'), true);
 assert.equal(isPublicBarkIpAddress('2606:4700:4700::1111'), true);
 assert.equal(isPublicBarkIpAddress('::ffff:1.1.1.1'), true);
 assert.equal(isPublicBarkIpAddress('::ffff:169.254.169.254'), false);
 assert.equal(isPublicBarkIpAddress('169.254.169.254'), false);
});

test('sendBarkNotification enforces config validation and sets redirect: error on fetch', async () => {
 const realFetch = globalThis.fetch;
 const calls: Array<{ url: string; init?: RequestInit }> = [];

 globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(input), init });
  return new Response(JSON.stringify({ code: 200, message: 'success' }), {
   status: 200,
   headers: { 'Content-Type': 'application/json' },
  });
 }) as typeof fetch;

 try {
  const blocked = await sendBarkNotification(
   'http://169.254.169.254',
   'AbCd1234',
   'Title',
   'Body'
  );
  assert.equal(blocked, false);
  assert.equal(calls.length, 0);

  const ok = await sendBarkNotification(
   'https://api.day.app/',
   'AbCd1234',
   'Renewal',
   'Body text'
  );
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.redirect, 'error');
  assert.equal(calls[0].url, 'https://api.day.app/AbCd1234/Renewal/Body%20text');
 } finally {
  globalThis.fetch = realFetch;
 }
});
