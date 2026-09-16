import { escapeHtml, type FaqItem } from './markdown.ts';
import type { BlogPost } from './posts.ts';
import {
  BLOG_INDEX_DESCRIPTION,
  BLOG_INDEX_TITLE,
  BLOG_PATH,
  CANONICAL_ORIGIN,
  SITE_NAME,
  canonicalUrl,
  postCanonicalUrl,
  postPath,
} from './site.ts';

function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat('en', {
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
    <a class="skip-link" href="#content">Skip to content</a>
    <header class="site-header">
      <a class="brand" href="/">
        <img src="/icon.png" alt="" width="32" height="32" />
        <span>${escapeHtml(SITE_NAME)}</span>
      </a>
      <nav aria-label="Site">
        <a href="${BLOG_PATH}"${options.canonical === canonicalUrl(BLOG_PATH) ? ' aria-current="page"' : ''}>Guides</a>
        <a class="button" href="/">Open app</a>
      </nav>
    </header>
    <main id="content">
      ${options.content}
    </main>
    <footer class="site-footer">
      <p><a href="${BLOG_PATH}">Guides</a> · <a href="/">Open ${escapeHtml(SITE_NAME)}</a></p>
      <p class="muted">Personal subscription tracker — you stay in control of cancels. Canonical site: ${escapeHtml(CANONICAL_ORIGIN.replace('https://', ''))}</p>
    </footer>
  </body>
</html>
`;
}

export function renderBlogIndex(posts: BlogPost[]): string {
  const canonical = canonicalUrl(BLOG_PATH);
  const items = posts
    .map(post => {
      const href = postPath(post.slug);
      const badge = post.status === 'draft'
        ? '<span class="badge">Draft outline</span>'
        : '';
      return `<li>
        <article class="post-card">
          <p class="meta">${escapeHtml(formatDate(post.date))}${badge}</p>
          <h2><a href="${href}">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.description)}</p>
        </article>
      </li>`;
    })
    .join('\n');

  return layout({
    title: `${BLOG_INDEX_TITLE} · ${SITE_NAME}`,
    description: BLOG_INDEX_DESCRIPTION,
    canonical,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${BLOG_INDEX_TITLE} · ${SITE_NAME}`,
        description: BLOG_INDEX_DESCRIPTION,
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
        <p class="eyebrow">Guides</p>
        <h1>Keep / cancel / remind, without linking a bank</h1>
        <p class="lede">${escapeHtml(BLOG_INDEX_DESCRIPTION)}</p>
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
  const canonical = postCanonicalUrl(post.slug);
  const draftNotice = post.status === 'draft'
    ? `<p class="draft-banner" role="note"><strong>Draft outline.</strong> This URL is public and crawlable so the guide hub can ship. The checklist below follows the writer brief (inventory → keep / cancel / remind) and is usable on its own. Replace this file when the finished draft is ready; the slug stays the same.</p>`
    : '';

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
          <p class="eyebrow"><a href="${BLOG_PATH}">Guides</a> · ${escapeHtml(formatDate(post.date))}</p>
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
    ...posts.map(post => ({
      loc: postCanonicalUrl(post.slug),
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
