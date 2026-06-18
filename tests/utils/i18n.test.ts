import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resources } from '../../src/i18n/resources.ts';
import { formatCurrencyOptionLabel } from '../../src/utils/currency.ts';
import { getCategoryDisplayName } from '../../src/utils/categories.ts';
import type { TFunction } from 'i18next';

type ResourceTree = Record<string, unknown>;

const flattenKeys = (value: ResourceTree, prefix = ''): string[] => {
 return Object.entries(value).flatMap(([key, child]) => {
  const nextKey = prefix ? `${prefix}.${key}` : key;

  if (child && typeof child === 'object' && !Array.isArray(child)) {
   return flattenKeys(child as ResourceTree, nextKey);
  }

  return [nextKey];
 });
};

const collectSourceFiles = (directory: string): string[] => {
 return readdirSync(directory).flatMap(entry => {
  const fullPath = join(directory, entry);
  const stat = statSync(fullPath);

  if (stat.isDirectory()) {
   return collectSourceFiles(fullPath);
  }

  return /\.(ts|tsx)$/.test(fullPath) ? [fullPath] : [];
 });
};

const resourceValue = (locale: keyof typeof resources, key: string): string => {
 const [namespace, ...path] = key.split(/[:.]/);
 let current: unknown = resources[locale][namespace as keyof typeof resources[typeof locale]];

 for (const segment of path) {
  current = current && typeof current === 'object'
   ? (current as ResourceTree)[segment]
   : undefined;
 }

 assert.equal(typeof current, 'string', `Missing test translation for ${locale}:${key}`);
 return current;
};

const makeT = (locale: keyof typeof resources): TFunction => {
 return ((key: string) => resourceValue(locale, key)) as TFunction;
};

test('English and Simplified Chinese resources expose the same keys', () => {
 const enKeys = Object.entries(resources.en).flatMap(([namespace, resource]) =>
  flattenKeys(resource as ResourceTree).map(key => `${namespace}:${key}`)
 );
 const zhKeys = Object.entries(resources['zh-CN']).flatMap(([namespace, resource]) =>
  flattenKeys(resource as ResourceTree).map(key => `${namespace}:${key}`)
 );

 assert.deepEqual(new Set(zhKeys), new Set(enKeys));
});

test('explicit i18n keys used in source files exist in resources', () => {
 const allKeys = new Set(
  Object.entries(resources.en).flatMap(([namespace, resource]) =>
   flattenKeys(resource as ResourceTree).map(key => `${namespace}:${key}`)
  )
 );
 const missing: string[] = [];

 for (const file of collectSourceFiles('src')) {
  const source = readFileSync(file, 'utf8');
  const explicitKeyPattern = /t\(\s*['"]([A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = explicitKeyPattern.exec(source))) {
   if (!allKeys.has(match[1])) {
    missing.push(`${file}: ${match[1]}`);
   }
  }
 }

 assert.deepEqual(missing, []);
});

test('fallback i18n calls do not mask missing resource keys', () => {
 const allKeys = new Set(
  Object.entries(resources.en).flatMap(([namespace, resource]) =>
   flattenKeys(resource as ResourceTree).map(key => `${namespace}:${key}`)
  )
 );
 const missing: string[] = [];

 for (const file of collectSourceFiles('src')) {
  const source = readFileSync(file, 'utf8');
  const fallbackPattern = /t\(\s*['"]([A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+)['"]\s*,\s*['"][^'"]+['"]/g;
  let match: RegExpExecArray | null;

  while ((match = fallbackPattern.exec(source))) {
   if (!allKeys.has(match[1])) {
    missing.push(`${file}: ${match[1]}`);
   }
  }
 }

 assert.deepEqual(missing, []);
});

test('currency option labels are localized with name, code, and symbol', () => {
 const t = makeT('zh-CN');

 assert.equal(formatCurrencyOptionLabel('CNY', t), '人民币 CNY (¥)');
 assert.equal(formatCurrencyOptionLabel('USD', t), '美元 USD ($)');
});

test('built-in category labels are localized while custom categories stay unchanged', () => {
 const t = makeT('zh-CN');

 assert.equal(getCategoryDisplayName('Entertainment', t), '娱乐');
 assert.equal(getCategoryDisplayName('Uncategorized', t), '未分类');
 assert.equal(getCategoryDisplayName('My Custom Stack', t), 'My Custom Stack');
});
