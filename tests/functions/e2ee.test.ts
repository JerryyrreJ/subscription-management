import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requirePlaintextAccount } from '../../netlify/functions/_shared/e2ee.ts';
import { createFakeSupabaseClient } from './apiTestHelpers.ts';

test('ordinary accounts can use plaintext integrations; encrypted accounts cannot', async () => {
  const db = createFakeSupabaseClient(() => ({ data: null, error: null }), undefined, ['encrypted']);
  await requirePlaintextAccount(db, 'ordinary');
  await assert.rejects(requirePlaintextAccount(db, 'encrypted'), { code: 'e2ee_enabled', statusCode: 423 });
});

test('integration guard fails closed when checking encryption state fails', async () => {
  const failure = new Error('database unavailable');
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: failure }) }) }) }) } as unknown as SupabaseClient;
  await assert.rejects(requirePlaintextAccount(db, 'any-user'), failure);
});
