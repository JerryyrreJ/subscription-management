import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type https from 'node:https';
import type { LookupAddress } from 'node:dns';
import {
 createScheduledNotificationsHandler,
 createServerBarkSender,
} from '../../netlify/functions/send-scheduled-notifications.ts';
import type { HttpsRequestFn } from '../../netlify/functions/_shared/barkServerPush.ts';
import { createFakeSupabaseClient, type QueryState } from './apiTestHelpers.ts';

const withMockedNow = async (isoDateTime: string, run: () => Promise<void>) => {
 const RealDate = Date;

 class MockDate extends RealDate {
  constructor(value?: string | number | Date) {
   super(value ?? isoDateTime);
  }

  static now() {
   return new RealDate(isoDateTime).getTime();
  }
 }

 MockDate.parse = RealDate.parse;
 MockDate.UTC = RealDate.UTC;

 globalThis.Date = MockDate as unknown as DateConstructor;

 try {
  await run();
 } finally {
  globalThis.Date = RealDate;
 }
};

const userId = '11111111-1111-4111-8111-111111111111';

const createSettingsRow = (overrides: Record<string, unknown> = {}) => ({
 user_id: userId,
 bark_enabled: true,
 time_zone: 'UTC',
 locale: 'en',
 bark_server_url: 'https://api.day.app',
 bark_device_key: 'valid-device-key-12345',
 bark_days_before: 3,
 bark_history: {},
 ...overrides,
});

const createSubscriptionRow = (overrides: Record<string, unknown> = {}) => ({
 id: 'sub-1',
 user_id: userId,
 name: 'Netflix',
 amount: 15.99,
 currency: 'USD',
 period: 'monthly',
 last_payment_date: '2026-03-07',
 next_payment_date: '2026-04-07',
 billing_anchor_day: 7,
 notification_enabled: true,
 status: 'active',
 is_trial: false,
 trial_ends_on: null,
 ...overrides,
});

test('send-scheduled-notifications sends Bark push when daysUntil matches bark_days_before and updates history', async () => {
 await withMockedNow('2026-04-04T09:00:00.000Z', async () => {
  const sentNotifications: Array<{ title: string; body: string }> = [];
  const lockInserts: Array<Record<string, unknown>> = [];
  const historyUpdates: Array<Record<string, unknown>> = [];

  const supabase = createFakeSupabaseClient((state: QueryState) => {
   if (state.table === 'user_notification_settings' && state.operation === 'select') {
    return { data: [createSettingsRow()], error: null };
   }
   if (state.table === 'subscriptions' && state.operation === 'select') {
    return {
     data: [
      createSubscriptionRow({ id: 'sub-match', name: 'Netflix', next_payment_date: '2026-04-07' }), // 3 days until
      createSubscriptionRow({ id: 'sub-paused', name: 'Paused Sub', next_payment_date: '2026-04-07', status: 'paused' }),
      createSubscriptionRow({ id: 'sub-far', name: 'Far Sub', next_payment_date: '2026-04-12' }), // 8 days until
     ],
     error: null,
    };
   }
   if (state.table === 'notification_delivery_locks' && state.operation === 'insert') {
    lockInserts.push(state.payload as Record<string, unknown>);
    return { data: null, error: null };
   }
   if (state.table === 'user_notification_settings' && state.operation === 'update') {
    historyUpdates.push(state.payload as Record<string, unknown>);
    return { data: null, error: null };
   }
   return { data: null, error: { message: `Unexpected query: ${state.table} ${state.operation}` } };
  });

  const handler = createScheduledNotificationsHandler({
   createSupabase: () => supabase,
   sendNotification: async (_url, _key, title, body) => {
    sentNotifications.push({ title, body });
    return true;
   },
  });

  const response = await handler(new Request('https://example.com/.netlify/functions/send-scheduled-notifications', {
   method: 'POST',
   body: JSON.stringify({ next_run: '2026-04-04T10:00:00.000Z' }),
  }));

  assert.equal(response.status, 200);
  const summary = await response.json() as { totalNotificationsSent: number; totalErrors: number };
  assert.equal(summary.totalNotificationsSent, 1);
  assert.equal(summary.totalErrors, 0);
  assert.equal(sentNotifications.length, 1);
  assert.match(sentNotifications[0].body, /Netflix renews in 3 days/);
  assert.deepEqual(lockInserts[0], {
   user_id: userId,
   subscription_id: 'sub-match',
   channel: 'bark',
   delivery_date: '2026-04-04',
  });
  assert.equal(historyUpdates.length, 1);
  const barkHistory = historyUpdates[0].bark_history as Record<string, string>;
  assert.equal(typeof barkHistory['sub-match'], 'string');
 });
});

