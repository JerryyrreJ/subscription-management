export const CANONICAL_ORIGIN = 'https://sub.jerrylu.xyz';
export const SITE_NAME = 'Subscription Manager';
export const BLOG_PATH = '/blog';
export const BLOG_INDEX_TITLE = 'Guides';
export const BLOG_INDEX_DESCRIPTION =
  'Practical guides for finding, reviewing, and tracking personal subscriptions — without linking your bank.';

export function canonicalUrl(pathname: string): string {
  if (pathname === '/') {
    return `${CANONICAL_ORIGIN}/`;
  }

  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${CANONICAL_ORIGIN}${normalized.replace(/\/+$/, '')}`;
}

export function postPath(slug: string): string {
  return `${BLOG_PATH}/${slug}`;
}

export function postCanonicalUrl(slug: string): string {
  return canonicalUrl(postPath(slug));
}

export function isCanonicalHost(url: string): boolean {
  return url.startsWith(`${CANONICAL_ORIGIN}/`) || url === CANONICAL_ORIGIN;
}
