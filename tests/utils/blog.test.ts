import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFaqs, markdownToHtml, parseFrontmatter, toFrontmatter } from '../../scripts/blog/markdown.ts';
import { buildPublicFiles } from '../../scripts/blog/generate.ts';
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
  assert.equal(CANONICAL_ORIGIN, 'https://sub.jerrylu.xyz');
  assert.equal(canonicalUrl('/'), 'https://sub.jerrylu.xyz/');
  assert.equal(canonicalUrl(BLOG_PATH), 'https://sub.jerrylu.xyz/blog');
  assert.equal(canonicalUrl(ZH_BLOG_PATH), 'https://sub.jerrylu.xyz/zh/blog');
  assert.equal(
    postCanonicalUrl('how-to-do-a-subscription-audit'),
    'https://sub.jerrylu.xyz/blog/how-to-do-a-subscription-audit'
  );
  assert.equal(
    postCanonicalUrl('how-to-cancel-auto-renew', 'zh'),
    'https://sub.jerrylu.xyz/zh/blog/how-to-cancel-auto-renew'
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

A [link](https://example.com) and **bold**.

| Col | Value |
| --- | --- |
| A | B |

## FAQ

### Example question?

Example answer.
`);
  assert.match(html, /<h2 id="heading">Heading<\/h2>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /<table>/);
  assert.match(html, /<td>B<\/td>/);

  const faqs = extractFaqs(html);
  assert.equal(faqs.length, 1);
  assert.equal(faqs[0]?.question, 'Example question?');
});

test('Chinese headings keep usable ids instead of stripping to empty', () => {
  const html = markdownToHtml('## 微信：自动续费 / 扣费服务\n');
  assert.match(html, /<h2 id="微信自动续费-扣费服务">/);
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
  assert.ok(zhPost.faqs.length >= 7);

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

  assert.match(index, /rel="canonical" href="https:\/\/sub.jerrylu.xyz\/blog"/);
  assert.match(zhIndex, /rel="canonical" href="https:\/\/sub.jerrylu.xyz\/zh\/blog"/);
  assert.match(
    article,
    /rel="canonical" href="https:\/\/sub.jerrylu.xyz\/blog\/how-to-do-a-subscription-audit"/
  );
  assert.match(
    zhArticle,
    /rel="canonical" href="https:\/\/sub.jerrylu.xyz\/zh\/blog\/how-to-cancel-auto-renew"/
  );
  assert.match(zhArticle, /<html lang="zh">/);
  assert.match(zhArticle, /href="\/zh\/blog"/);
  assert.doesNotMatch(index, /Draft outline/);
  assert.doesNotMatch(article, /Draft outline/);
  assert.doesNotMatch(zhIndex, /草稿提纲/);
  assert.doesNotMatch(zhArticle, /草稿提纲/);
  assert.doesNotMatch(index, /如何盘点并关掉用不到的自动续费/);
  assert.doesNotMatch(zhIndex, /How to do a subscription audit/);
  assert.match(zhIndex, /如何盘点并关掉用不到的自动续费/);
  assert.match(zhIndex, /href="\/zh\/blog\/how-to-cancel-auto-renew"/);
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

  assert.match(sitemap, /<loc>https:\/\/sub.jerrylu.xyz\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/sub.jerrylu.xyz\/blog<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/sub.jerrylu.xyz\/zh\/blog<\/loc>/);
  assert.match(
    sitemap,
    /<loc>https:\/\/sub.jerrylu.xyz\/blog\/how-to-do-a-subscription-audit<\/loc>/
  );
  assert.match(
    sitemap,
    /<loc>https:\/\/sub.jerrylu.xyz\/zh\/blog\/how-to-cancel-auto-renew<\/loc>/
  );
  assert.match(robots, /Sitemap: https:\/\/sub.jerrylu.xyz\/sitemap.xml/);

  const hrefs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.ok(hrefs.every(url => url.startsWith('https://sub.jerrylu.xyz')));
});

test('first post follows soft-CTA and claims rules from the writer brief', () => {
  const source = readFileSync(firstPostPath, 'utf8');
  const intro = source.split('## Before you start')[0] ?? '';

  assert.equal(intro.includes('Subscription Manager'), false);
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
  const intro = source.split('## 钱到底从哪个渠道扣')[0] ?? '';

  assert.match(source, /^status: published$/m);
  assert.match(source, /^lang: zh$/m);
  assert.equal(intro.includes('Subscription Manager'), false);
  assert.doesNotMatch(source, /截图留证/);
  assert.doesNotMatch(source, /Plaid/i);
  assert.doesNotMatch(source, /yearly-spend-explained\]\(/);
  assert.doesNotMatch(source, /no-bank[^)]*\)/);
  assert.doesNotMatch(source, /href="[^"]*yearly-spend/);
  assert.match(
    source,
    /https:\/\/sub\.jerrylu\.xyz\/blog\/how-to-do-a-subscription-audit/
  );
  assert.match(source, /不会代你解约/);
  assert.match(source, /不是银行爬取/);

  const related = source.split('## 相关阅读')[1] ?? '';
  assert.match(related, /how-to-do-a-subscription-audit/);
  assert.doesNotMatch(related, /yearly-spend/);
  assert.doesNotMatch(related, /free-trial-reminders\]\(/);
});
