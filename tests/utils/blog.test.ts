import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFaqs, extractHeadings, markdownToHtml, parseFrontmatter, toFrontmatter } from '../../scripts/blog/markdown.ts';
import { buildPublicFiles } from '../../scripts/blog/generate.ts';
import {
  postLanguageAlternates,
  renderBlogPost,
  renderClusterRelated,
  renderPostCta,
  renderQuickAnswer,
  renderToc,
} from '../../scripts/blog/render.ts';
import type { BlogPost } from '../../scripts/blog/posts.ts';
import { loadPosts } from '../../scripts/blog/posts.ts';
import {
  BLOG_PATH,
  CANONICAL_ORIGIN,
  ZH_BLOG_PATH,
  canonicalUrl,
  isCanonicalHost,
  postCanonicalUrl,
  postOutputPath,
} from '../../scripts/blog/site.ts';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const firstPostPath = path.join(rootDir, 'content/blog/how-to-do-a-subscription-audit.md');
const zhPostPath = path.join(rootDir, 'content/blog/how-to-cancel-auto-renew.md');

test('canonical URLs always use the custom domain, not a Netlify alias', () => {
  assert.equal(CANONICAL_ORIGIN, 'https://steadyrenew.com');
  assert.equal(canonicalUrl('/'), 'https://steadyrenew.com/');
  assert.equal(canonicalUrl(BLOG_PATH), 'https://steadyrenew.com/blog/');
  assert.equal(canonicalUrl(ZH_BLOG_PATH), 'https://steadyrenew.com/zh/blog/');
  assert.equal(
    postCanonicalUrl('how-to-do-a-subscription-audit'),
    'https://steadyrenew.com/blog/how-to-do-a-subscription-audit/'
  );
  assert.equal(
    postCanonicalUrl('how-to-cancel-auto-renew', 'zh'),
    'https://steadyrenew.com/zh/blog/how-to-cancel-auto-renew/'
  );
  assert.equal(
    postOutputPath('how-to-cancel-auto-renew', 'zh'),
    'zh/blog/how-to-cancel-auto-renew/index.html'
  );
  assert.equal(isCanonicalHost('https://something.netlify.app/blog'), false);
});

test('markdown frontmatter, tables, links, and FAQ extraction work', () => {
  const parsed = parseFrontmatter(`---
title: Example
slug: example-post
description: Desc
date: 2026-09-16
status: draft
---

## FAQ

### Question one?

Short answer one.

### Question two?

Short answer two.
`);
  const frontmatter = toFrontmatter(parsed.data);
  assert.equal(frontmatter.slug, 'example-post');
  assert.equal(frontmatter.status, 'draft');

  const html = markdownToHtml(`## Heading

A [link](https://example.com), an [internal](https://steadyrenew.com/blog/), and **bold**.

\`\`\`json
{"a": 1}
\`\`\`

| Col | Value |
| --- | --- |
| A | B |

## FAQ

### Example question?

Example answer.
`);
  assert.match(html, /<h2 id="heading">Heading<\/h2>/);
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">link<\/a>/);
  assert.match(html, /<a href="https:\/\/steadyrenew.com\/blog\/">internal<\/a>/);
  assert.match(html, /<pre><code>\{&quot;a&quot;: 1\}<\/code><\/pre>/);
  assert.match(html, /<table>/);
  assert.match(html, /<td>B<\/td>/);

  const faqs = extractFaqs(html);
  assert.equal(faqs.length, 1);
  assert.equal(faqs[0]?.question, 'Example question?');
});

