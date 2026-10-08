import type { Config, Context } from '@netlify/edge-functions';

const upstreamOrigin = 'https://subscriptionmanager.mintlify.site';
const isDocsPath = (path: string) => path === '/docs' || path.startsWith('/docs/') || path.startsWith('/.well-known/vercel/');

/** Public documentation only; application routes and credentials stay on Netlify. */
export default async function docsProxy(request: Request, context: Pick<Context, 'next' | 'ip'>): Promise<Response> {
  const incoming = new URL(request.url);
  if (!isDocsPath(incoming.pathname)) return context.next();

  const target = new URL(upstreamOrigin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  for (const name of ['host', 'cookie', 'authorization', 'connection', 'content-length']) headers.delete(name);
  headers.set('Origin', upstreamOrigin);
  headers.set('X-Forwarded-Host', incoming.host);
  headers.set('X-Forwarded-Proto', incoming.protocol.slice(0, -1));
  headers.set('X-Forwarded-For', context.ip);
  headers.set('X-Real-IP', context.ip);

  try {
    const upstream = await fetch(new Request(target, new Request(request, { headers })), {
      redirect: 'manual',
    });
    const responseHeaders = new Headers(upstream.headers);
    const location = responseHeaders.get('location');
    if (location) {
      const redirect = new URL(location, target);
      if (redirect.origin === upstreamOrigin && isDocsPath(redirect.pathname)) {
        responseHeaders.set('Location', `${redirect.pathname}${redirect.search}${redirect.hash}`);
      }
    }
    // These public docs do not need to set cookies on the application's domain.
    responseHeaders.delete('set-cookie');
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('CDN-Cache-Control', 'no-store');
    responseHeaders.set('Netlify-CDN-Cache-Control', 'no-store');
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    // Never fall through to the app shell when the documentation origin is down.
    return new Response('Documentation is temporarily unavailable. Please try again shortly.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

// Edge functions run before the SPA fallback; preserve all HTTP methods, including analytics POSTs.
export const config: Config = { path: ['/docs', '/docs/*', '/.well-known/vercel/*'] };
