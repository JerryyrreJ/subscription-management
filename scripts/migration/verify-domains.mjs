import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../../ops/steadyrenew/domains.json', import.meta.url), 'utf8'));
const origin = process.argv[2];
if (origin && !/^https?:\/\//.test(origin)) throw new Error('Pass an HTTP(S) preview origin, or omit it to verify production domains.');
const website = origin ? new URL(origin).origin : manifest.marketingOrigin;
const app = origin ? new URL(origin).origin : manifest.applicationOrigin;
const docs = origin ? null : manifest.documentationOrigin;
const checks = [
  [website + '/', 200, 'SteadyRenew'],
  [website + '/blog', 200, 'https://steadyrenew.com/blog'],
  [website + '/zh/blog', 200, 'https://steadyrenew.com/zh/blog'],
  [website + '/blog/how-to-do-a-subscription-audit', 200, 'https://steadyrenew.com/blog/how-to-do-a-subscription-audit'],
  [website + '/sitemap.xml', 200, 'https://steadyrenew.com/'],
  [website + '/robots.txt', 200, 'https://steadyrenew.com/sitemap.xml'],
  [app + '/app', 200, 'SteadyRenew'],
  [app + '/pricing', 200, 'SteadyRenew'],
  [app + '/agent/setup.md', 200, 'SUBSCRIPTION_MANAGER_BASE_URL'],
  [app + '/agent/openapi.yaml', 200, 'openapi:'],
  [app + '/api/v1/subscriptions', 401, 'error'],
  [app + '/.netlify/functions/stripe-webhook', 405, null],
  ...(docs ? [[docs + '/en', 200, null], [docs + '/zh-CN', 200, null]] : []),
  ...(!origin ? [
    ...manifest.legacyApplicationOrigins.map(legacy => [legacy + '/', 200, 'SteadyRenew']),
    ['https://sub.jerrylu.xyz/blog', 301, null, website + '/blog'],
    ['https://sub.jerrylu.xyz/blog/how-to-do-a-subscription-audit', 301, null, website + '/blog/how-to-do-a-subscription-audit'],
    ['https://sub.jerrylu.xyz/zh/blog/how-to-cancel-auto-renew', 301, null, website + '/zh/blog/how-to-cancel-auto-renew'],
    ['https://www.steadyrenew.com/', 301, null, website + '/'],
    [manifest.applicationAliasOrigin + '/', 301, null, manifest.applicationUrl],
    [manifest.applicationAliasOrigin + '/pricing', 301, null, app + '/pricing'],
  ] : []),
];
const results = await Promise.all(checks.map(async ([url, expectedStatus, text, location]) => {
  try {
    // Check domain roots and migration redirects directly. Content pages may
    // legitimately normalize trailing slashes before returning their HTML.
    const redirect = expectedStatus === 301 || new URL(url).pathname === '/' ? 'manual' : 'follow';
    const response = await fetch(url, { redirect, signal: AbortSignal.timeout(15000) });
    const body = text ? await response.text() : '';
    const actualLocation = response.headers.get('location');
    return { url, status: response.status, ...(actualLocation ? { location: actualLocation } : {}), passed: response.status === expectedStatus && (!text || body.includes(text)) && (!location || actualLocation === location) };
  } catch (error) { return { url, passed: false, error: error.cause?.code ?? error.name }; }
}));
results.forEach(result => console.log(JSON.stringify(result)));
process.exitCode = results.every(result => result.passed) ? 0 : 1;