test('Chinese headings keep usable ids instead of stripping to empty', () => {
  const html = markdownToHtml('## 微信：自动续费 / 扣费服务\n\n#### 子步骤\n\n#hashtag line\n');
  assert.match(html, /<h2 id="微信自动续费-扣费服务">/);
  assert.match(html, /<h4 id="子步骤">子步骤<\/h4>/);
  assert.match(html, /<p>#hashtag line<\/p>/);
  assert.doesNotMatch(html, /id=""/);
});

test('public blog files list app and posts under the canonical host', () => {
  const posts = loadPosts(rootDir);
  const files = Object.fromEntries(
    buildPublicFiles(posts, '2026-09-16').map(file => [file.filePath, file.contents])
  );

  const first = posts.find(post => post.slug === 'how-to-do-a-subscription-audit');
  assert.ok(first);
  assert.equal(first.status, 'published');
  assert.ok(first.faqs.length >= 8);

  const zhPost = posts.find(post => post.slug === 'how-to-cancel-auto-renew');
  assert.ok(zhPost);
  assert.equal(zhPost.status, 'published');
  assert.equal(zhPost.lang, 'zh');
  assert.match(zhPost.title, /^自动扣费在哪里看、怎么关/);
  assert.equal(zhPost.seoTitle, '微信/支付宝/Apple/Google 自动扣费怎么关？入口速查');
  assert.equal(zhPost.date, '2026-09-16');
  assert.equal(zhPost.updated, '2026-11-12');
  assert.ok(zhPost.faqs.length >= 3);

  const index = files['blog/index.html'];
  const zhIndex = files['zh/blog/index.html'];
  const article = files['blog/how-to-do-a-subscription-audit/index.html'];
  const zhArticle = files['zh/blog/how-to-cancel-auto-renew/index.html'];
  const sitemap = files['sitemap.xml'];
  const robots = files['robots.txt'];

  assert.ok(index);
  assert.ok(zhIndex);
  assert.ok(article);
  assert.ok(zhArticle);
  assert.ok(sitemap);
  assert.ok(robots);

  assert.equal(files['blog/how-to-cancel-auto-renew/index.html'], undefined);

  assert.match(index, /rel="canonical" href="https:\/\/steadyrenew.com\/blog\/"/);
  assert.match(zhIndex, /rel="canonical" href="https:\/\/steadyrenew.com\/zh\/blog\/"/);
  assert.match(
    article,
    /rel="canonical" href="https:\/\/steadyrenew.com\/blog\/how-to-do-a-subscription-audit\/"/
  );
  assert.match(
    zhArticle,
    /rel="canonical" href="https:\/\/steadyrenew.com\/zh\/blog\/how-to-cancel-auto-renew\/"/
  );
  assert.match(index, /hreflang="en" href="https:\/\/steadyrenew.com\/blog\/"/);
  assert.match(index, /hreflang="zh-CN" href="https:\/\/steadyrenew.com\/zh\/blog\/"/);
  assert.match(index, /hreflang="x-default" href="https:\/\/steadyrenew.com\/blog\/"/);
  assert.match(zhIndex, /hreflang="en" href="https:\/\/steadyrenew.com\/blog\/"/);
  assert.match(zhArticle, /<html lang="zh">/);
  assert.match(zhArticle, /<a class="brand" href="\/zh\/">/);
  assert.match(zhArticle, /href="\/zh\/blog\/"/);
  assert.match(zhArticle, /<title>微信\/支付宝\/Apple\/Google 自动扣费怎么关？入口速查 · SteadyRenew<\/title>/);
  assert.match(zhArticle, /property="og:title" content="微信\/支付宝\/Apple\/Google 自动扣费怎么关？入口速查 · SteadyRenew"/);
  assert.match(zhArticle, /name="twitter:title" content="微信\/支付宝\/Apple\/Google 自动扣费怎么关？入口速查 · SteadyRenew"/);
  assert.match(zhArticle, /name="twitter:card" content="summary_large_image"/);
  assert.match(zhArticle, /name="twitter:image" content="https:\/\/steadyrenew\.com\/product-zh-CN-light\.jpg"/);
  assert.match(article, /name="twitter:image" content="https:\/\/steadyrenew\.com\/product-en-light\.jpg"/);
  assert.match(zhArticle, /<h1>自动扣费在哪里看、怎么关？微信 \/ 支付宝 \/ Apple \/ Google 入口速查（2026）<\/h1>/);
  assert.match(zhArticle, /"headline":"自动扣费在哪里看、怎么关？微信 \/ 支付宝 \/ Apple \/ Google 入口速查（2026）"/);
  assert.match(zhArticle, /"@type":"Person","name":"Jerry Lu","url":"https:\/\/github\.com\/JerryyrreJ"/);
  assert.match(zhArticle, /"@type":"BreadcrumbList"/);
  assert.match(zhArticle, /"@type":"FAQPage"/);
  assert.match(zhArticle, /"datePublished":"2026-09-16"/);
  assert.match(zhArticle, /"dateModified":"2026-11-12"/);
  assert.match(zhArticle, /2026年9月16日/);
  assert.match(zhArticle, /更新于 <time datetime="2026-11-12">2026年11月12日<\/time>/);
  assert.match(zhArticle, /<nav class="toc" aria-label="本文目录">/);
  assert.match(article, /<nav class="toc" aria-label="On this page">/);
  assert.match(
    article,
    /<title>How to do a subscription audit \(keep \/ cancel \/ remind\) · SteadyRenew<\/title>/
  );
  assert.doesNotMatch(index, /Draft outline/);
  assert.doesNotMatch(article, /Draft outline/);
  assert.doesNotMatch(zhIndex, /草稿提纲/);
  assert.doesNotMatch(zhArticle, /草稿提纲/);
  assert.doesNotMatch(index, /自动扣费在哪里看、怎么关/);
  assert.doesNotMatch(zhIndex, /How to do a subscription audit/);
  assert.match(zhIndex, /自动扣费在哪里看、怎么关/);
  assert.match(zhIndex, /href="\/zh\/blog\/how-to-cancel-auto-renew\/"/);
  assert.match(article, /https:\/\/support.apple.com\/118428/);
  assert.match(article, /https:\/\/support.google.com\/googleplay\/answer\/7018481/);
  assert.match(article, /consumer.ftc.gov/);
  assert.doesNotMatch(index, /netlify\.app/);
  assert.doesNotMatch(article, /netlify\.app/);
  assert.doesNotMatch(zhArticle, /netlify\.app/);
  assert.doesNotMatch(sitemap, /netlify\.app/);
  assert.doesNotMatch(zhArticle, /rel="alternate"/);
  assert.doesNotMatch(article, /rel="alternate"/);
  assert.doesNotMatch(zhArticle, /hreflang=/);
  assert.doesNotMatch(article, /hreflang=/);

  assert.match(sitemap, /<loc>https:\/\/steadyrenew.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/steadyrenew.com\/blog\/<\/loc>\s*<lastmod>2026-11-20<\/lastmod>/);
  assert.match(sitemap, /<loc>https:\/\/steadyrenew.com\/zh\/blog\/<\/loc>\s*<lastmod>2026-11-20<\/lastmod>/);
  assert.match(
    sitemap,
    /<loc>https:\/\/steadyrenew.com\/blog\/how-to-do-a-subscription-audit\/<\/loc>\s*<lastmod>2026-11-12<\/lastmod>/
  );
  assert.match(
    sitemap,
    /<loc>https:\/\/steadyrenew.com\/blog\/apple-free-trial-charge-refund\/<\/loc>\s*<lastmod>2026-11-12<\/lastmod>/
  );
  assert.match(
    sitemap,
    /<loc>https:\/\/steadyrenew.com\/blog\/rocket-money-alternatives-without-bank-login\/<\/loc>\s*<lastmod>2026-11-12<\/lastmod>/
  );
  assert.match(
    sitemap,
    /<loc>https:\/\/steadyrenew.com\/zh\/blog\/how-to-cancel-auto-renew\/<\/loc>\s*<lastmod>2026-11-12<\/lastmod>/
  );
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/\.netlify\//);
  assert.match(robots, /Sitemap: https:\/\/steadyrenew.com\/sitemap.xml/);

  const hrefs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.ok(hrefs.every(url => url.startsWith('https://steadyrenew.com') && url.endsWith('/')));
});

function pairedPost(lang: string, status: BlogPost['status'] = 'published', slug = 'shared-guide'): BlogPost {
  return {
    title: lang,
    slug,
    description: 'Desc',
    date: '2026-01-02',
    status,
    lang,
    bodyHtml: '<p>Body</p>',
    faqs: [],
    sourcePath: 'memory',
  };
}

test('blog hreflang is emitted only for a published translation of the same slug, and drafts are noindex and excluded from sitemap', () => {
  const en = pairedPost('en');
  const zh = pairedPost('zh');
  const draft = pairedPost('en', 'draft', 'draft-guide');
  const paired = renderBlogPost(en, postLanguageAlternates(en, [en, zh]));
  assert.match(paired, /hreflang="zh-CN" href="https:\/\/steadyrenew.com\/zh\/blog\/shared-guide\/"/);
  assert.match(paired, /hreflang="en" href="https:\/\/steadyrenew.com\/blog\/shared-guide\/"/);
  assert.doesNotMatch(renderBlogPost(en, postLanguageAlternates(en, [en])), /hreflang=/);
  assert.doesNotMatch(renderBlogPost(en, postLanguageAlternates(en, [en, pairedPost('zh', 'draft')])), /hreflang=/);
  assert.doesNotMatch(renderBlogPost(en, postLanguageAlternates(en, [en, pairedPost('zh', 'published', 'other-guide')])), /hreflang=/);
  assert.match(renderBlogPost(draft), /name="robots" content="noindex,follow"/);
  const filesWithDraft = Object.fromEntries(
    buildPublicFiles([en, draft], '2026-09-16').map(file => [file.filePath, file.contents])
  );
  assert.doesNotMatch(filesWithDraft['sitemap.xml'] ?? '', /draft-guide/);
});

test('first post follows soft-CTA and claims rules from the writer brief', () => {
  const source = readFileSync(firstPostPath, 'utf8');
  const intro = source.split('## Before you start')[0] ?? '';

  assert.equal(intro.includes('SteadyRenew'), false);
  assert.match(source, /does \*\*not\*\* connect to your bank/);
  assert.match(source, /cancel for you/);
  assert.match(source, /or negotiate bills/);
  assert.match(source, /no bank login required/);

  assert.doesNotMatch(source, /Plaid/i);
  assert.doesNotMatch(source, /average person has/i);
  assert.doesNotMatch(source, /guaranteed savings/i);
  assert.doesNotMatch(source, /typical user saves/i);
  assert.doesNotMatch(source, /we'll cancel/i);
  assert.doesNotMatch(source, /automatically find every charge/i);
  assert.doesNotMatch(source, /Rocket Money/i);
});

test('Chinese cancel guide is published, human-toned, and only cross-links the EN audit', () => {
  const source = readFileSync(zhPostPath, 'utf8');
  const intro = source.split('## 取消后怎么确认')[0] ?? '';

  assert.match(source, /^status: published$/m);
  assert.match(source, /^lang: zh$/m);
  assert.match(source, /^canonical: https:\/\/steadyrenew\.com\/zh\/blog\/how-to-cancel-auto-renew\/$/m);
  assert.equal(intro.includes('SteadyRenew'), false);
  assert.doesNotMatch(source, /截图留证/);
  assert.doesNotMatch(source, /Plaid/i);
  assert.doesNotMatch(source, /yearly-spend-explained\]\(/);
  assert.doesNotMatch(source, /no-bank[^)]*\)/);
  assert.doesNotMatch(source, /href="[^"]*yearly-spend/);
  assert.match(
    source,
    /https:\/\/steadyrenew\.com\/blog\/how-to-do-a-subscription-audit/
  );
  assert.match(source, /不会替你取消订阅/);
  assert.match(source, /不读取你的账单/);

  const related = source.split('## 相关阅读')[1] ?? '';
  assert.match(related, /how-to-do-a-subscription-audit/);
  assert.doesNotMatch(related, /yearly-spend/);
  assert.doesNotMatch(related, /free-trial-reminders\]\(/);
});