test('send-scheduled-notifications respects user time zone and skips already-notified or duplicate-locked deliveries', async () => {
 // 2026-04-04T01:30:00.000Z is still 2026-04-03 in America/Los_Angeles.
 // A subscription due on 2026-04-06 is 3 days away in America/Los_Angeles (but 2 days away in UTC).
 await withMockedNow('2026-04-04T01:30:00.000Z', async () => {
  let pushCalls = 0;

  const supabase = createFakeSupabaseClient((state: QueryState) => {
   if (state.table === 'user_notification_settings' && state.operation === 'select') {
    return {
     data: [
      createSettingsRow({
       time_zone: 'America/Los_Angeles',
       bark_days_before: 3,
       bark_history: {
        'sub-already-sent': '2026-04-04T00:30:00.000Z', // 2026-04-03 in LA
       },
      }),
     ],
     error: null,
    };
   }
   if (state.table === 'subscriptions' && state.operation === 'select') {
    return {
     data: [
      createSubscriptionRow({ id: 'sub-already-sent', next_payment_date: '2026-04-06' }),
      createSubscriptionRow({ id: 'sub-locked', next_payment_date: '2026-04-06' }),
     ],
     error: null,
    };
   }
   if (state.table === 'notification_delivery_locks' && state.operation === 'insert') {
    return { data: null, error: { code: '23505', message: 'duplicate key value' } };
   }
   return { data: null, error: null };
  });

  const handler = createScheduledNotificationsHandler({
   createSupabase: () => supabase,
   sendNotification: async () => {
    pushCalls += 1;
    return true;
   },
  });

  const response = await handler(new Request('https://example.com/.netlify/functions/send-scheduled-notifications'));
  const summary = await response.json() as { totalNotificationsSent: number; totalErrors: number };

  assert.equal(response.status, 200);
  assert.equal(pushCalls, 0);
  assert.equal(summary.totalNotificationsSent, 0);
  assert.equal(summary.totalErrors, 0);
 });
});

test('send-scheduled-notifications releases delivery lock when Bark push fails and does not auto-renew expired trials', async () => {
 await withMockedNow('2026-04-04T09:00:00.000Z', async () => {
  let lockDeleted = false;
  let pushCalls = 0;

  const supabase = createFakeSupabaseClient((state: QueryState) => {
   if (state.table === 'user_notification_settings' && state.operation === 'select') {
    return { data: [createSettingsRow({ bark_days_before: 3 })], error: null };
   }
   if (state.table === 'subscriptions' && state.operation === 'select') {
    return {
     data: [
      // Expired trial whose monthly roll would have landed on 2026-04-07 (3 days away) if it weren't a one-shot trial:
      createSubscriptionRow({
       id: 'sub-expired-trial',
       is_trial: true,
       trial_ends_on: '2026-03-07',
       next_payment_date: '2026-03-07',
      }),
      // Active trial ending in 3 days:
      createSubscriptionRow({
       id: 'sub-active-trial',
       is_trial: true,
       trial_ends_on: '2026-04-07',
       next_payment_date: '2026-04-07',
      }),
     ],
     error: null,
    };
   }
   if (state.table === 'notification_delivery_locks' && state.operation === 'insert') {
    return { data: null, error: null };
   }
   if (state.table === 'notification_delivery_locks' && state.operation === 'delete') {
    lockDeleted = true;
    return { data: null, error: null };
   }
   return { data: null, error: null };
  });

  const handler = createScheduledNotificationsHandler({
   createSupabase: () => supabase,
   sendNotification: async () => {
    pushCalls += 1;
    return false;
   },
  });

  const response = await handler(new Request('https://example.com/.netlify/functions/send-scheduled-notifications'));
  const summary = await response.json() as { totalNotificationsSent: number; totalErrors: number };

  assert.equal(response.status, 200);
  assert.equal(pushCalls, 1); // Only the active trial was attempted, expired trial was skipped
  assert.equal(lockDeleted, true);
  assert.equal(summary.totalNotificationsSent, 0);
  assert.equal(summary.totalErrors, 1);
 });
});

