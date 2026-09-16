export const CANONICAL_ORIGIN = 'https://sub.jerrylu.xyz';
export const SITE_NAME = 'Subscription Manager';
export const BLOG_PATH = '/blog';
export const ZH_BLOG_PATH = '/zh/blog';
export const BLOG_INDEX_TITLE = 'Guides';
export const BLOG_INDEX_DESCRIPTION =
  'Practical guides for finding, reviewing, and tracking personal subscriptions — without linking your bank.';
export const ZH_BLOG_INDEX_TITLE = '指南';
export const ZH_BLOG_INDEX_DESCRIPTION =
  '按扣款渠道盘点、关掉用不到的自动续费，并记下还要留的订阅——不用绑定银行卡。';

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
