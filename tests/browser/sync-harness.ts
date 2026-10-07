import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { User } from '@supabase/supabase-js';
import { useSubscriptionSync } from '../../src/hooks/useSubscriptionSync';
import { useInitialAccountSync } from '../../src/hooks/useInitialAccountSync';
import { SubscriptionService } from '../../src/services/subscriptionService';
import { config } from '../../src/lib/config';
import { supabase } from '../../src/lib/supabase';
import { loadPendingSyncOperations, loadSubscriptions, saveSubscriptions, savePendingSyncOperations } from '../../src/utils/storage';
import { getUserDataScope } from '../../src/utils/dataScope';
import { createSubscriptionRecord } from '../../src/utils/subscriptionDomain';
import type { Subscription, SyncSubscriptionsResult } from '../../src/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
config.features.cloudSync = true;
const userA = { id: 'account-a' } as User;
const userB = { id: 'account-b' } as User;
const scopeA = getUserDataScope(userA.id);
const scopeB = getUserDataScope(userB.id);
const empty = (): SyncSubscriptionsResult => ({ subscriptions: [], pendingOperations: [] });
const record = (name: string) => createSubscriptionRecord({
 name, category: 'Software', amount: 10, currency: 'USD', period: 'monthly', nextPaymentDate: '2026-11-08',
});
const deferred = <T,>() => {
 let resolve!: (value: T) => void;
 const promise = new Promise<T>(r => { resolve = r; });
 return { promise, resolve };
};

let hook: ReturnType<typeof useSubscriptionSync>;
let visible: Subscription[];
let root: Root;
let setUser: React.Dispatch<React.SetStateAction<User | null>>;
function Harness() {
 const [user, updateUser] = useState<User | null>(userA);
 const [subscriptions, updateSubscriptions] = useState<Subscription[]>(loadSubscriptions(scopeA));
 hook = useSubscriptionSync(user, updateSubscriptions);
 setUser = updateUser;
 visible = subscriptions;
 return null;
}
async function mount() {
 root = createRoot(document.getElementById('root')!);
 await act(async () => { root.render(React.createElement(Harness)); });
}
async function startSync() {
 let pending!: Promise<Subscription[]>;
 await act(async () => { pending = hook.syncSubscriptions(); });
 return { pending };
}
async function unmount() { await act(async () => root.unmount()); }
const offline = async () => { throw new Error('Simulated offline write'); };