test('send-scheduled-notifications skips SSRF bark_server_url rows and redacts fatal 500 error details', async () => {
 await withMockedNow('2026-04-04T09:00:00.000Z', async () => {
  let pushCalls = 0;

  const supabase = createFakeSupabaseClient((state: QueryState) => {
   if (state.table === 'user_notification_settings' && state.operation === 'select') {
    return {
     data: [
      createSettingsRow({ bark_server_url: 'http://169.254.169.254' }),
     ],
     error: null,
    };
   }
   return { data: [], error: null };
  });

  const handler = createScheduledNotificationsHandler({
   createSupabase: () => supabase,
   sendNotification: async () => {
    pushCalls += 1;
    return true;
   },
  });

  const response = await handler(new Request('https://example.com/.netlify/functions/send-scheduled-notifications'));
  const summary = await response.json() as { totalNotificationsSent: number; totalErrors: number };
  assert.equal(response.status, 200);
  assert.equal(pushCalls, 0);
  assert.equal(summary.totalErrors, 1);

  const fatalHandler = createScheduledNotificationsHandler({
   createSupabase: () => ({
    from() {
     throw new Error('secret-db-connection-string');
    },
   }) as never,
  });

  const fatalResponse = await fatalHandler(new Request('https://example.com/.netlify/functions/send-scheduled-notifications'));
  const fatalBody = await fatalResponse.json() as Record<string, unknown>;
  assert.equal(fatalResponse.status, 500);
  assert.deepEqual(fatalBody, { error: 'Internal server error' });
  assert.equal(Object.hasOwn(fatalBody, 'details'), false);
 });
});

test('createServerBarkSender blocks hostnames resolving to private or link-local IP addresses', async () => {
 let sentCalls = 0;
 const senderWithPrivateDns = createServerBarkSender(
  async () => [{ address: '169.254.169.254' }],
  async () => {
   sentCalls += 1;
   return true;
  }
 );

 const blocked = await senderWithPrivateDns(
  'https://evil.attacker.org',
  'valid-device-key-12345',
  'Title',
  'Body'
 );
 assert.equal(blocked, false);
 assert.equal(sentCalls, 0);

 const senderWithPublicDns = createServerBarkSender(
  async () => [{ address: '104.26.10.228' }],
  async () => {
   sentCalls += 1;
   return true;
  }
 );

 const allowed = await senderWithPublicDns(
  'https://api.day.app',
  'valid-device-key-12345',
  'Title',
  'Body'
 );
 assert.equal(allowed, true);
 assert.equal(sentCalls, 1);
});

