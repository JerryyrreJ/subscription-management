import {
  escapeHtml,
  extractHeadings,
  type BlogCluster,
  type BlogCtaVariant,
  type FaqItem,
  type HeadingItem,
} from './markdown.ts';
import type { BlogPost } from './posts.ts';
import { STEADYRENEW_SAME_AS } from '../../src/utils/structuredData.ts';
import {
  BLOG_INDEX_DESCRIPTION,
  BLOG_INDEX_TITLE,
  BLOG_PATH,
  CANONICAL_ORIGIN,
  APP_ENTRY_URL,
  SITE_NAME,
  ZH_BLOG_INDEX_DESCRIPTION,
  ZH_BLOG_INDEX_TITLE,
  ZH_BLOG_PATH,
  blogPath,
  canonicalUrl,
  isZhLang,
  postCanonicalUrl,
  postPath,
  publicPath,
} from './site.ts';

const AUTHOR_NAME = 'Jerry Lu';
const AUTHOR_URL = 'https://github.com/JerryyrreJ';

type BlogUiLang = 'en' | 'zh';

type BlogUiCopy = {
  skip: string;
  home: string;
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
  breadcrumbLabel: string;
  authorPrefix: string;
  updatedPrefix: string;
  tocLabel: string;
  quickAnswerLabel: string;
};

function uiLang(lang?: string | null): BlogUiLang {
  return isZhLang(lang) ? 'zh' : 'en';
}

function defaultSocialImage(lang?: string | null): string {
  return `${CANONICAL_ORIGIN}/product-${isZhLang(lang) ? 'zh-CN' : 'en'}-light.jpg`;
}