export const scenarios = {
 async changedAuthentication() {
  config.hasSupabaseConfig = true;
  supabase!.auth.getUser = async () => ({ data: { user: userB }, error: null });
  try {
   await SubscriptionService.createSubscription(record('A record'), userA.id);
   return 'unexpected success';
  } catch (error) {
   return (error as Error).message;
  }
 },
 async changedAuthenticationDuringSync() {
  config.hasSupabaseConfig = true;
  let authCalls = 0;
  let queries = 0;
  supabase!.auth.getUser = async () => ({ data: { user: ++authCalls <= 2 ? userA : userB }, error: null });
  const database = supabase as unknown as { from: () => unknown };
  database.from = () => {
   queries++;
   return { select: () => ({ order: () => ({ eq: async () => ({ data: [], error: null }) }) }) };
  };
  const original = record('A record');
  const result = await SubscriptionService.syncSubscriptions([original], [{
   id: 'pending-a', type: 'create', subscriptionId: original.id, subscription: original, queuedAt: original.updatedAt!,
  }], userA.id);
  return { queries, pending: result.pendingOperations.length };
 },
 async createThenDelete() {
  const request = deferred<SyncSubscriptionsResult>();
  const original = record('Temporary');
  SubscriptionService.syncSubscriptions = async () => request.promise;
  SubscriptionService.createSubscription = async () => original;
  SubscriptionService.deleteSubscription = async () => {};
  await mount();
  const first = await startSync();
  await act(async () => { await hook.createSubscription(original); });
  await act(async () => { await hook.deleteSubscription(original.id); });
  await act(async () => { request.resolve({ ...empty(), subscriptions: [original] }); await first.pending; });
  const result = { count: visible.length, pending: loadPendingSyncOperations(scopeA).map(op => op.type) };
  await unmount();
  return result;
 },
 async accountSwitch() {
  const a = deferred<SyncSubscriptionsResult>();
  const b = deferred<SyncSubscriptionsResult>();
  const calls: string[] = [];
  SubscriptionService.syncSubscriptions = async (_subs, _ops, userId) => {
   calls.push(userId!);
   return userId === userA.id ? a.promise : b.promise;
  };
  await mount();
  const first = await startSync();
  await act(async () => setUser(userB));
  const second = await startSync();
  await act(async () => { a.resolve({ ...empty(), subscriptions: [record('Private A')] }); await first.pending; });
  const afterA = { names: visible.map(sub => sub.name), status: hook.syncStatus, lastSyncTime: hook.lastSyncTime };
  let joined!: Promise<Subscription[]>;
  await act(async () => { joined = hook.syncSubscriptions(); });
  await act(async () => { b.resolve({ ...empty(), subscriptions: [record('Private B')] }); await second.pending; await joined; });
  const result = { afterA, calls, names: visible.map(sub => sub.name), storedB: loadSubscriptions(scopeB).map(sub => sub.name) };
  await unmount();
  return result;
 },
 async relogin() {
  const request = deferred<SyncSubscriptionsResult>();
  SubscriptionService.syncSubscriptions = async () => request.promise;
  await mount();
  const first = await startSync();
  await act(async () => setUser(null));
  await act(async () => setUser(userA));
  await act(async () => { request.resolve({ ...empty(), subscriptions: [record('Old login')] }); await first.pending; });
  const result = { names: visible.map(sub => sub.name), lastSyncTime: hook.lastSyncTime };
  await unmount();
  return result;
 },
 async unmountedSync() {
  const request = deferred<SyncSubscriptionsResult>();
  SubscriptionService.syncSubscriptions = async () => request.promise;
  await mount();
  const first = await startSync();
  await unmount();
  request.resolve({ ...empty(), subscriptions: [record('Unmounted')] });
  await first.pending;
  return loadSubscriptions(scopeA);
 },
 async offlineCreate() {
  const request = deferred<SyncSubscriptionsResult>();
  SubscriptionService.syncSubscriptions = async () => request.promise;
  SubscriptionService.createSubscription = offline;
  await mount();
  const first = await startSync();
  await act(async () => { await hook.createSubscription(record('Offline addition')); });
  await act(async () => { request.resolve(empty()); await first.pending; });
  const result = { names: visible.map(sub => sub.name), pending: loadPendingSyncOperations(scopeA).map(op => op.type) };
  await unmount();
  return result;
 },
 async compactedEdit() {
  const original = record('Before');
  saveSubscriptions([original], scopeA);
  savePendingSyncOperations([{ id: 'same-operation', type: 'create', subscriptionId: original.id, subscription: original, queuedAt: original.updatedAt! }], scopeA);
  const request = deferred<SyncSubscriptionsResult>();
  SubscriptionService.syncSubscriptions = async () => request.promise;
  SubscriptionService.updateSubscription = offline;
  await mount();
  const first = await startSync();
  await act(async () => { await hook.updateSubscription({ ...original, name: 'After' }); });
  await act(async () => {
   request.resolve({ ...empty(), subscriptions: [{ ...original, updatedAt: '2026-11-09T00:00:00.000Z' }] });
   await first.pending;
  });
  const pending = loadPendingSyncOperations(scopeA);
  const result = { names: visible.map(sub => sub.name), id: pending[0]?.id, baseUpdatedAt: pending[0]?.baseUpdatedAt };
  await unmount();
  return result;
 },
 async deleteSubmittedCreate() {
  const original = record('Deleted');
  saveSubscriptions([original], scopeA);
  savePendingSyncOperations([{ id: 'create-operation', type: 'create', subscriptionId: original.id, subscription: original, queuedAt: original.updatedAt! }], scopeA);
  const request = deferred<SyncSubscriptionsResult>();
  SubscriptionService.syncSubscriptions = async () => request.promise;
  SubscriptionService.deleteSubscription = offline;
  await mount();
  const first = await startSync();
  await act(async () => { await hook.deleteSubscription(original.id); });
  await act(async () => { request.resolve({ ...empty(), subscriptions: [original] }); await first.pending; });
  const result = { count: visible.length, pending: loadPendingSyncOperations(scopeA).map(op => op.type) };
  await unmount();
  return result;
 },
 async oldMutation() {
  const request = deferred<Subscription>();
  SubscriptionService.createSubscription = async () => request.promise;
  await mount();
  let pending!: Promise<Subscription>;
  await act(async () => { pending = hook.createSubscription(record('A mutation')); });
  await act(async () => setUser(userB));
  await act(async () => { request.resolve(record('A mutation')); await pending; });
  const result = { names: visible.map(sub => sub.name), storedB: loadSubscriptions(scopeB), storedA: loadSubscriptions(scopeA).map(sub => sub.name) };
  await unmount();
  return result;
 },
 async initialization() {
  const requests = [deferred<void>(), deferred<void>()];
  const stages: string[] = [];
  let renderAgain!: () => void;
  let switchUser!: () => void;
  function InitialHarness() {
   const [revision, setRevision] = useState(0);
   const [userId, setUserId] = useState('A');
   renderAgain = () => setRevision(value => value + 1);
   switchUser = () => setUserId('B');
   useInitialAccountSync(userId, true, async isCurrent => {
    stages.push(userId + ':subscriptions');
    setRevision(value => value + 1);
    await requests[userId === 'A' ? 0 : 1].promise;
    if (!isCurrent()) return;
    stages.push(userId + ':categories');
    await Promise.resolve();
    if (!isCurrent()) return;
    stages.push(userId + ':notifications');
   });
   return React.createElement('span', null, revision);
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(React.createElement(InitialHarness)));
  await act(async () => renderAgain());
  await act(async () => { requests[0].resolve(); });
  await act(async () => renderAgain());
  await act(async () => switchUser());
  await act(async () => { requests[1].resolve(); });
  await unmount();
  return stages;
 },
 async cancelledInitialization() {
  const request = deferred<void>();
  const stages: string[] = [];
  let logout!: () => void;
  function InitialHarness() {
   const [id, setId] = useState<string | undefined>('A');
   logout = () => setId(undefined);
   useInitialAccountSync(id, true, async isCurrent => {
    stages.push('subscriptions');
    await request.promise;
    if (isCurrent()) stages.push('categories');
   });
   return null;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(React.createElement(InitialHarness)));
  await act(async () => logout());
  await act(async () => request.resolve());
  await unmount();
  return stages;
 },
};
