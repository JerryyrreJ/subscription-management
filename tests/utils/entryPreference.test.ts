import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPreviousApplicationUsage, prefersApplication } from '../../src/utils/entryPreference.ts';

test('only the exact application preference changes the entry', () => {
  assert.equal(prefersApplication('locale=en; steadyrenew_entry=app; theme=dark'), true);
  for (const cookie of ['', 'steadyrenew_entry=website', 'other_steadyrenew_entry=app', 'steadyrenew_entry=application']) {
    assert.equal(prefersApplication(cookie), false);
  }
});

test('existing local and cloud users get the pre-landing upgrade fallback', () => {
  const empty = () => null;
  for (const key of ['subscription-tracker-data', 'subscription-tracker-last-local-owner']) {
    assert.equal(hasPreviousApplicationUsage(candidate => candidate === key ? 'existing' : null, empty), true);
  }
  const session = (key: string) => key === 'sb-project-auth-token' ? 'existing' : null;
  assert.equal(hasPreviousApplicationUsage(session, empty, 'https://project.supabase.co'), true);
  assert.equal(hasPreviousApplicationUsage(empty, session, 'https://project.supabase.co'), true);
  assert.equal(hasPreviousApplicationUsage(empty, session, 'https://different.supabase.co'), false);
});

test('new visitors, invalid config, and unavailable storage do not fail entry', () => {
  const empty = () => null;
  const blocked = () => { throw new Error('Storage disabled'); };
  assert.equal(hasPreviousApplicationUsage(empty, empty), false);
  assert.equal(hasPreviousApplicationUsage(empty, empty, 'invalid-url'), false);
  assert.equal(hasPreviousApplicationUsage(blocked, blocked, 'https://project.supabase.co'), false);
  assert.equal(hasPreviousApplicationUsage(blocked, key => key === 'sb-project-auth-token' ? 'existing' : null, 'https://project.supabase.co'), true);
});
