import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';

// Retain the independently testable handlers while exposing the Request/Response
// entrypoint used by current Netlify Functions. Preserve webhook bytes as text.
export const webHandler = (handler: Handler) => async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const event: HandlerEvent = {
    rawUrl: request.url,
    rawQuery: url.search.slice(1),
    path: url.pathname,
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers),
    multiValueHeaders: {},
    queryStringParameters: Object.fromEntries(url.searchParams),
    multiValueQueryStringParameters: {},
    body: ['GET', 'HEAD'].includes(request.method) ? null : await request.text(),
    isBase64Encoded: false,
  };
  const result = await handler(event, {} as never) as HandlerResponse;
  const headers = new Headers();
  for (const [key, value] of Object.entries(result.headers ?? {})) {
    if (value !== undefined) headers.set(key, String(value));
  }
  for (const [key, values] of Object.entries(result.multiValueHeaders ?? {})) {
    for (const value of values) headers.append(key, String(value));
  }
  return new Response(result.statusCode === 204 ? null : result.body ?? null, {
    status: result.statusCode, headers,
  });
};

// Netlify.env is supplied by the Functions runtime; process.env supports local
// scripts and injected unit-test environments.
export const runtimeEnvironment: NodeJS.ProcessEnv = new Proxy({}, {
  get: (_target, key: string) => {
    const runtime = globalThis as typeof globalThis & { Netlify?: { env: { get(name: string): string | undefined } } };
    return runtime.Netlify?.env.get(key) ?? process.env[key];
  },
});
