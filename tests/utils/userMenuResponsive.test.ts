import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const userMenuSource = readFileSync(
 new URL('../../src/components/UserMenu.tsx', import.meta.url),
 'utf8',
);

test('user menu stays inside narrow mobile viewports', () => {
 assert.match(userMenuSource, /left-0 sm:left-auto sm:right-0/);
 assert.match(userMenuSource, /max-w-\[calc\(100vw-3rem\)\]/);
 assert.match(userMenuSource, /origin-top-left sm:origin-top-right/);
});

test('user menu allows long account labels to wrap', () => {
 assert.match(userMenuSource, /dark:text-white break-words/);
 assert.match(userMenuSource, /dark:text-gray-400 mt-1 break-all/);
});