const createFakeHttpsRequest = (responseSpec: {
 statusCode: number;
 body: string;
}) => {
 const captured: Array<{
  url: URL;
  options: https.RequestOptions;
  requestBody: string;
 }> = [];

 const requestImpl = ((
  url: string | URL,
  options: https.RequestOptions,
  callback?: (res: unknown) => void
 ) => {
  const req = new EventEmitter() as EventEmitter & {
   write: (chunk: Buffer | string) => boolean;
   end: () => void;
   destroy: (err?: Error) => void;
  };
  let requestBody = '';

  req.write = (chunk: Buffer | string) => {
   requestBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
   return true;
  };
  req.destroy = (err?: Error) => {
   if (err) {
    queueMicrotask(() => req.emit('error', err));
   }
  };
  req.end = () => {
   const parsedUrl = url instanceof URL ? url : new URL(url);
   captured.push({ url: parsedUrl, options, requestBody });

   const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    statusMessage: string;
    resume: () => void;
    destroy: (err?: Error) => void;
   };
   res.statusCode = responseSpec.statusCode;
   res.statusMessage = responseSpec.statusCode === 200 ? 'OK' : 'Redirect';
   res.resume = () => {};
   res.destroy = (err?: Error) => {
    if (err) {
     queueMicrotask(() => res.emit('error', err));
    }
   };

   queueMicrotask(() => {
    callback?.(res);
    if (responseSpec.statusCode >= 200 && responseSpec.statusCode < 300) {
     res.emit('data', Buffer.from(responseSpec.body, 'utf8'));
     res.emit('end');
    }
   });
  };

  return req;
 }) as unknown as HttpsRequestFn;

 return { requestImpl, captured };
};

test('createServerBarkSender pins validated public IP to prevent DNS rebinding and rejects redirects', async () => {
 let dnsCalls = 0;
 const rebindingDns = async () => {
  dnsCalls += 1;
  // First lookup returns public IP; a second unpinned lookup would rebind to loopback.
  return dnsCalls === 1
   ? [{ address: '104.26.10.228' }]
   : [{ address: '127.0.0.1' }];
 };

 const { requestImpl, captured } = createFakeHttpsRequest({
  statusCode: 200,
  body: JSON.stringify({ code: 200, message: 'success' }),
 });

 const sender = createServerBarkSender(rebindingDns, undefined, requestImpl);
 const ok = await sender(
  'https://rebind.attacker.org',
  'valid-device-key-12345',
  'Renewal',
  'Netflix renews tomorrow'
 );

 assert.equal(ok, true);
 assert.equal(dnsCalls, 1);
 assert.equal(captured.length, 1);
 assert.equal(captured[0].url.hostname, 'rebind.attacker.org');
 assert.equal(captured[0].options.agent, false);
 assert.equal(captured[0].options.rejectUnauthorized, true);
 assert.equal(captured[0].options.servername, 'rebind.attacker.org');
 assert.equal(typeof captured[0].options.lookup, 'function');

 // Verify pinned lookup resolves ONLY to the initially validated IP (both single and all modes)
 // and refuses any mismatched hostname without touching DNS again.
 const pinnedLookup = captured[0].options.lookup!;
 const singleLookup = await new Promise<{ address: string; family?: number }>((resolve, reject) => {
  pinnedLookup('rebind.attacker.org', {}, (err, address, family) => {
   if (err) reject(err);
   else resolve({ address: String(address), family });
  });
 });
 assert.deepEqual(singleLookup, { address: '104.26.10.228', family: 4 });

 const allLookup = await new Promise<LookupAddress[]>((resolve, reject) => {
  pinnedLookup('rebind.attacker.org', { all: true }, (err, addresses) => {
   if (err) reject(err);
   else resolve(addresses as LookupAddress[]);
  });
 });
 assert.deepEqual(allLookup, [{ address: '104.26.10.228', family: 4 }]);

 await assert.rejects(
  () => new Promise<void>((resolve, reject) => {
   pinnedLookup('other.internal.host', {}, err => {
    if (err) reject(err);
    else resolve();
   });
  }),
  /Blocked unexpected DNS lookup/
 );
 assert.equal(dnsCalls, 1);

 // Redirect responses (302) must be rejected without following.
 const redirectMock = createFakeHttpsRequest({ statusCode: 302, body: '' });
 const redirectSender = createServerBarkSender(
  async () => [{ address: '104.26.10.228' }],
  undefined,
  redirectMock.requestImpl
 );
 const redirectOk = await redirectSender(
  'https://api.day.app',
  'valid-device-key-12345',
  'Title',
  'Body'
 );
 assert.equal(redirectOk, false);
});
