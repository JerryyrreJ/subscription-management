import { escapeHtml, type FaqItem } from './markdown.ts';
import type { BlogPost } from './posts.ts';
import {
  BLOG_INDEX_DESCRIPTION,
  BLOG_INDEX_TITLE,
  BLOG_PATH,
  CANONICAL_ORIGIN,
  SITE_NAME,
  ZH_BLOG_INDEX_DESCRIPTION,
  ZH_BLOG_INDEX_TITLE,
  ZH_BLOG_PATH,
  blogPath,
  canonicalUrl,
  isZhLang,
  postCanonicalUrl,
  postPath,
} from './site.ts';

type BlogUiLang = 'en' | 'zh';

type BlogUiCopy = {
  skip: string;
  guides: string;
  openApp: string;
  openAppFooter: string;
  footerNote: string;
  indexEyebrow: string;
  indexTitle: string;
  indexDescription: string;
  otherLangLabel: string;
  otherLangHref: string;
  draftBanner: string;
};

function uiLang(lang?: string | null): BlogUiLang {
  return isZhLang(lang) ? 'zh' : 'en';
}

function uiCopy(lang?: string | null): BlogUiCopy {
  const host = CANONICAL_ORIGIN.replace('https://', '');
  if (uiLang(lang) === 'zh') {
    return {
      skip: '跳到正文',
      guides: '指南',
      openApp: '打开应用',
      openAppFooter: `打开 ${SITE_NAME}`,
      footerNote: `个人订阅追踪——取消订阅仍由你在各平台操作。站点：${host}`,
      indexEyebrow: '指南',
      indexTitle: '该留的留，该关的关，不用绑银行卡',
      indexDescription: ZH_BLOG_INDEX_DESCRIPTION,
      otherLangLabel: 'English guides',
      otherLangHref: BLOG_PATH,
      draftBanner:
        '<p class="draft-banner" role="note"><strong>草稿提纲。</strong> 此 URL 已公开可抓取，方便指南中心上线。下面的清单按「盘点 → 保留 / 取消 / 提醒」可独立使用。完稿后替换本文件，slug 保持不变。</p>',
    };
  }

  return {
    skip: 'Skip to content',
    guides: 'Guides',
    openApp: 'Open app',
    openAppFooter: `Open ${SITE_NAME}`,
    footerNote: `Personal subscription tracker — you stay in control of cancels. Canonical site: ${host}`,
    indexEyebrow: 'Guides',
    indexTitle: 'Keep / cancel / remind, without linking a bank',
    indexDescription: BLOG_INDEX_DESCRIPTION,
    otherLangLabel: '中文指南',
    otherLangHref: ZH_BLOG_PATH,
    draftBanner:
      '<p class="draft-banner" role="note"><strong>Draft outline.</strong> This URL is public and crawlable so the guide hub can ship. The checklist below follows the writer brief (inventory → keep / cancel / remind) and is usable on its own. Replace this file when the finished draft is ready; the slug stays the same.</p>',
  };
}

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function formatDate(isoDate: string, lang?: string | null): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat(uiLang(lang) === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function layout(options: {
  title: string;
  description: string;
  canonical: string;
  lang?: string;
  type?: 'website' | 'article';
  jsonLd?: unknown[];
  bodyClass?: string;
  content: string;
}): string {
  const lang = options.lang ?? 'en';
  const type = options.type ?? 'website';
  const copy = uiCopy(lang);
  const guidesHref = blogPath(lang);
  const jsonLdBlocks = (options.jsonLd ?? [])
    .map(block => `<script type="application/ld+json">${jsonLd(block)}</script>`)
    .join('\n    ');

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(options.title)}</title>
    <meta name="description" content="${escapeHtml(options.description)}" />
    <link rel="canonical" href="${escapeHtml(options.canonical)}" />
    <meta name="robots" content="index,follow" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${escapeHtml(options.title)}" />
    <meta property="og:description" content="${escapeHtml(options.description)}" />
    <meta property="og:url" content="${escapeHtml(options.canonical)}" />
    <meta property="og:image" content="${escapeHtml(`${CANONICAL_ORIGIN}/icon.png`)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(options.title)}" />
    <meta name="twitter:description" content="${escapeHtml(options.description)}" />
    <link rel="icon" type="image/png" href="/icon.png" />
    <link rel="stylesheet" href="/blog.css" />
    ${jsonLdBlocks}
  </head>
  <body class="${options.bodyClass ?? 'blog-body'}">
    <a class="skip-link" href="#content">${escapeHtml(copy.skip)}</a>
    <header class="site-header">
      <a class="brand" href="/">
        <img src="/icon.png" alt="" width="32" height="32" />
        <span>${escapeHtml(SITE_NAME)}</span>
      </a>
      <nav aria-label="${escapeHtml(copy.guides)}">
        <a href="${guidesHref}"${options.canonical === canonicalUrl(guidesHref) ? ' aria-current="page"' : ''}>${escapeHtml(copy.guides)}</a>
        <a class="button" href="/">${escapeHtml(copy.openApp)}</a>
      </nav>
    </header>
    <main id="content">
      ${options.content}
    </main>
    <footer class="site-footer">
      <p><a href="${guidesHref}">${escapeHtml(copy.guides)}</a> · <a href="/">${escapeHtml(copy.openAppFooter)}</a></p>
      <p class="muted">${escapeHtml(copy.footerNote)}</p>
    </footer>
  </body>
</html>
`;
}

export function renderBlogIndex(posts: BlogPost[], lang: string = 'en'): string {
  const copy = uiCopy(lang);
  const indexPath = blogPath(lang);
  const canonical = canonicalUrl(indexPath);
  const pageTitle = uiLang(lang) === 'zh' ? ZH_BLOG_INDEX_TITLE : BLOG_INDEX_TITLE;
  const items = posts
    .map(post => {
      const href = postPath(post.slug, post.lang);
      const badge = post.status === 'draft'
        ? `<span class="badge">${uiLang(lang) === 'zh' ? '草稿提纲' : 'Draft outline'}</span>`
        : '';
      return `<li>
        <article class="post-card">
          <p class="meta">${escapeHtml(formatDate(post.date, lang))}${badge}</p>
          <h2><a href="${href}">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.description)}</p>
        </article>
      </li>`;
    })
    .join('\n');

  return layout({
    title: `${pageTitle} · ${SITE_NAME}`,
    description: copy.indexDescription,
    canonical,
    lang: uiLang(lang),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${pageTitle} · ${SITE_NAME}`,
        description: copy.indexDescription,
        inLanguage: uiLang(lang),
        url: canonical,
        isPartOf: {
          '@type': 'WebSite',
          name: SITE_NAME,
          url: `${CANONICAL_ORIGIN}/`,
        },
      },
    ],
    content: `
      <header class="page-header">
        <p class="eyebrow">${escapeHtml(copy.indexEyebrow)}</p>
        <h1>${escapeHtml(copy.indexTitle)}</h1>
        <p class="lede">${escapeHtml(copy.indexDescription)}</p>
        <p class="muted"><a href="${copy.otherLangHref}">${escapeHtml(copy.otherLangLabel)}</a></p>
      </header>
      <ol class="post-list">
        ${items}
      </ol>
    `,
  });
}

