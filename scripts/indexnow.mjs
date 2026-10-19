import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST = 'steadyrenew.com';
const KEY = '16274743d7549a346d2cf33abbd2d73d';
const ORIGIN = `https://${HOST}`;
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const SITEMAP_PATHS = ['sitemap.xml', 'docs/sitemap.xml'];
const BATCH_SIZE = 10_000;

function decodeXml(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

export function locValues(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/gi)]
    .map(match => decodeXml(match[1].trim()))
    .filter(Boolean);
}

export function isSitemapIndex(xml) {
  return /<sitemapindex\b/i.test(xml);
}

export function sameHostUrls(locs, host = HOST) {
  const urls = [];
  for (const loc of locs) {
    let url;
    try {
      url = new URL(loc);
    } catch {
      continue;
    }
    if (url.hostname === host) urls.push(url.href);
  }
  return urls;
}

export async function urlsFromSitemapDocument(xml, fetchText, depth = 0, seen = new Set()) {
  const locs = locValues(xml);
  if (!isSitemapIndex(xml) || depth >= 3) return sameHostUrls(locs);

  const nested = [];
  for (const loc of locs) {
    let childUrl;
    try {
      childUrl = new URL(loc);
    } catch {
      continue;
    }
    if (childUrl.protocol !== 'https:' || childUrl.hostname !== HOST) continue;
    if (seen.has(childUrl.href)) continue;
    seen.add(childUrl.href);
    let child;
    try {
      child = await fetchText(childUrl.href);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`IndexNow: skipped nested sitemap ${childUrl.href}: ${message}`);
      continue;
    }
    nested.push(...await urlsFromSitemapDocument(child, fetchText, depth + 1, seen));
  }
  return nested;
}

export async function collectIndexNowUrls({ readLocal, fetchText }) {
  const found = [];
  const problems = [];

  for (const relative of SITEMAP_PATHS) {
    let xml = null;
    let localError = '';
    try {
      xml = await readLocal(relative);
    } catch (error) {
      localError = error instanceof Error ? error.message : String(error);
      console.warn(`IndexNow: could not read dist/${relative}: ${localError}`);
    }

    if (xml == null) {
      const remote = `${ORIGIN}/${relative}`;
      try {
        console.log(`IndexNow: fetching ${remote}`);
        xml = await fetchText(remote);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        problems.push(`${relative}: ${localError ? `${localError}; ${message}` : message}`);
        console.warn(`IndexNow: skipped ${remote}: ${message}`);
        continue;
      }
    } else {
      console.log(`IndexNow: using dist/${relative}`);
    }

    found.push(...await urlsFromSitemapDocument(xml, fetchText));
  }

  return { urls: [...new Set(found)], problems };
}

export async function submitIndexNow(urls, fetchImpl = fetch) {
  if (urls.length === 0) throw new Error('IndexNow: no URLs to submit');

  for (let offset = 0; offset < urls.length; offset += BATCH_SIZE) {
    const urlList = urls.slice(offset, offset + BATCH_SIZE);
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: KEY_LOCATION,
        urlList,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`IndexNow POST ${response.status}: ${text.slice(0, 500)}`);
    }
    console.log(`IndexNow: accepted ${urlList.length} URL(s) with HTTP ${response.status}`);
  }
}

async function main() {
  const dist = path.join(process.cwd(), 'dist');
  const readLocal = async relative => {
    try {
      return await readFile(path.join(dist, relative), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  };
  const fetchText = async url => {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}`);
    return response.text();
  };

  const { urls, problems } = await collectIndexNowUrls({ readLocal, fetchText });
  if (urls.length === 0) {
    const detail = problems.length ? ` (${problems.join('; ')})` : '';
    throw new Error(`IndexNow: no URLs to submit${detail}`);
  }
  if (problems.length) {
    console.warn(`IndexNow: continuing with ${urls.length} URL(s); some sitemaps were skipped (${problems.join('; ')})`);
  }
  await submitIndexNow(urls);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
