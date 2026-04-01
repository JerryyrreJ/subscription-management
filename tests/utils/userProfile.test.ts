import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_USER_NICKNAME, resolveUserProfileNickname } from '../../src/utils/userProfile.ts';

test('resolveUserProfileNickname keeps a valid nickname from auth metadata', () => {
 assert.equal(resolveUserProfileNickname('Alice'), 'Alice');
});

test('resolveUserProfileNickname falls back to the default nickname for invalid values', () => {
 assert.equal(resolveUserProfileNickname(''), DEFAULT_USER_NICKNAME);
 assert.equal(resolveUserProfileNickname('a'), DEFAULT_USER_NICKNAME);
 assert.equal(resolveUserProfileNickname(' '.repeat(5)), DEFAULT_USER_NICKNAME);
 assert.equal(resolveUserProfileNickname(undefined), DEFAULT_USER_NICKNAME);
});
