import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { encryptVault, generateRecoveryKey, importRecoveryKey, decryptVault } from '../../src/lib/e2ee/crypto.ts';

// Real embedded PostgreSQL execution, with a minimal Supabase Auth fixture.
// This does not substitute for multi-connection concurrency tests on staging.
test('E2EE migration, rollback, RLS, legacy writes, CAS, and account deletion', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;`);
    const migrationRoot = new URL('../../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(migrationRoot)).filter(f => f.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(file, migrationRoot), 'utf8'));
    }
    const alice = '11111111-1111-4111-8111-111111111111';
    const bob = '22222222-2222-4222-8222-222222222222';
    const sub = '33333333-3333-4333-8333-333333333333';
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [alice, bob]);
    await db.query(`INSERT INTO public.subscriptions(id,user_id,name,category,amount,currency,period,last_payment_date,next_payment_date,status)
      VALUES($1,$2,'Secret service','Private category',12,'USD','monthly','2026-09-01','2026-10-01','paused')`, [sub, alice]);
    await db.query(`INSERT INTO public.user_categories(user_id,category_id,name) VALUES($1,'private','Private category')`, [alice]);
    await db.query(`INSERT INTO public.user_notification_settings(user_id,bark_enabled) VALUES($1,false)`, [alice]);
    await db.query(`INSERT INTO public.api_audit_log(user_id,action,metadata) VALUES($1,'subscription.create','{"name":"Secret service"}')`, [alice]);
    await db.query(`INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash) VALUES($1,'Old API','subm_test',repeat('a',64))`, [alice]);
    const login = async (id: string, role = 'authenticated') => {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec(`SET ROLE ${role}`);
    };
    await login(alice);
    const prepare = async () => (await db.query<{ snapshot: { token: string; snapshot: unknown } }>('SELECT public.prepare_encrypted_vault() AS snapshot')).rows[0].snapshot;
    let prepared = await prepare();
    const key = await importRecoveryKey(generateRecoveryKey());
    let envelope = await encryptVault(key, alice, prepared.snapshot);
    // Simulate another device writing after snapshot capture.
    await db.query("UPDATE public.subscriptions SET amount=13 WHERE id=$1", [sub]);
    await assert.rejects(db.query('SELECT public.enable_encrypted_vault($1,$2)', [prepared.token, envelope]), /Data changed/);
    assert.equal((await db.query('SELECT * FROM public.encrypted_vaults')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.subscriptions')).rows.length, 1);
    prepared = await prepare();
    envelope = await encryptVault(key, alice, prepared.snapshot);
    await assert.rejects(db.query('SELECT public.enable_encrypted_vault($1,$2)', [prepared.token, { version: 1, nonce: 'bad', ciphertext: 'bad' }]));
    assert.equal((await db.query('SELECT * FROM public.subscriptions')).rows.length, 1, 'invalid envelope rolls back plaintext removal');
    await db.query('SELECT public.enable_encrypted_vault($1,$2)', [prepared.token, envelope]);
    assert.equal((await db.query('SELECT * FROM public.subscriptions')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.user_categories')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.user_notification_settings')).rows.length, 0);
    const stored = (await db.query<{ envelope: typeof envelope }>('SELECT envelope FROM public.encrypted_vaults')).rows[0].envelope;
    assert.deepEqual(await decryptVault(key, alice, stored), prepared.snapshot);
    await assert.rejects(db.query('DELETE FROM public.encrypted_vaults'), /permission denied/);
    await assert.rejects(db.query('SELECT public.e2ee_plaintext_snapshot($1)', [bob]), /permission denied/);
    await assert.rejects(db.query(`INSERT INTO public.user_categories(user_id,category_id,name) VALUES($1,'oops','Leaked')`, [alice]), /E2EE enabled/);
    assert.equal((await db.query<{ revision: number }>('SELECT public.save_encrypted_vault(1,$1) AS revision', [envelope])).rows[0].revision, 2);
    await assert.rejects(db.query('SELECT public.save_encrypted_vault(1,$1)', [envelope]), /Vault changed/);
    await login(bob);
    assert.equal((await db.query('SELECT * FROM public.encrypted_vaults')).rows.length, 0, 'RLS hides other vaults');
    await assert.rejects(db.query('SELECT public.save_encrypted_vault(2,$1)', [envelope]), /Vault changed/);
    await db.query(`INSERT INTO public.user_categories(user_id,category_id,name) VALUES($1,'ordinary','Still works')`, [bob]);
    await login('', 'anon');
    await assert.rejects(db.query('SELECT * FROM public.encrypted_vaults'), /permission denied/);
    await assert.rejects(db.query('SELECT public.prepare_encrypted_vault()'), /permission denied/);
    await login('', 'service_role');
    assert.equal((await db.query('SELECT user_id FROM public.encrypted_vaults')).rows.length, 1);
    await assert.rejects(db.query('SELECT envelope FROM public.encrypted_vaults'), /permission denied/);
    assert.equal((await db.query('SELECT * FROM public.api_audit_log')).rows.length, 0, 'historical audit plaintext removed');
    assert.ok((await db.query<{ revoked_at: unknown }>('SELECT revoked_at FROM public.api_keys')).rows[0].revoked_at);
    await assert.rejects(db.query(`INSERT INTO public.subscriptions(user_id,name,category,amount,currency,period,last_payment_date,next_payment_date)
      VALUES($1,'Leak','Other',1,'USD','monthly','2026-09-01','2026-10-01')`, [alice]), /E2EE enabled/);
    await assert.rejects(db.query(`INSERT INTO public.api_audit_log(user_id,action,metadata) VALUES($1,'subscription.create','{"leak":true}')`, [alice]), /E2EE enabled/);
    await assert.rejects(db.query(`INSERT INTO public.user_notification_settings(user_id) VALUES($1)`, [alice]), /E2EE enabled/);
    await assert.rejects(db.query(`INSERT INTO public.api_keys(user_id,name,key_prefix,key_hash) VALUES($1,'New API','subm_test',repeat('b',64))`, [alice]), /E2EE enabled/);
    await db.exec('RESET ROLE');
    await db.query('DELETE FROM auth.users WHERE id=$1', [alice]);
    assert.equal((await db.query('SELECT * FROM public.encrypted_vaults')).rows.length, 0, 'account deletion removes vault');
  } finally { await db.close(); }
});
