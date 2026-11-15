import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_TTL_MS,
  captureEntryAttribution,
  deriveReferrerAttribution,
  getStoredAttributionRef,
  sanitizeAttributionRef,
} from '../../src/utils/attribution.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    raw: map,
  };
}

test('sanitizeAttributionRef accepts lowercase slug tokens and rejects malformed values', () => {
  assert.equal(sanitizeAttributionRef('blog-how-to-do-a-subscription-audit'), 'blog-how-to-do-a-subscription-audit');
  assert.equal(sanitizeAttributionRef(' zh-blog-apple_guide '), 'zh-blog-apple_guide');
  assert.equal(sanitizeAttributionRef('<script>alert(1)</script>'), null);
  assert.equal(sanitizeAttributionRef('https://evil.example/blog'), null);
  assert.equal(sanitizeAttributionRef('UPPERCASE'), null);
  assert.equal(sanitizeAttributionRef('a'.repeat(81)), null);
});

test('deriveReferrerAttribution extracts blog and zh/blog slugs only from allowed origins', () => {
  assert.equal(
    deriveReferrerAttribution('https://steadyrenew.com/blog/apple-free-trial-charge-refund/'),
    'blog-apple-free-trial-charge-refund'
  );
  assert.equal(
    deriveReferrerAttribution('https://steadyrenew.com/zh/blog/apple-subscription-refund-guide/'),
    'zh-blog-apple-subscription-refund-guide'
  );
  assert.equal(
    deriveReferrerAttribution('https://steadyrenew.com/blog/'),
    'blog-index'
  );
  assert.equal(
    deriveReferrerAttribution('http://localhost:5173/zh/blog/', 'http://localhost:5173'),
    'zh-blog-index'
  );
  assert.equal(
    deriveReferrerAttribution('https://google.com/blog/something/'),
    null
  );
  assert.equal(
    deriveReferrerAttribution('https://steadyrenew.com/pricing/'),
    null
  );
});

test('captureEntryAttribution prioritizes ?ref=, strips only ref from URL, falls back to referrer, and enforces 60-day TTL', () => {
  const storage = memoryStorage();
  const replaced: string[] = [];
  const t0 = 1_700_000_000_000;

  const captured = captureEntryAttribution({
    url: 'https://steadyrenew.com/app?ref=blog-bobby-app-alternatives&payment=success&session_id=cs_123#done',
    referrer: 'https://steadyrenew.com/blog/how-to-do-a-subscription-audit/',
    storage,
    replaceUrl: clean => replaced.push(clean),
    now: t0,
  });

  assert.equal(captured, 'blog-bobby-app-alternatives');
  assert.deepEqual(replaced, ['/app?payment=success&session_id=cs_123#done']);
  assert.equal(getStoredAttributionRef(storage, t0 + 1000), 'blog-bobby-app-alternatives');

  // Referrer fallback preserves firstRef when user reads another post later
  const second = captureEntryAttribution({
    url: 'https://steadyrenew.com/app',
    referrer: 'https://steadyrenew.com/zh/blog/bark-subscription-renewal-alerts/',
    storage,
    now: t0 + 5_000,
  });
  assert.equal(second, 'zh-blog-bark-subscription-renewal-alerts');
  const rawRecord = JSON.parse(storage.getItem(ATTRIBUTION_STORAGE_KEY) ?? '{}');
  assert.equal(rawRecord.firstRef, 'blog-bobby-app-alternatives');
  assert.equal(rawRecord.ref, 'zh-blog-bark-subscription-renewal-alerts');

  // Expiration past 60 days clears stored ref
  assert.equal(getStoredAttributionRef(storage, t0 + 5_000 + ATTRIBUTION_TTL_MS + 1), null);
  assert.equal(storage.getItem(ATTRIBUTION_STORAGE_KEY), null);
});
