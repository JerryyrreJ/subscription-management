import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBlogIndex } from '../../scripts/blog/render.ts';
import {
  collectIndexNowUrls,
  isSitemapIndex,
  sameHostUrls,
  submitIndexNow,
  urlsFromSitemapDocument,
} from '../../scripts/indexnow.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KEY = '16274743d7549a346d2cf33abbd2d73d';
const BING_XML = '<?xml version="1.0"?>\n<users>\n\t<user>42D1BD359B3222254C205F07088F0FE9</user>\n</users>\n';
const META = '<meta name="msvalidate.01" content="42D1BD359B3222254C205F07088F0FE9" />';

test('Bing and IndexNow verification files match the published bytes', () => {
  assert.equal(readFileSync(path.join(root, 'public/BingSiteAuth.xml'), 'utf8'), BING_XML);
  assert.equal(readFileSync(path.join(root, `public/${KEY}.txt`), 'utf8'), KEY);
  assert.match(readFileSync(path.join(root, 'index.html'), 'utf8'), new RegExp(META.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(renderBlogIndex([]), new RegExp(META.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('sitemap collection prefers built files and keeps only this host', async () => {
  const fetched: string[] = [];
  const { urls, problems } = await collectIndexNowUrls({
    readLocal: async relative => relative === 'sitemap.xml'
      ? '<urlset><url><loc>https://steadyrenew.com/pricing/</loc></url><url><loc>https://example.com/other</loc></url></urlset>'
      : null,
    fetchText: async url => {
      fetched.push(url);
      return '<urlset><url><loc>https://steadyrenew.com/docs/en</loc></url><url><loc> https://steadyrenew.com/pricing/ </loc></url></urlset>';
    },
  });

  assert.deepEqual(problems, []);
  assert.deepEqual(fetched, ['https://steadyrenew.com/docs/sitemap.xml']);
  assert.deepEqual(urls, [
    'https://steadyrenew.com/pricing/',
    'https://steadyrenew.com/docs/en',
  ]);
  assert.deepEqual(sameHostUrls(['https://steadyrenew.com/zh/', 'not a url', 'https://www.steadyrenew.com/']), [
    'https://steadyrenew.com/zh/',
  ]);
});

test('sitemap indexes are followed only on this host', async () => {
  const index = '<sitemapindex><sitemap><loc>https://steadyrenew.com/nested.xml</loc></sitemap><sitemap><loc>https://evil.example/nested.xml</loc></sitemap></sitemapindex>';
  assert.equal(isSitemapIndex(index), true);
  const fetched: string[] = [];
  const urls = await urlsFromSitemapDocument(index, async url => {
    fetched.push(url);
    return '<urlset><url><loc>https://steadyrenew.com/docs/a</loc></url></urlset>';
  });
  assert.deepEqual(fetched, ['https://steadyrenew.com/nested.xml']);
  assert.deepEqual(urls, ['https://steadyrenew.com/docs/a']);
});

test('IndexNow posts the host, key, keyLocation, and URL list', async () => {
  const calls: { url: string; body: string }[] = [];
  await submitIndexNow(['https://steadyrenew.com/'], async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body) });
    return new Response('', { status: 202 });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.indexnow.org/indexnow');
  assert.deepEqual(JSON.parse(calls[0].body), {
    host: 'steadyrenew.com',
    key: KEY,
    keyLocation: `https://steadyrenew.com/${KEY}.txt`,
    urlList: ['https://steadyrenew.com/'],
  });
  await assert.rejects(() => submitIndexNow([]), /no URLs to submit/);
});
