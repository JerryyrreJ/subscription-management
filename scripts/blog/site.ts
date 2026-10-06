export const CANONICAL_ORIGIN = 'https://sub.jerrylu.xyz';
export const SITE_NAME = 'Subscription Manager';
export const BLOG_PATH = '/blog';
export const ZH_BLOG_PATH = '/zh/blog';
export const BLOG_INDEX_TITLE = 'Guides';
export const BLOG_INDEX_DESCRIPTION =
  'Guides to finding recurring charges, canceling unused subscriptions, and keeping track of renewal dates.';
export const ZH_BLOG_INDEX_TITLE = '指南';
export const ZH_BLOG_INDEX_DESCRIPTION =
  '从账单和支付平台查找订阅，取消不用的服务，记录下次扣款日期。';

export function isZhLang(lang?: string | null): boolean {
  return Boolean(lang && lang.trim().toLowerCase().startsWith('zh'));
}

export function blogPath(lang?: string | null): string {
  return isZhLang(lang) ? ZH_BLOG_PATH : BLOG_PATH;
}

export function canonicalUrl(pathname: string): string {
  if (pathname === '/') {
    return `${CANONICAL_ORIGIN}/`;
  }

  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${CANONICAL_ORIGIN}${normalized.replace(/\/+$/, '')}`;
}

export function postPath(slug: string, lang?: string | null): string {
  return `${blogPath(lang)}/${slug}`;
}

export function postCanonicalUrl(slug: string, lang?: string | null): string {
  return canonicalUrl(postPath(slug, lang));
}

export function postOutputPath(slug: string, lang?: string | null): string {
  return `${postPath(slug, lang).replace(/^\//, '')}/index.html`;
}

export function isCanonicalHost(url: string): boolean {
  return url.startsWith(`${CANONICAL_ORIGIN}/`) || url === CANONICAL_ORIGIN;
}
