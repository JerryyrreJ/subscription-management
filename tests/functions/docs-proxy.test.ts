import test from 'node:test';
import assert from 'node:assert/strict';
import docsProxy from '../../netlify/edge-functions/docs-proxy.ts';

const context = { ip: '192.0.2.1', next: async () => new Response('app') };

test('only documentation and domain verification reach the fixed upstream', async t => {
  const requests: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (request: Request) => {
    requests.push(request);
    return new Response('docs', { headers: { 'Content-Type': 'text/html' } });
  });
  for (const path of ['/docs', '/docs/zh-CN/user-guide/agent-setup?x=1', '/docs/_next/chunk.js', '/.well-known/vercel/challenge']) {
    assert.equal(await (await docsProxy(new Request(`https://steadyrenew.com${path}`), context)).text(), 'docs');
    assert.equal(requests.at(-1)?.url, `https://subscriptionmanager.mintlify.site${path}`);
  }
  const count = requests.length;
  for (const path of ['/', '/app', '/api/v1/subscriptions', '/docs-other', '/.well-known/agent-card.json']) {
    assert.equal(await (await docsProxy(new Request(`https://steadyrenew.com${path}`), context)).text(), 'app');
  }
  assert.equal(requests.length, count);
});

test('forwards POST bodies and trusted network headers without app credentials', async t => {
  t.mock.method(globalThis, 'fetch', async (request: Request, init: RequestInit) => {
    assert.equal(request.method, 'POST');
    assert.equal(await request.text(), '{"event":"view"}');
    assert.equal(request.headers.get('origin'), 'https://subscriptionmanager.mintlify.site');
    assert.equal(request.headers.get('x-forwarded-host'), 'steadyrenew.com');
    assert.equal(request.headers.get('x-forwarded-for'), context.ip);
    for (const name of ['host', 'cookie', 'authorization']) assert.equal(request.headers.get(name), null);
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 204 });
  });
  const response = await docsProxy(new Request('https://steadyrenew.com/docs/_mintlify/api/v1/e', {
    method: 'POST', body: '{"event":"view"}',
    headers: { 'Content-Type': 'application/json', Cookie: 'app_session=private', Authorization: 'Bearer private', 'X-Forwarded-For': 'spoofed' },
  }), context);
  assert.equal(response.status, 204);
});

test('preserves errors and streaming content, disables caching, and keeps docs redirects on the public domain', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, {
    status: 308, headers: { Location: 'https://subscriptionmanager.mintlify.site/docs/en?q=1', 'Set-Cookie': 'session=example', 'Cache-Control': 'public, max-age=3600' },
  }));
  const redirect = await docsProxy(new Request('https://steadyrenew.com/docs'), context);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/docs/en?q=1');
  assert.equal(redirect.headers.get('set-cookie'), null);
  for (const name of ['cache-control', 'cdn-cache-control', 'netlify-cdn-cache-control']) assert.equal(redirect.headers.get(name), 'no-store');
  t.mock.method(globalThis, 'fetch', async () => new Response('Not found', { status: 404 }));
  const missing = await docsProxy(new Request('https://steadyrenew.com/docs/missing'), context);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Not found');
});

test('upstream outage returns 502 instead of the application', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network error'); });
  const response = await docsProxy(new Request('https://steadyrenew.com/docs'), context);
  assert.equal(response.status, 502);
  assert.match(await response.text(), /temporarily unavailable/);
});
