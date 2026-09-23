import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubscriptionsApiHandler } from '../../netlify/functions/api-v1-subscriptions.ts';
import { hashApiKey } from '../../netlify/functions/_shared/apiKeys.ts';
import {
  createFakeSupabaseClient,
  event,
  expectHandlerResponse,
  type QueryState,
} from './apiTestHelpers.ts';

const apiKey = 'subm_test_api_key';
const apiKeyId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';

const limits = {
  requestsPerMinute: 60,
  activeKeys: 5,
  failedAuthRequestsPerHour: 300,
  rateLimitRetentionHours: 48,
};

const subscriptionRow = {
  id: '33333333-3333-4333-8333-333333333333',
  user_id: userId,
  name: 'Netflix',
  category: 'Streaming',
  amount: 15.99,
  currency: 'USD',
  period: 'monthly',
  last_payment_date: '2026-06-01',
  next_payment_date: '2026-07-01',
  billing_anchor_day: 1,
  custom_date: null,
  notification_enabled: true,
  status: 'active',
  created_at: '2026-06-16T00:00:00.000Z',
  updated_at: '2026-06-16T00:00:00.000Z',
};

const createDatabase = (
  subscriptionResolver: (state: QueryState) => { data: unknown; error: { message: string } | null },
  options: {
    rateLimitAllowed?: boolean;
    lookupFound?: boolean;
    lookupLimited?: boolean;
    lookupScopes?: string[];
    touchError?: { message: string } | null;
  } = {}
) => createFakeSupabaseClient((state: QueryState) => {
  if (state.table === 'api_keys' && state.operation === 'update') {
    return { data: null, error: options.touchError ?? null };
  }

  if (state.table === 'user_profiles') {
    return { data: { is_premium: false }, error: null };
  }

  if (state.table === 'api_audit_log') {
    return { data: null, error: null };
  }

  if (state.table === 'subscriptions') {
    return subscriptionResolver(state);
  }

  return { data: null, error: { message: `Unexpected query: ${state.table}` } };
}, (name, args) => {
  if (name === 'lookup_api_key_for_auth') {
    assert.equal(args.p_key_hash, hashApiKey(apiKey));
    assert.match(String(args.p_identity_hash), /^[a-f0-9]{64}$/);
    assert.equal(args.p_failure_limit, limits.failedAuthRequestsPerHour);

    if (options.lookupLimited) {
      return {
        data: [{ limited: true, id: null, user_id: null, key_prefix: null, scopes: null }],
        error: null,
      };
    }

    if (options.lookupFound === false) {
      return {
        data: [{ limited: false, id: null, user_id: null, key_prefix: null, scopes: null }],
        error: null,
      };
    }

    return {
      data: [{
        limited: false,
        id: apiKeyId,
        user_id: userId,
        key_prefix: apiKey.slice(0, 14),
        scopes: options.lookupScopes ?? ['read', 'write'],
      }],
      error: null,
    };
  }

  assert.equal(name, 'consume_api_user_minute_limit');
  assert.equal(args.p_user_id, userId);
  assert.equal(Object.hasOwn(args, 'p_api_key_id'), false);

  return {
    data: [{
      allowed: options.rateLimitAllowed ?? true,
      request_count: options.rateLimitAllowed === false ? 60 : 1,
      remaining: options.rateLimitAllowed === false ? 0 : 59,
      reset_at: '2026-06-16T01:00:00.000Z',
    }],
    error: null,
  };
});


for (const scenario of [
  {name: 'renaming cancelled subscription', extra: {status: 'cancelled'}, patch: {name: 'Renamed'}},
  {name: 'renaming paused subscription', extra: {status: 'paused'}, patch: {name: 'Renamed'}},
  {name: 'changing trial nextPaymentDate', extra: {is_trial: true, trial_ends_on: '2026-07-01'}, patch: {nextPaymentDate: '2026-07-15'}},
  {name: 'changing trialEndsOn anchor', extra: {is_trial: true, trial_ends_on: '2026-07-01'}, patch: {trialEndsOn: '2026-07-15'}},
]) {
 test(scenario.name, async () => {
  const row = {...subscriptionRow, ...scenario.extra};
  let written: unknown;
  const database = createDatabase(state => {
   if(state.operation === 'select') return {data: row, error: null};
   written = state.payload;
   return {data: {...row, ...(state.payload as object)}, error: null};
  });
  const handler = createSubscriptionsApiHandler(() => ({database, limits, createRequestId: () => 'review', now: () => new Date('2026-06-16T00:00:00Z')}));
  const response = expectHandlerResponse(await handler(event('PATCH', `/api/v1/subscriptions/${row.id}`, {authorization: `Bearer ${apiKey}`, 'content-type': 'application/json'}, JSON.stringify(scenario.patch)), {} as never));
  assert.equal(response.statusCode, 200);
  const payload = written as Record<string, unknown>;
  if (scenario.name.startsWith('renaming')) {
    assert.equal(payload.status, scenario.extra.status);
  } else {
    assert.equal(payload.next_payment_date, '2026-07-15');
    assert.equal(payload.trial_ends_on, '2026-07-15');
    assert.equal(payload.billing_anchor_day, 15);
    assert.equal(payload.last_payment_date, '2026-06-15');
  }
 });
}