test('cluster and cta frontmatter validate cleanly and reject unknown values', () => {
  const valid = toFrontmatter({
    title: 'Test',
    slug: 'test-post',
    description: 'Desc',
    date: '2026-11-15',
    status: 'published',
    lang: 'en',
    cluster: 'trials-refunds',
    cta: 'trial',
  });
  assert.equal(valid.cluster, 'trials-refunds');
  assert.equal(valid.cta, 'trial');

  assert.throws(
    () =>
      toFrontmatter({
        title: 'Test',
        slug: 'test-post',
        description: 'Desc',
        date: '2026-11-15',
        status: 'published',
        cluster: 'unknown-cluster',
      }),
    /Invalid cluster/
  );

  assert.throws(
    () =>
      toFrontmatter({
        title: 'Test',
        slug: 'test-post',
        description: 'Desc',
        date: '2026-11-15',
        status: 'published',
        cta: 'unknown-cta',
      }),
    /Invalid cta/
  );
});

test('contextual CTA card renders before FAQ with attribution ref and can be suppressed with cta: none', () => {
  const enPost: BlogPost = {
    title: 'Trial check',
    slug: 'trial-check',
    description: 'Desc',
    date: '2026-11-15',
    status: 'published',
    lang: 'en',
    cluster: 'trials-refunds',
    bodyHtml: '<p>Steps</p>\n<h2 id="faq">FAQ</h2>\n<p>Answer</p>',
    faqs: [],
    sourcePath: 'memory',
  };
  const enHtml = renderBlogPost(enPost);
  const ctaIndex = enHtml.indexOf('<aside class="cta"');
  const faqIndex = enHtml.indexOf('<h2 id="faq">');
  assert.ok(ctaIndex > -1 && faqIndex > ctaIndex);
  assert.match(enHtml, /href="\/app\?ref=blog-trial-check"/);

  const zhPost: BlogPost = {
    ...enPost,
    slug: 'zh-trial-check',
    lang: 'zh',
    bodyHtml: '<p>步骤</p>\n<h2 id="常见问题">常见问题</h2>\n<p>回答</p>',
  };
  const zhHtml = renderBlogPost(zhPost);
  assert.ok(zhHtml.indexOf('<aside class="cta"') < zhHtml.indexOf('<h2 id="常见问题">'));
  assert.match(zhHtml, /href="\/app\?ref=zh-blog-zh-trial-check"/);

  const suppressed = renderPostCta({ ...enPost, cta: 'none' });
  assert.equal(suppressed, '');
});

