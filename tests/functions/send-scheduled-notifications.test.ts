import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createScheduledNotificationsHandler,
 createServerBarkSender,
} from '../../netlify/functions/send-scheduled-notifications.ts';
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
