import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isApplicationEntry,
  resolveAppUrl,
} from '../../src/utils/siteRouting.ts';
import {
  configurePublicSite,
  canonicalUrl,
  APP_ENTRY_URL,
} from '../../scripts/blog/site.ts';
import { buildPublicFiles } from '../../scripts/blog/generate.ts';
import { APPLICATION_ORIGIN, APPLICATION_URL, LEGACY_APPLICATION_ORIGINS, marketingUrl, documentationUrl } from '../../src/utils/siteUrls.ts';

const url = (path: string) => new URL(path, 'https://example.com');

test('the main domain shows marketing while app and pricing links open the app', () => {
  assert.equal(isApplicationEntry(url('/')), false);
  assert.equal(isApplicationEntry(url('/#pricing')), false);
  assert.equal(isApplicationEntry(url('/?utm_source=guide')), false);
  assert.equal(isApplicationEntry(url('/app')), true);
  assert.equal(isApplicationEntry(url('/app/')), true);
  assert.equal(isApplicationEntry(url('/pricing')), true);
});

test('legacy domains preserve local data access while the new origin separates landing and app by path', () => {
  for (const origin of LEGACY_APPLICATION_ORIGINS) {
    assert.equal(isApplicationEntry(new URL(origin)), true);
  }
  assert.equal(isApplicationEntry(new URL('https://steadyrenew.com')), false);
  assert.equal(APPLICATION_URL, 'https://steadyrenew.com/app');
  assert.equal(isApplicationEntry(new URL(APPLICATION_URL), '/app'), true);
  assert.equal(isApplicationEntry(new URL(APPLICATION_ORIGIN), '/app'), false);
  assert.equal(isApplicationEntry(new URL('https://steadyrenew.com/?payment=success')), true);
  assert.equal(marketingUrl('/zh/blog', APPLICATION_ORIGIN), 'https://steadyrenew.com/zh/blog');
  assert.equal(marketingUrl('/blog', 'https://preview.example.com'), 'https://preview.example.com/blog');
  assert.equal(documentationUrl('user-guide/reminders', 'zh-CN'), 'https://docs.steadyrenew.com/zh-CN/user-guide/reminders');
  assert.equal(documentationUrl('user-guide/agent-setup', 'en'), 'https://docs.steadyrenew.com/en/user-guide/agent-setup');
});

test('legacy authentication and payment returns never land on marketing', () => {
  for (const path of [
    '/?code=example',
    '/?auth=recovery',
    '/#type=recovery',
    '/#access_token=example',
    '/#refresh_token=example',
    '/?error=access_denied',
    '/#error=access_denied',
    '/?payment=success&session_id=example',
    '/?payment=cancelled',
  ]) {
    assert.equal(isApplicationEntry(url(path)), true, path);
  }
});

test('an app subdomain can use the same build without replacing the marketing domain', () => {
  const appUrl = resolveAppUrl('https://app.example.com');
  assert.equal(isApplicationEntry(url('/'), appUrl), false);
  assert.equal(isApplicationEntry(new URL(appUrl), appUrl), true);
  assert.equal(
    isApplicationEntry(new URL('https://preview.example.com/'), appUrl),
    false,
  );
  assert.equal(resolveAppUrl(''), '/app');
  assert.equal(resolveAppUrl('/app'), '/app');
  assert.throws(() => resolveAppUrl('javascript:alert(1)'));
});

test('a configured marketing domain updates blog metadata, sitemap and app links together', () => {
  try {
    configurePublicSite('https://example.com', 'https://app.example.com/');
    assert.equal(canonicalUrl('/'), 'https://example.com/');
    assert.equal(APP_ENTRY_URL, 'https://app.example.com/');
    const files = Object.fromEntries(
      buildPublicFiles([]).map((file) => [file.filePath, file.contents]),
    );
    assert.match(
      files['blog/index.html'],
      /class="button" href="https:\/\/app.example.com\/"/,
    );
    assert.match(
      files['blog/index.html'],
      /rel="canonical" href="https:\/\/example.com\/blog"/,
    );
    assert.match(files['sitemap.xml'], /<loc>https:\/\/example.com\/<\/loc>/);
    assert.match(files['robots.txt'], /https:\/\/example.com\/sitemap.xml/);
    assert.throws(() => configurePublicSite('https://example.com/subpath'));
  } finally {
    configurePublicSite();
  }
});
