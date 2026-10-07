import { APPLICATION_ORIGIN, isLegacyApplicationOrigin } from './siteUrls';

/** Keep existing payment and authentication return links in the application. */
export function isApplicationEntry(url: URL, appUrl = '/app'): boolean {
  if (url.pathname !== '/') return true;
  if (url.origin === APPLICATION_ORIGIN || isLegacyApplicationOrigin(url.origin)) return true;

  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.slice(1));
  if (
    [
      'payment',
      'session_id',
      'code',
      'auth',
      'error',
      'error_description',
    ].some((key) => query.has(key)) ||
    [
      'access_token',
      'refresh_token',
      'type',
      'error',
      'error_description',
    ].some((key) => hash.has(key))
  ) {
    return true;
  }

  // One build can serve the marketing domain and a dedicated app subdomain.
  const destination = new URL(appUrl, url.origin);
  return destination.origin === url.origin && destination.pathname === '/';
}

export function resolveAppUrl(value?: string): string {
  const candidate = value?.trim();
  if (!candidate) return '/app';
  if (candidate.startsWith('/') && !candidate.startsWith('//'))
    return candidate;
  const url = new URL(candidate);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('VITE_APP_URL must be an HTTP(S) URL or an absolute path.');
  }
  return url.toString();
}
