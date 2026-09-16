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
  canonicalUrl,
  isCanonicalHost,
  postCanonicalUrl,
} from '../../scripts/blog/site.ts';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const firstPostPath = path.join(rootDir, 'content/blog/how-to-do-a-subscription-audit.md');

test('canonical URLs always use the custom domain, not a Netlify alias', () => {
  assert.equal(CANONICAL_ORIGIN, 'https://sub.jerrylu.xyz');
  assert.equal(canonicalUrl('/'), 'https://sub.jerrylu.xyz/');
  assert.equal(canonicalUrl(BLOG_PATH), 'https://sub.jerrylu.xyz/blog');
  assert.equal(
    postCanonicalUrl('how-to-do-a-subscription-audit'),
    'https://sub.jerrylu.xyz/blog/how-to-do-a-subscription-audit'
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

test('public blog files list app and posts under the canonical host', () => {
  const posts = loadPosts(rootDir);
  const files = Object.fromEntries(
    buildPublicFiles(posts, '2026-09-16').map(file => [file.filePath, file.contents])
  );

  const first = posts.find(post => post.slug === 'how-to-do-a-subscription-audit');
  assert.ok(first);
  assert.equal(first.status, 'draft');
  assert.ok(first.faqs.length >= 8);

  const index = files['blog/index.html'];
  const article = files['blog/how-to-do-a-subscription-audit/index.html'];
  const sitemap = files['sitemap.xml'];
  const robots = files['robots.txt'];

  assert.ok(index);
  assert.ok(article);
  assert.ok(sitemap);
  assert.ok(robots);

  assert.match(index, /rel="canonical" href="https:\/\/sub.jerrylu.xyz\/blog"/);
  assert.match(
    article,
    /rel="canonical" href="https:\/\/sub.jerrylu.xyz\/blog\/how-to-do-a-subscription-audit"/
  );
  assert.match(article, /Draft outline/);
  assert.match(article, /https:\/\/support.apple.com\/en-us\/118428/);
  assert.match(article, /https:\/\/support.google.com\/googleplay\/answer\/7018481/);
  assert.match(article, /consumer.ftc.gov/);
  assert.doesNotMatch(index, /netlify\.app/);
  assert.doesNotMatch(article, /netlify\.app/);
  assert.doesNotMatch(sitemap, /netlify\.app/);

  assert.match(sitemap, /<loc>https:\/\/sub.jerrylu.xyz\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/sub.jerrylu.xyz\/blog<\/loc>/);
  assert.match(
    sitemap,
    /<loc>https:\/\/sub.jerrylu.xyz\/blog\/how-to-do-a-subscription-audit<\/loc>/
  );
  assert.match(robots, /Sitemap: https:\/\/sub.jerrylu.xyz\/sitemap.xml/);

  const hrefs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.ok(hrefs.every(url => url.startsWith('https://sub.jerrylu.xyz')));
});

test('first post follows soft-CTA and claims rules from the writer brief', () => {
  const source = readFileSync(firstPostPath, 'utf8');
  const intro = source.split('## Before you start')[0] ?? '';

  assert.equal(intro.includes('Subscription Manager'), false);
  assert.match(source, /Keep the list somewhere it will get reminders/);
  assert.match(source, /does not connect to your bank/);
  assert.match(source, /cancel merchants for you/);
  assert.match(source, /or negotiate bills/);

  assert.doesNotMatch(source, /Plaid/i);
  assert.doesNotMatch(source, /average person has/i);
  assert.doesNotMatch(source, /guaranteed savings/i);
  assert.doesNotMatch(source, /typical user saves/i);
  assert.doesNotMatch(source, /we'll cancel/i);
  assert.doesNotMatch(source, /automatically find every charge/i);
  assert.doesNotMatch(source, /Rocket Money/i);
});