function resolvePostImage(image?: string, lang?: string | null): string {
  if (!image) return defaultSocialImage(lang);
  if (/^https:\/\//i.test(image)) return image;
  const normalized = image.startsWith('/') ? image : `/${image}`;
  return `${CANONICAL_ORIGIN}${normalized}`;
}

function uiCopy(lang?: string | null): BlogUiCopy {
  const host = CANONICAL_ORIGIN.replace('https://', '');
  if (uiLang(lang) === 'zh') {
    return {
      skip: '跳到正文',
      home: '首页',
      guides: '指南',
      openApp: '打开应用',
      openAppFooter: `打开 ${SITE_NAME}`,
      footerNote: `记录订阅与续费日期。取消订阅请到对应平台操作。${host}`,
      indexEyebrow: '指南',
      indexTitle: '整理订阅，查清每一笔续费',
      indexDescription: ZH_BLOG_INDEX_DESCRIPTION,
      otherLangLabel: 'English guides',
      otherLangHref: BLOG_PATH,
      draftBanner:
        '<p class="draft-banner" role="note"><strong>草稿提纲。</strong> 本文仍在整理中，部分内容可能会调整。</p>',
      breadcrumbLabel: '页面导航',
      authorPrefix: '作者：',
      updatedPrefix: '更新于 ',
      tocLabel: '本文目录',
      quickAnswerLabel: '核心结论',
    };
  }

  return {
    skip: 'Skip to content',
    home: 'Home',
    guides: 'Guides',
    openApp: 'Open app',
    openAppFooter: `Open ${SITE_NAME}`,
    footerNote: `Track subscriptions and renewal dates. Cancel services with the provider. ${host}`,
    indexEyebrow: 'Guides',
    indexTitle: 'Find your subscriptions and plan for renewals',
    indexDescription: BLOG_INDEX_DESCRIPTION,
    otherLangLabel: '中文指南',
    otherLangHref: ZH_BLOG_PATH,
    draftBanner:
      '<p class="draft-banner" role="note"><strong>Draft outline.</strong> This article is still being written. Some details may change.</p>',
    breadcrumbLabel: 'Breadcrumb',
    authorPrefix: 'By ',
    updatedPrefix: 'Updated ',
    tocLabel: 'On this page',
    quickAnswerLabel: 'Quick answer',
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

export type LanguageAlternate = { hreflang: string; href: string };

export function languagePairAlternates(enHref: string, zhHref: string): LanguageAlternate[] {
  return [
    { hreflang: 'en', href: enHref },
    { hreflang: 'zh-CN', href: zhHref },
    { hreflang: 'x-default', href: enHref },
  ];
}

/** hreflang only when a published post shares the slug in the other language. */
export function postLanguageAlternates(post: BlogPost, posts: BlogPost[]): LanguageAlternate[] | null {
  if (post.status !== 'published') return null;
  const counterpart = posts.find(other =>
    other.slug === post.slug &&
    other.status === 'published' &&
    isZhLang(other.lang) !== isZhLang(post.lang)
  );
  if (!counterpart) return null;
  const en = isZhLang(post.lang) ? counterpart : post;
  const zh = isZhLang(post.lang) ? post : counterpart;
  return languagePairAlternates(
    postCanonicalUrl(en.slug, en.lang),
    postCanonicalUrl(zh.slug, zh.lang),
  );
}

function alternateLinks(alternates?: LanguageAlternate[] | null): string {
  if (!alternates?.length) return '';
  return alternates
    .map(item => `<link rel="alternate" hreflang="${escapeHtml(item.hreflang)}" href="${escapeHtml(item.href)}" />`)
    .join('\n    ');
}

function layout(options: {
  title: string;
  description: string;
  canonical: string;
  lang?: string;
  type?: 'website' | 'article';
  robots?: string;
  image?: string;
  jsonLd?: unknown[];
  alternates?: LanguageAlternate[] | null;
  bodyClass?: string;
  content: string;
}): string {
  const lang = options.lang ?? 'en';
  const type = options.type ?? 'website';
  const robots = options.robots ?? 'index,follow';
  const socialImage = options.image ?? defaultSocialImage(lang);
  const copy = uiCopy(lang);
  const guidesHref = publicPath(blogPath(lang));
  const homeHref = isZhLang(lang) ? '/zh/' : '/';
  const jsonLdBlocks = (options.jsonLd ?? [])
    .map(block => `<script type="application/ld+json">${jsonLd(block)}</script>`)
    .join('\n    ');

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="msvalidate.01" content="42D1BD359B3222254C205F07088F0FE9" />
    <title>${escapeHtml(options.title)}</title>
    <meta name="description" content="${escapeHtml(options.description)}" />
    <link rel="canonical" href="${escapeHtml(options.canonical)}" />
    ${alternateLinks(options.alternates)}
    <meta name="robots" content="${escapeHtml(robots)}" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${escapeHtml(options.title)}" />
    <meta property="og:description" content="${escapeHtml(options.description)}" />
    <meta property="og:url" content="${escapeHtml(options.canonical)}" />
    <meta property="og:image" content="${escapeHtml(socialImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(options.title)}" />
    <meta name="twitter:description" content="${escapeHtml(options.description)}" />
    <meta name="twitter:image" content="${escapeHtml(socialImage)}" />
    <link rel="icon" type="image/png" href="/icon.png" />
    <link rel="stylesheet" href="/blog.css" />
    ${jsonLdBlocks}
  </head>
  <body class="${options.bodyClass ?? 'blog-body'}">
    <a class="skip-link" href="#content">${escapeHtml(copy.skip)}</a>
    <header class="site-header">
      <a class="brand" href="${homeHref}">
        <img src="/icon.png" alt="" width="32" height="32" decoding="async" />
        <span>${escapeHtml(SITE_NAME)}</span>
      </a>
      <nav aria-label="${escapeHtml(copy.guides)}">
        <a href="${guidesHref}"${options.canonical === canonicalUrl(guidesHref) ? ' aria-current="page"' : ''}>${escapeHtml(copy.guides)}</a>
        <a class="button" href="${escapeHtml(APP_ENTRY_URL)}">${escapeHtml(copy.openApp)}</a>
      </nav>
    </header>
    <main id="content">
      ${options.content}
    </main>
    <footer class="site-footer">
      <p><a href="${guidesHref}">${escapeHtml(copy.guides)}</a> · <a href="${escapeHtml(APP_ENTRY_URL)}">${escapeHtml(copy.openAppFooter)}</a></p>
      <p class="muted">${escapeHtml(copy.footerNote)}</p>
    </footer>
  </body>
</html>
`;
}

function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function renderBlogIndex(posts: BlogPost[], lang: string = 'en'): string {
  const copy = uiCopy(lang);
  const indexPath = blogPath(lang);
  const canonical = canonicalUrl(indexPath);
  const homeCanonical = isZhLang(lang) ? canonicalUrl('/zh') : canonicalUrl('/');
  const pageTitle = uiLang(lang) === 'zh' ? ZH_BLOG_INDEX_TITLE : BLOG_INDEX_TITLE;
  const items = posts
    .map(post => {
      const href = publicPath(postPath(post.slug, post.lang));
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
    alternates: languagePairAlternates(canonicalUrl(BLOG_PATH), canonicalUrl(ZH_BLOG_PATH)),
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
      breadcrumbJsonLd([
        { name: copy.home, url: homeCanonical },
        { name: copy.guides, url: canonical },
      ]),
    ],
    content: `
      <header class="page-header">
        <p class="eyebrow">${escapeHtml(copy.indexEyebrow)}</p>
        <h1>${escapeHtml(copy.indexTitle)}</h1>
        <p class="lede">${escapeHtml(copy.indexDescription)}</p>
        <p class="muted"><a href="${publicPath(copy.otherLangHref)}">${escapeHtml(copy.otherLangLabel)}</a></p>
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

function appEntryWithRef(ref: string): string {
  const [base, hash] = APP_ENTRY_URL.split('#');
  const separator = base.includes('?') ? '&' : '?';
  const suffix = hash !== undefined ? `#${hash}` : '';
  return `${base}${separator}ref=${encodeURIComponent(ref)}${suffix}`;
}

function clusterToCta(cluster?: BlogCluster): Exclude<BlogCtaVariant, 'none'> {
  switch (cluster) {
    case 'trials-refunds':
      return 'trial';
    case 'no-bank-alternatives':
      return 'alternative';
    case 'multi-currency-ai':
      return 'multi-currency';
    case 'mcp-automation':
      return 'mcp';
    case 'audit-cleanup':
    default:
      return 'audit';
  }
}

type CtaTemplate = {
  eyebrow: string;
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

function getCtaTemplate(variant: Exclude<BlogCtaVariant, 'none'>, lang: BlogUiLang): CtaTemplate {
  if (lang === 'zh') {
    switch (variant) {
      case 'trial':
        return {
          eyebrow: '免费试用防忘提醒',
          title: '开试用当天顺手记一笔，别等到扣完年费才想起来',
          body: '支持文字或截图草稿录入，无需绑银行卡或强制注册。登录并配置 Bark 后，可在免费试用结束前 2–3 天收到提醒（不会代为向平台申请退款或自动退订）。',
          primaryLabel: '记下试用截止日',
        };
      case 'alternative':
        return {
          eyebrow: '免绑银行卡 · 拒绝订阅套娃',
          title: '在浏览器里管理全部订阅，不必再多付一份月费',
          body: '默认本地保存、不连接银行账户。免费版（$0）即含不限订阅、多设备同步、Bark 提醒、JSON 备份与每月 10 次 AI 录入；需要每月 300 次 AI 录入与 A4 PDF 报表，可一次买断（$9 USD）。',
          primaryLabel: '免费打开使用',
          secondaryLabel: '查看免费版与 $9 买断对比',
          secondaryHref: '/zh/pricing/',
        };
      case 'multi-currency':
        return {
          eyebrow: '多币种换算与截图录入',
          title: '把美元、日元、港币和人民币订阅折算到同一张账单里',
          body: '保留每笔服务原本的计费币种与金额，同时换算为常用币种月度总开销。支持截图或一句话 AI 提取草稿、核对后保存，全程不连接银行卡。',
          primaryLabel: '开始汇总海外订阅',
          secondaryLabel: '查看免费版与 $9 买断对比',
          secondaryHref: '/zh/pricing/',
        };
      case 'mcp':
        return {
          eyebrow: '免费版即含 API 与 MCP',
          title: '把你的订阅清单接入 Claude、ChatGPT 或 Cursor',
          body: '在应用内生成只读或读写 API Key，通过远程 Streamable HTTP（/api/mcp）或本地脚本即可查询近期续费与各币种开销。',
          primaryLabel: '前往应用获取 API Key',
          secondaryLabel: '查看 MCP 接入文档',
          secondaryHref: '/docs/zh-CN/user-guide/agent-setup',
        };
      case 'audit':
      default:
        return {
          eyebrow: 'STEADYRENEW · 本地优先订阅管理',
          title: '把盘点好的订阅留在一个地方，到期前收到提醒',
          body: '无需注册，也不关联银行账户，打开浏览器就能记录续费日期并接入 Bark 推送。免费版支持不限订阅数、多币种汇总与 JSON 导入导出。',
          primaryLabel: '打开 SteadyRenew',
        };
    }
  }

  switch (variant) {
    case 'trial':
      return {
        eyebrow: 'CATCH FREE TRIALS EARLY',
        title: 'Track the trial end date the minute you sign up',
        body: 'Log a 7-day or 30-day trial by typing a note or uploading a screenshot—SteadyRenew stays local in your browser by default and reminds you via Bark before billing hits. It does not cancel subscriptions for you.',
        primaryLabel: 'Log a free trial',
      };
    case 'alternative':
      return {
        eyebrow: 'NO BANK LOGIN · ONE-TIME UPGRADE',
        title: 'Try a browser-first tracker without Plaid or another monthly bill',
        body: 'Start locally with no sign-up, export clean JSON anytime, and pay $0 for unlimited tracking, cloud sync, Bark alerts, and 10 monthly AI captures. Need 300 AI captures and printable A4 PDFs? Premium is $9 once.',
        primaryLabel: 'Start tracking free',
        secondaryLabel: 'Compare Free & $9 Lifetime',
        secondaryHref: '/pricing/',
      };
    case 'multi-currency':
      return {
        eyebrow: 'MULTI-CURRENCY & SCREENSHOT CAPTURE',
        title: 'See USD, EUR, JPY, and CNY subscriptions in one converted monthly total',
        body: 'Keep each bill in its original currency while tracking a single converted total. Paste a billing snippet or screenshot to draft an entry, verify the numbers, and save with no bank login.',
        primaryLabel: 'Track multi-currency bills',
        secondaryLabel: 'Compare Free & $9 Lifetime',
        secondaryHref: '/pricing/',
      };
    case 'mcp':
      return {
        eyebrow: 'REST API & MCP INCLUDED IN FREE',
        title: 'Query upcoming renewals straight from Claude, ChatGPT, or Cursor',
        body: 'Generate a scoped API key in SteadyRenew, connect via remote Streamable HTTP (/api/mcp) or local stdio, and inspect spending or upcoming trials without exposing bank credentials.',
        primaryLabel: 'Open API & MCP setup',
        secondaryLabel: 'Read MCP setup docs',
        secondaryHref: '/docs/en/user-guide/agent-setup',
      };
    case 'audit':
    default:
      return {
        eyebrow: 'STEADYRENEW · LOCAL-FIRST TRACKER',
        title: 'Keep your subscription list where it reminds you',
        body: 'Start logging renewals directly in your browser with no account and no bank login. Free includes unlimited subscriptions, multi-currency totals, JSON export, and Bark reminders.',
        primaryLabel: 'Open SteadyRenew',
      };
  }
}

export function renderPostCta(post: BlogPost): string {
  const variant = post.cta ?? clusterToCta(post.cluster);
  if (variant === 'none') return '';

  const lang = uiLang(post.lang);
  const template = getCtaTemplate(variant, lang);
  const ref = `${isZhLang(post.lang) ? 'zh-blog-' : 'blog-'}${post.slug}`;
  const appHref = appEntryWithRef(ref);
  const secondary =
    template.secondaryLabel && template.secondaryHref
      ? `<a class="cta-secondary" href="${escapeHtml(template.secondaryHref)}">${escapeHtml(template.secondaryLabel)}</a>`
      : '';

  return `<aside class="cta" aria-label="${escapeHtml(template.title)}">
  <p class="cta-eyebrow">${escapeHtml(template.eyebrow)}</p>
  <p class="cta-title"><strong>${escapeHtml(template.title)}</strong></p>
  <p>${escapeHtml(template.body)}</p>
  <div class="cta-actions">
    <a class="button" href="${escapeHtml(appHref)}">${escapeHtml(template.primaryLabel)}</a>
    ${secondary}
  </div>
</aside>`;
}

function injectCtaBeforeFaq(bodyHtml: string, ctaHtml: string): string {
  if (!ctaHtml) return bodyHtml;
  const faqMatch = bodyHtml.match(/<h2 id="(?:faq|常见问题)">/i);
  if (faqMatch && faqMatch.index !== undefined) {
    return `${bodyHtml.slice(0, faqMatch.index)}${ctaHtml}\n${bodyHtml.slice(faqMatch.index)}`;
  }
  return `${bodyHtml}\n${ctaHtml}`;
}

function isSlugAlreadyLinked(bodyHtml: string, slug: string): boolean {
  return (
    bodyHtml.includes(`/${slug}/`) ||
    bodyHtml.includes(`/${slug}"`) ||
    bodyHtml.includes(`/${slug}'`)
  );
}

export function renderClusterRelated(post: BlogPost, allPosts: BlogPost[]): string {
  if (!allPosts.length) return '';
  const langIsZh = isZhLang(post.lang);
  const candidates = allPosts
    .filter(
      other =>
        other.status === 'published' &&
        other.slug !== post.slug &&
        isZhLang(other.lang) === langIsZh &&
        !isSlugAlreadyLinked(post.bodyHtml, other.slug)
    )
    .sort((left, right) => {
      const leftSameCluster = post.cluster && left.cluster === post.cluster ? 0 : 1;
      const rightSameCluster = post.cluster && right.cluster === post.cluster ? 0 : 1;
      if (leftSameCluster !== rightSameCluster) return leftSameCluster - rightSameCluster;
      if (left.date !== right.date) return right.date.localeCompare(left.date);
      return left.slug.localeCompare(right.slug);
    })
    .slice(0, 3);

  if (candidates.length === 0) return '';

  const heading = langIsZh ? '更多相关指南' : 'More guides in this topic';
  const items = candidates
    .map(other => {
      const href = publicPath(postPath(other.slug, other.lang));
      return `<li>
        <a href="${escapeHtml(href)}">
          <strong>${escapeHtml(other.title)}</strong>
          <span>${escapeHtml(other.description)}</span>
        </a>
      </li>`;
    })
    .join('\n');

  return `<nav class="related-cluster" aria-label="${escapeHtml(heading)}">
  <h2>${escapeHtml(heading)}</h2>
  <ul class="related-cluster-grid">
    ${items}
  </ul>
</nav>`;
}

export function renderToc(headings: HeadingItem[], label: string): string {
  if (headings.length < 3) {
    return '';
  }

  const items = headings
    .map(heading => `<li><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`)
    .join('\n    ');

  return `<nav class="toc" aria-label="${escapeHtml(label)}">
  <p class="toc-title">${escapeHtml(label)}</p>
  <ol>
    ${items}
  </ol>
</nav>`;
}

export function renderQuickAnswer(summary: string | undefined, label: string): string {
  const trimmed = summary?.trim();
  if (!trimmed) {
    return '';
  }

  return `<aside class="quick-answer" aria-label="${escapeHtml(label)}">
  <p class="quick-answer-label">${escapeHtml(label)}</p>
  <p>${escapeHtml(trimmed)}</p>
</aside>`;
}

export function renderBlogPost(
  post: BlogPost,
  alternates: LanguageAlternate[] | null = null,
  allPosts: BlogPost[] = []
): string {
  const canonical = postCanonicalUrl(post.slug, post.lang);
  const copy = uiCopy(post.lang);
  const homeHref = isZhLang(post.lang) ? '/zh/' : '/';
  const homeCanonical = isZhLang(post.lang) ? canonicalUrl('/zh') : canonicalUrl('/');
  const indexPath = publicPath(blogPath(post.lang));
  const indexCanonical = canonicalUrl(blogPath(post.lang));
  const draftNotice = post.status === 'draft' ? copy.draftBanner : '';
  const documentTitle = post.seoTitle?.trim() || post.title;
  const logoUrl = `${CANONICAL_ORIGIN}/icon.png`;
  const articleImage = resolvePostImage(post.image, post.lang);
  const bodyWithCta = injectCtaBeforeFaq(post.bodyHtml, renderPostCta(post));
  const clusterRelatedHtml = renderClusterRelated(post, allPosts);
  const tocHtml = renderToc(extractHeadings(post.bodyHtml), copy.tocLabel);
  const quickAnswerHtml = renderQuickAnswer(post.summary, copy.quickAnswerLabel);
  const updatedHtml =
    post.updated && post.updated !== post.date
      ? `<span aria-hidden="true">·</span><span>${escapeHtml(copy.updatedPrefix)}<time datetime="${escapeHtml(post.updated)}">${escapeHtml(formatDate(post.updated, post.lang))}</time></span>`
      : '';

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.description,
      url: canonical,
      image: articleImage,
      datePublished: post.date,
      dateModified: post.updated ?? post.date,
      inLanguage: post.lang,
      mainEntityOfPage: canonical,
      author: {
        '@type': 'Person',
        name: AUTHOR_NAME,
        url: AUTHOR_URL,
      },
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: `${CANONICAL_ORIGIN}/`,
        logo: {
          '@type': 'ImageObject',
          url: logoUrl,
        },
        sameAs: [...STEADYRENEW_SAME_AS],
      },
    },
    breadcrumbJsonLd([
      { name: copy.home, url: homeCanonical },
      { name: copy.guides, url: indexCanonical },
      { name: post.title, url: canonical },
    ]),
    faqJsonLd(canonical, post.faqs),
  ].filter((block): block is Record<string, unknown> => Boolean(block));

  return layout({
    title: `${documentTitle} · ${SITE_NAME}`,
    description: post.description,
    canonical,
    lang: post.lang,
    type: 'article',
    robots: post.status === 'published' ? 'index,follow' : 'noindex,follow',
    image: articleImage,
    jsonLd,
    alternates,
    bodyClass: 'blog-body article-body',
    content: `
      <article class="article">
        <header class="page-header">
          <nav class="breadcrumb" aria-label="${escapeHtml(copy.breadcrumbLabel)}">
            <a href="${homeHref}">${escapeHtml(copy.home)}</a>
            <span aria-hidden="true">/</span>
            <a href="${indexPath}">${escapeHtml(copy.guides)}</a>
          </nav>
          <h1>${escapeHtml(post.title)}</h1>
          <p class="lede">${escapeHtml(post.description)}</p>
          <p class="article-meta">
            <span>${escapeHtml(copy.authorPrefix)}<a href="${AUTHOR_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(AUTHOR_NAME)}</a></span>
            <span aria-hidden="true">·</span>
            <time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date, post.lang))}</time>
            ${updatedHtml}
          </p>
          ${draftNotice}
        </header>
        ${quickAnswerHtml}
        ${tocHtml}
        <div class="prose">
          ${bodyWithCta}
        </div>
        ${clusterRelatedHtml}
      </article>
    `,
  });
}

export function renderRobotsTxt(): string {
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /.netlify/

Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml
Sitemap: ${CANONICAL_ORIGIN}/docs/sitemap.xml
`;
}

export function renderSitemap(posts: BlogPost[], generatedAt: string = new Date().toISOString().slice(0, 10)): string {
  const publishedPosts = posts.filter(post => post.status === 'published');
  const enPosts = publishedPosts.filter(post => !isZhLang(post.lang));
  const zhPosts = publishedPosts.filter(post => isZhLang(post.lang));
  const latestLastmod = (items: BlogPost[]) =>
    items.reduce<string | undefined>((latest, post) => {
      const date = post.updated ?? post.date;
      return !latest || date > latest ? date : latest;
    }, undefined) ?? generatedAt;

  const urls = [
    { loc: canonicalUrl('/'), lastmod: undefined },
    { loc: canonicalUrl('/zh'), lastmod: undefined },
    { loc: canonicalUrl('/pricing'), lastmod: undefined },
    { loc: canonicalUrl('/zh/pricing'), lastmod: undefined },
    { loc: canonicalUrl(BLOG_PATH), lastmod: latestLastmod(enPosts) },
    { loc: canonicalUrl(ZH_BLOG_PATH), lastmod: latestLastmod(zhPosts) },
    ...publishedPosts.map(post => ({
      loc: postCanonicalUrl(post.slug, post.lang),
      lastmod: post.updated ?? post.date,
    })),
  ];

  const entries = urls
    .map(url => `  <url>
    <loc>${escapeHtml(url.loc)}</loc>${url.lastmod ? `\n    <lastmod>${escapeHtml(url.lastmod)}</lastmod>` : ''}
  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}