test('renderClusterRelated recommends unlinked same-language cluster guides without duplicating prose links', () => {
  const current: BlogPost = {
    title: 'Current',
    slug: 'current-guide',
    description: 'Current desc',
    date: '2026-11-15',
    status: 'published',
    lang: 'en',
    cluster: 'trials-refunds',
    bodyHtml: '<p>See <a href="https://steadyrenew.com/blog/already-linked/">already</a>.</p>',
    faqs: [],
    sourcePath: 'memory',
  };
  const all: BlogPost[] = [
    current,
    { ...pairedPost('en', 'published', 'already-linked'), cluster: 'trials-refunds', date: '2026-11-14' },
    { ...pairedPost('en', 'published', 'same-cluster-new'), cluster: 'trials-refunds', date: '2026-11-13' },
    { ...pairedPost('zh', 'published', 'zh-same-cluster'), cluster: 'trials-refunds', date: '2026-11-15' },
    { ...pairedPost('en', 'draft', 'draft-same-cluster'), cluster: 'trials-refunds', date: '2026-11-15' },
    { ...pairedPost('en', 'published', 'other-cluster'), cluster: 'audit-cleanup', date: '2026-11-15' },
  ];

  const relatedHtml = renderClusterRelated(current, all);
  assert.doesNotMatch(relatedHtml, /already-linked/);
  assert.doesNotMatch(relatedHtml, /zh-same-cluster/);
  assert.doesNotMatch(relatedHtml, /draft-same-cluster/);
  assert.match(relatedHtml, /href="\/blog\/same-cluster-new\/"/);
  assert.match(relatedHtml, /href="\/blog\/other-cluster\/"/);
  assert.ok(
    relatedHtml.indexOf('same-cluster-new') < relatedHtml.indexOf('other-cluster'),
    'same-cluster guide should rank before newer post from another cluster'
  );
});

