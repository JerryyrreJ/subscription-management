import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium, type Browser } from '@playwright/test';
import type { scenarios } from './sync-harness';

let browser: Browser;
let bundle: string;
before(async () => {
 // Bundle the real hooks with no application config, credentials, or network.
 const result = await build({
  configFile: false,
  logLevel: 'silent',
  plugins: [{
   name: 'isolated-supabase',
   load(id) {
    if (id.endsWith('/src/lib/supabase.ts')) return `export const supabase = {
     auth: { getUser() { throw new Error('Unexpected auth request'); } },
     from() { throw new Error('Unexpected database request'); }
    };`;
   },
  }],
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
  build: {
   lib: { entry: fileURLToPath(new URL('./sync-harness.ts', import.meta.url)), name: 'SyncRegression', formats: ['iife'] },
   write: false,
   minify: false,
  },
 });
 const outputs = Array.isArray(result) ? result : [result];
 bundle = outputs.flatMap(output => 'output' in output ? output.output : [])
  .filter(output => output.type === 'chunk').map(output => output.code).join('\n');
 browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); });

async function run(name: keyof typeof scenarios) {
 const page = await browser.newPage();
 try {
  await page.route('**/*', route => route.request().isNavigationRequest()
   ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
   : route.abort());
  await page.goto('http://localhost:4179/');
  await page.addScriptTag({ content: bundle });
  return await page.evaluate(async scenario => {
   const harness = (globalThis as unknown as { SyncRegression: { scenarios: typeof scenarios } }).SyncRegression;
   return harness.scenarios[scenario]();
  }, name);
 } finally { await page.close(); }
}

test('account B never joins A, and A completion cannot clear B task or change B status', async () => {
 assert.deepEqual(await run('accountSwitch'), {
  afterA: { names: [], status: 'syncing', lastSyncTime: null },
  calls: ['account-a', 'account-b'], names: ['Private B'], storedB: ['Private B'],
 });
});
test('logging out and back in cannot reactivate a previous login request', async () => {
 assert.deepEqual(await run('relogin'), { names: [], lastSyncTime: null });
});
test('unmounted sync cannot repopulate local storage', async () => {
 assert.deepEqual(await run('unmountedSync'), []);
});
test('offline creation during sync survives with its retry operation', async () => {
 assert.deepEqual(await run('offlineCreate'), { names: ['Offline addition'], pending: ['create'] });
});
test('editing a submitted operation preserves new contents even when its ID stays the same', async () => {
 assert.deepEqual(await run('compactedEdit'), { names: ['After'], id: 'same-operation', baseUpdatedAt: '2026-11-09T00:00:00.000Z' });
});
test('deleting a submitted create leaves a retryable deletion and does not resurrect the record', async () => {
 assert.deepEqual(await run('deleteSubmittedCreate'), { count: 0, pending: ['delete'] });
});
test('foreground write finishing after an account switch persists only to its original account', async () => {
 assert.deepEqual(await run('oldMutation'), { names: [], storedB: [], storedA: ['A mutation'] });
});
test('initialization completes all stages despite state updates, then initializes the next account', async () => {
 assert.deepEqual(await run('initialization'), [
  'A:subscriptions', 'A:categories', 'A:notifications', 'B:subscriptions', 'B:categories', 'B:notifications',
 ]);
});
test('logout cancels the remaining initialization stages', async () => {
 assert.deepEqual(await run('cancelledInitialization'), ['subscriptions']);
});
test('service rejects a changed authenticated user before issuing a database mutation', async () => {
 assert.equal(await run('changedAuthentication'), 'Authenticated user changed during subscription operation');
});
test('each step of a queued sync remains pinned to its original authenticated user', async () => {
 assert.deepEqual(await run('changedAuthenticationDuringSync'), { queries: 1, pending: 1 });
});
test('a create and delete during the same sync cannot reappear from a stale cloud snapshot', async () => {
 assert.deepEqual(await run('createThenDelete'), { count: 0, pending: ['delete'] });
});
