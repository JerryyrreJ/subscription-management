import type { Config, Context } from '@netlify/edge-functions';
import { applicationEntryCookie, prefersApplication } from '../../src/utils/entryPreference.ts';
import { hasApplicationCallback } from '../../src/utils/siteRouting.ts';

const applicationPaths = new Set(['/app', '/app/', '/pricing', '/pricing/']);
const entryPaths = new Set(['/', '/about', '/about/', ...applicationPaths]);

function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Netlify-CDN-Cache-Control', 'no-store');
  const vary = headers.get('Vary');
  if (!vary?.split(',').some(value => ['cookie', '*'].includes(value.trim().toLowerCase()))) {
    headers.set('Vary', vary ? `${vary}, Cookie` : 'Cookie');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default async function smartEntry(request: Request, context: Pick<Context, 'next'>): Promise<Response> {
  const url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method) || !entryPaths.has(url.pathname)) return context.next();

  if (url.pathname === '/' && (
    prefersApplication(request.headers.get('cookie') ?? '') || hasApplicationCallback(url)
  )) {
    // Same-origin only. Leaving the fragment absent preserves browser auth fragments.
    return privateResponse(new Response(null, {
      status: 307,
      headers: { Location: `/app${url.search}` },
    }));
  }

  const response = privateResponse(await context.next());
  const speculative = /prefetch|prerender/i.test([
    request.headers.get('purpose'), request.headers.get('sec-purpose'),
  ].join(' '));
  if (request.method === 'GET' && applicationPaths.has(url.pathname) && response.ok &&
    response.headers.get('content-type')?.includes('text/html') && !speculative) {
    response.headers.append('Set-Cookie', applicationEntryCookie(url.protocol));
  }
  return response;
}

// Run before the CDN cache; never opt this personalized routing into edge caching.
export const config: Config = {
  path: ['/', '/app', '/app/', '/pricing', '/pricing/', '/about', '/about/'],
};