test('every published post meets FAQ, intro-honesty, and orphan-free internal linking invariants', () => {
  const posts = loadPosts(rootDir);
  const published = posts.filter(post => post.status === 'published');
  assert.ok(published.length >= 16);

  const files = Object.fromEntries(
    buildPublicFiles(posts, '2026-11-15').map(file => [file.filePath, file.contents])
  );

  for (const post of published) {
    assert.ok(post.faqs.length >= 3, `${post.slug} should have at least 3 FAQs`);

    const currentFilePath = post.lang.startsWith('zh')
      ? `zh/blog/${post.slug}/index.html`
      : `blog/${post.slug}/index.html`;
    assert.doesNotMatch(
      files[currentFilePath] ?? '',
      /href="(?:https:\/\/steadyrenew\.com)?(?:\/zh)?\/blog(?:\/[a-z0-9-]+)?"/,
      `${currentFilePath} has an internal blog link without a trailing slash`
    );

    if (post.slug !== 'manage-subscriptions-with-mcp') {
      const raw = readFileSync(post.sourcePath, 'utf8');
      const afterFrontmatter = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      const beforeFirstHeading = afterFrontmatter.split(/^##\s+/m)[0] ?? '';
      assert.equal(
        beforeFirstHeading.includes('SteadyRenew'),
        false,
        `${post.slug} should not mention SteadyRenew before its first ## heading`
      );
    }

    const expectedPath = post.lang.startsWith('zh')
      ? `/zh/blog/${post.slug}/`
      : `/blog/${post.slug}/`;
    const incomingCount = published.filter(other => {
      if (other.slug === post.slug && other.lang === post.lang) return false;
      const filePath = other.lang.startsWith('zh')
        ? `zh/blog/${other.slug}/index.html`
        : `blog/${other.slug}/index.html`;
      return (files[filePath] ?? '').includes(expectedPath);
    }).length;

    assert.ok(incomingCount >= 1, `${expectedPath} is an orphan page with 0 incoming links`);
  }
});

test('markdown images, TOC headings, quick-answer summary, and custom cover image render cleanly', () => {
  const html = markdownToHtml(`## First section

![Dashboard preview](/product-en-light.jpg "Sample view")

## Second section

Inline ![icon](/icon.png) and [guide](https://steadyrenew.com/blog/).

## Third section

Body copy.
`);
  assert.match(
    html,
    /<figure class="prose-figure"><img src="\/product-en-light\.jpg" alt="Dashboard preview" loading="lazy" decoding="async" \/><figcaption>Sample view<\/figcaption><\/figure>/
  );
  assert.match(html, /<img src="\/icon\.png" alt="icon" loading="lazy" decoding="async" \/>/);

  const headings = extractHeadings(html);
  assert.equal(headings.length, 3);
  assert.deepEqual(headings[0], { id: 'first-section', text: 'First section' });

  const toc = renderToc(headings, 'On this page');
  assert.match(toc, /<nav class="toc" aria-label="On this page">/);
  assert.match(toc, /href="#first-section"/);
  assert.equal(renderToc(headings.slice(0, 2), 'On this page'), '');

  const summary = renderQuickAnswer('Concise takeaway.', 'Quick answer');
  assert.match(summary, /<aside class="quick-answer" aria-label="Quick answer">/);
  assert.match(summary, /Concise takeaway\./);

  const postHtml = renderBlogPost({
    title: 'Image test',
    slug: 'image-test',
    description: 'Desc',
    date: '2026-11-20',
    status: 'published',
    lang: 'en',
    image: '/blog/custom-shot.png',
    summary: 'Direct summary answer.',
    bodyHtml: html,
    faqs: [],
    sourcePath: 'memory',
  });
  assert.match(postHtml, /property="og:image" content="https:\/\/steadyrenew\.com\/blog\/custom-shot\.png"/);
  assert.match(postHtml, /"image":"https:\/\/steadyrenew\.com\/blog\/custom-shot\.png"/);
  assert.match(postHtml, /<aside class="quick-answer"/);
});