function faqJsonLd(canonical: string, faqs: FaqItem[]): Record<string, unknown> | null {
  if (faqs.length === 0) {
    return null;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
    url: canonical,
  };
}

export function renderBlogPost(post: BlogPost): string {
  const canonical = postCanonicalUrl(post.slug, post.lang);
  const copy = uiCopy(post.lang);
  const indexPath = blogPath(post.lang);
  const draftNotice = post.status === 'draft' ? copy.draftBanner : '';

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.updated ?? post.date,
      inLanguage: post.lang,
      mainEntityOfPage: canonical,
      author: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: `${CANONICAL_ORIGIN}/`,
      },
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: `${CANONICAL_ORIGIN}/`,
      },
    },
    faqJsonLd(canonical, post.faqs),
  ].filter((block): block is Record<string, unknown> => Boolean(block));

  return layout({
    title: `${post.title} · ${SITE_NAME}`,
    description: post.description,
    canonical,
    lang: post.lang,
    type: 'article',
    jsonLd,
    bodyClass: 'blog-body article-body',
    content: `
      <article class="article">
        <header class="page-header">
          <p class="eyebrow"><a href="${indexPath}">${escapeHtml(copy.guides)}</a> · ${escapeHtml(formatDate(post.date, post.lang))}</p>
          <h1>${escapeHtml(post.title)}</h1>
          <p class="lede">${escapeHtml(post.description)}</p>
          ${draftNotice}
        </header>
        <div class="prose">
          ${post.bodyHtml}
        </div>
      </article>
    `,
  });
}

export function renderRobotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml
`;
}

export function renderSitemap(posts: BlogPost[], generatedAt: string = new Date().toISOString().slice(0, 10)): string {
  const urls = [
    { loc: canonicalUrl('/'), lastmod: generatedAt },
    { loc: canonicalUrl(BLOG_PATH), lastmod: generatedAt },
    { loc: canonicalUrl(ZH_BLOG_PATH), lastmod: generatedAt },
    ...posts.map(post => ({
      loc: postCanonicalUrl(post.slug, post.lang),
      lastmod: post.updated ?? post.date,
    })),
  ];

  const entries = urls
    .map(url => `  <url>
    <loc>${escapeHtml(url.loc)}</loc>
    <lastmod>${escapeHtml(url.lastmod)}</lastmod>
  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}
