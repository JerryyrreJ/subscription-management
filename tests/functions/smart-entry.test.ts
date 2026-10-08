import test from 'node:test';
import assert from 'node:assert/strict';
import smartEntry from '../../netlify/edge-functions/smart-entry.ts';

const cookie = 'steadyrenew_entry=app';
const page = () => new Response('<html>page</html>', { headers: { 'Content-Type': 'text/html', Vary: 'Accept-Encoding', 'Cache-Control': 'public, max-age=3600' } });
const next = async () => page();

test('returning visitors redirect before any downstream HTML or auth request', async () => {
  const response = await smartEntry(new Request('https://steadyrenew.com/?utm_source=bookmark', { headers: { Cookie: cookie } }), {
    next: async () => { throw new Error('The landing must not be fetched'); },
  });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), '/app?utm_source=bookmark');
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('netlify-cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
});

test('new visitors and crawlers receive the landing without a preference cookie', async () => {
  const visitors: HeadersInit[] = [{}, { Cookie: 'other=app; steadyrenew_entry=website' }, { 'User-Agent': 'Googlebot' }];
  for (const headers of visitors) {
    const response = await smartEntry(new Request('https://steadyrenew.com/', { headers }), { next });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<html>page</html>');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('vary'), 'Accept-Encoding, Cookie');
  }
});

test('direct app visits remember guests as well as signed-in users', async () => {
  for (const path of ['/app', '/app/']) {
    const response = await smartEntry(new Request(`https://steadyrenew.com${path}`), { next });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), `${cookie}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('vary'), 'Accept-Encoding, Cookie');
  }
});

test('visiting the website explicitly bypasses the redirect without forgetting the app preference', async () => {
  for (const path of ['/about', '/about/', '/zh', '/zh/', '/pricing', '/pricing/', '/zh/pricing', '/zh/pricing/']) {
    const response = await smartEntry(new Request(`https://steadyrenew.com${path}`, { headers: { Cookie: cookie } }), { next });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('auth and payment callbacks reach /app with their original query and browser fragment', async () => {
  for (const query of ['?code=example&next=%2Fpricing', '?auth=recovery', '?payment=success&session_id=cs_example', '?error=access_denied&error_description=Try+again']) {
    const response = await smartEntry(new Request(`https://steadyrenew.com/${query}`), { next });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), `/app${query}`);
  }
  const response = await smartEntry(new Request('https://steadyrenew.com/', { headers: { Cookie: cookie } }), { next });
  // A fragment must stay absent in Location so the browser inherits its original fragment.
  assert.equal(response.headers.get('location')?.includes('#'), false);
});

test('prefetches, HEAD, failures and non-HTML responses do not opt a new visitor in', async () => {
  const prefetches: HeadersInit[] = [{ Purpose: 'prefetch' }, { 'Sec-Purpose': 'prefetch;prerender' }];
  for (const headers of prefetches) {
    const response = await smartEntry(new Request('https://steadyrenew.com/app', { headers }), { next });
    assert.equal(response.headers.get('set-cookie'), null);
  }
  const head = await smartEntry(new Request('https://steadyrenew.com/app', { method: 'HEAD' }), { next });
  assert.equal(head.headers.get('set-cookie'), null);
  for (const downstream of [new Response('error', { status: 500 }), new Response('{}', { headers: { 'Content-Type': 'application/json' } })]) {
    const response = await smartEntry(new Request('https://steadyrenew.com/app'), { next: async () => downstream });
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('API, webhook, blog, assets and non-navigation methods pass through untouched', async () => {
  for (const path of ['/api/v1/subscriptions', '/.netlify/functions/stripe-webhook', '/blog', '/assets/app.js']) {
    const downstream = new Response('unchanged');
    const response = await smartEntry(new Request(`https://steadyrenew.com${path}`, { headers: { Cookie: cookie } }), { next: async () => downstream });
    assert.equal(response, downstream);
  }
  for (const method of ['POST', 'OPTIONS']) {
    const downstream = new Response('unchanged');
    const response = await smartEntry(new Request('https://steadyrenew.com/', { method, headers: { Cookie: cookie } }), { next: async () => downstream });
    assert.equal(response, downstream);
  }
});

test('local HTTP can remember entry without a Secure cookie, and redirects stay on the request origin', async () => {
  const response = await smartEntry(new Request('http://localhost:8888/app'), { next });
  assert.equal(response.headers.get('set-cookie')?.includes('Secure'), false);
  const redirect = await smartEntry(new Request('https://preview.example/?next=https://untrusted.example', { headers: { Cookie: cookie } }), { next });
  assert.equal(new URL(redirect.headers.get('location')!, 'https://preview.example').origin, 'https://preview.example');
});
