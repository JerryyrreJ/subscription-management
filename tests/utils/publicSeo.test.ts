import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FREE_PRICE_USD, PREMIUM_PRICE_CURRENCY, PREMIUM_PRICE_USD, PREMIUM_UNIT_AMOUNT_CENTS } from '../../src/utils/pricingFacts.ts';
import { marketingStructuredData, STEADYRENEW_SAME_AS } from '../../src/utils/structuredData.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('public prices match the one-time Premium amount checkout accepts', () => {
  assert.equal(PREMIUM_UNIT_AMOUNT_CENTS, 900);
  assert.equal(PREMIUM_PRICE_CURRENCY, 'usd');
  assert.equal(PREMIUM_PRICE_USD, '9');
  assert.equal(FREE_PRICE_USD, '0');
  assert.equal(Number(PREMIUM_PRICE_USD) * 100, PREMIUM_UNIT_AMOUNT_CENTS);
});

test('marketing JSON-LD names SteadyRenew, the GitHub project, and the real prices', () => {
  const data = marketingStructuredData({
    description: 'Track subscription costs.',
    inLanguage: 'en',
  });
  const graph = data['@graph'] as Array<Record<string, unknown>>;
  const organization = graph.find(item => item['@type'] === 'Organization');
  const application = graph.find(item => item['@type'] === 'SoftwareApplication');
  assert.ok(organization);
  assert.ok(application);
  assert.equal(organization.name, 'SteadyRenew');
  assert.equal(organization.url, 'https://steadyrenew.com/');
  assert.equal(organization.sameAs, STEADYRENEW_SAME_AS);
  assert.equal(application.sameAs, 'https://github.com/JerryyrreJ/subscription-management');
  assert.deepEqual(application.offers, [
    { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Premium', price: '9', priceCurrency: 'USD' },
  ]);
  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /aggregateRating|reviewCount|sub\.jerrylu\.xyz/);
});

test('llms.txt is plain text and only links to pages that exist in this repo', () => {
  const body = readFileSync(path.join(root, 'public/llms.txt'), 'utf8');
  const toml = readFileSync(path.join(root, 'netlify.toml'), 'utf8');
  assert.match(body, /^# SteadyRenew\n/);
  assert.match(body, /does not connect to a bank/);
  assert.match(
    body,
    /\[自动扣费在哪里看、怎么关？微信 \/ 支付宝 \/ Apple \/ Google 入口速查（2026）\]\(https:\/\/steadyrenew.com\/zh\/blog\/how-to-cancel-auto-renew\/\)/
  );
  assert.doesNotMatch(body, /如何盘点并关掉用不到的自动续费/);
  assert.doesNotMatch(body, /<html|noindex|sub\.jerrylu\.xyz/);
  for (const url of [
    'https://steadyrenew.com/',
    'https://steadyrenew.com/zh/',
    'https://steadyrenew.com/pricing/',
    'https://steadyrenew.com/zh/pricing/',
    'https://steadyrenew.com/blog/',
    'https://steadyrenew.com/zh/blog/',
    'https://steadyrenew.com/blog/how-to-do-a-subscription-audit/',
    'https://steadyrenew.com/blog/best-subscription-trackers-without-bank-login/',
    'https://steadyrenew.com/blog/manage-subscriptions-with-mcp/',
    'https://steadyrenew.com/zh/blog/how-to-cancel-auto-renew/',
    'https://steadyrenew.com/docs/en/api/overview',
    'https://steadyrenew.com/docs/en/user-guide/agent-setup',
    'https://steadyrenew.com/docs/zh-CN/api/overview',
    'https://steadyrenew.com/docs/zh-CN/user-guide/agent-setup',
    'https://steadyrenew.com/agent/setup.md',
    'https://steadyrenew.com/agent/openapi.yaml',
    'https://steadyrenew.com/downloads/subscription-manager-mcp.tgz',
    'https://steadyrenew.com/api/v1/subscriptions',
    'https://github.com/JerryyrreJ/subscription-management',
  ]) {
    assert.ok(body.includes(url), url);
  }
  assert.match(toml, /for = "\/llms\.txt"/);
  assert.match(toml, /Content-Type = "text\/plain; charset=utf-8"/);
  const blog = toml.indexOf('from = "https://sub.jerrylu.xyz/blog"');
  const home = toml.indexOf('from = "https://sub.jerrylu.xyz/"');
  const rest = toml.indexOf('from = "https://sub.jerrylu.xyz/*"');
  assert.ok(blog >= 0 && home > blog && rest > home);
  assert.doesNotMatch(toml, /from = "\/\*"\s+to = "https:\/\/steadyrenew\.com/);
  assert.match(toml, /from = "https:\/\/www\.steadyrenew\.com\/\*"\s+to = "https:\/\/steadyrenew\.com\/:splat"/);
  assert.match(toml, /from = "http:\/\/steadyrenew\.com\/\*"\s+to = "https:\/\/steadyrenew\.com\/:splat"/);
  assert.match(toml, /from = "http:\/\/www\.steadyrenew\.com\/\*"\s+to = "https:\/\/steadyrenew\.com\/:splat"/);
});
