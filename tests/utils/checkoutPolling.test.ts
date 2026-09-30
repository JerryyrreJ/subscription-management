import test from 'node:test';
import assert from 'node:assert/strict';
import { startCheckoutPolling } from '../../src/utils/checkoutPolling.ts';
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('pending checkout stops after 60 seconds, and a fresh retry can succeed', async t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 let timedOut = 0;
 let requests = 0;
 const statuses: string[] = [];
 const options = { check: async () => { requests++; return 'pending' as const; }, onStatus: (s: string) => { statuses.push(s); }, onError: () => assert.fail('unexpected error'), onTimeout: () => { timedOut++; } };
 startCheckoutPolling(options);
 await settle();
 for (let i = 0; i < 20; i++) { t.mock.timers.tick(3000); await settle(); }
 assert.equal(timedOut, 1);
 const count = requests;
 t.mock.timers.tick(60_000); await settle();
 assert.equal(requests, count);
 startCheckoutPolling({ ...options, check: async () => 'active' });
 await settle();
 assert.equal(statuses.at(-1), 'active');
});

test('network error can recover without overlapping requests', async t => {
 t.mock.timers.enable({ apis: ['setTimeout'] });
 let errors = 0; let calls = 0; let state = '';
 const stop = startCheckoutPolling({ check: async () => { if (++calls === 1) throw new Error('offline'); return 'failed'; }, onStatus: s => { state = s; }, onError: () => { errors++; }, onTimeout: () => assert.fail('unexpected timeout') });
 await settle(); assert.equal(errors, 1);
 t.mock.timers.tick(3000); await settle();
 assert.equal(state, 'failed');
 t.mock.timers.tick(60_000); await settle(); assert.equal(calls, 2); stop();
});

test('closing or changing accounts aborts the request and ignores its late result', async () => {
 let resolve!: (value: 'active') => void; let signal!: AbortSignal; let updates = 0;
 const stop = startCheckoutPolling({ check: s => { signal = s; return new Promise(r => { resolve = r; }); }, onStatus: () => { updates++; }, onError: () => { updates++; }, onTimeout: () => { updates++; } });
 stop(); resolve('active'); await settle();
 assert.equal(signal.aborted, true); assert.equal(updates, 0);
});
