import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { App } from '../App';
import { fetchVault, vaultEnabled, lockVault, setVaultAccount, unlockVault, vaultUnlocked } from '../lib/e2ee/vault';
import { modeKey } from '../lib/e2ee/storage';
import { supabase } from '../lib/supabase';

function AccountGate({ userId }: { userId: string | null }) {
  const { signOut, passwordRecoveryPending } = useAuth();
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const [status, setStatus] = useState<'checking' | 'plain' | 'locked' | 'open' | 'error'>('checking');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setVaultAccount(null);
    const check = async () => {
      try {
        if (!userId || !supabase) { if (active) setStatus('plain'); return; }
        const row = await fetchVault(userId);
        if (!active) return;
        if (!row && localStorage.getItem(modeKey(userId)) === 'enabled') throw new Error('Encrypted vault missing');
        setVaultAccount(row ? userId : null);
        setStatus(row ? 'locked' : 'plain');
      } catch { if (active) setStatus('error'); }
    };
    void check();
    const recheck = () => { lockVault(); setStatus('checking'); void check(); };
    const storageChanged = (event: StorageEvent) => {
      if (userId && event.key === modeKey(userId)) recheck();
    };
    // bfcache must not restore an unlocked page after navigation.
    const pageHide = () => { lockVault(); setStatus('checking'); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) recheck(); };
    const detectRemoteEnablement = async () => {
      if (!userId || vaultEnabled()) return;
      try {
        const row = await fetchVault(userId);
        if (active && row && !vaultEnabled()) recheck();
      } catch { /* Writes still verify mode and the database always enforces it. */ }
    };
    const interval = window.setInterval(() => void detectRemoteEnablement(), 30000);
    window.addEventListener('focus', detectRemoteEnablement);
    window.addEventListener('e2ee-changed', recheck);
    window.addEventListener('storage', storageChanged);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    return () => {
      active = false; setVaultAccount(null);
      window.clearInterval(interval);
      window.removeEventListener('focus', detectRemoteEnablement);
      window.removeEventListener('e2ee-changed', recheck);
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', pageShow);
    };
  }, [userId, retry]);
  // Auth recovery is independent of vault recovery; keep its existing UI available.
  if (passwordRecoveryPending) return <App />;
  if (status === 'plain' || (status === 'open' && userId && vaultUnlocked(userId))) return <App />;
  const unlock = async (event: FormEvent) => {
    event.preventDefault(); if (!userId) return;
    setBusy(true); setError('');
    const entered = secret; setSecret('');
    try { await unlockVault(userId, entered); setStatus('open'); }
    catch { setError(zh ? '无法解锁。请检查恢复密钥及网络连接。' : 'Could not unlock. Check your recovery key and connection.'); }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen grid place-items-center bg-gray-50 dark:bg-gray-900 p-6">
    <section className="w-full max-w-lg rounded-3xl bg-white dark:bg-gray-800 p-8 space-y-5 text-gray-900 dark:text-white shadow-lg">
      <h1 className="text-2xl font-semibold">{zh ? '订阅保险箱' : 'Subscription vault'}</h1>
      {status === 'checking' ? <p>{zh ? '正在检查加密状态…' : 'Checking encryption status…'}</p> : status === 'error' ? <>
        <p role="alert">{zh ? '无法确认账号加密状态。为保护数据，暂不加载订阅。请检查网络，并确认数据库迁移已部署。' : 'Unable to verify encryption status. Subscriptions remain closed. Check your connection and that the database migration is deployed.'}</p>
        <button onClick={() => { setStatus('checking'); setRetry(n => n + 1); }}>{zh ? '重试' : 'Retry'}</button>
      </> : <form onSubmit={unlock} className="space-y-4">
        <p>{zh ? '输入保存的恢复密钥，在此设备解锁。我们无法替你找回密钥。刷新或退出后需要重新解锁。' : 'Enter your saved recovery key to unlock on this device. We cannot recover it. Refreshing or signing out locks the vault.'}</p>
        <label className="block">{zh ? '恢复密钥' : 'Recovery key'}
          <input className="mt-2 w-full rounded-xl border p-3 bg-transparent" type="password" value={secret} autoComplete="off" spellCheck={false} onChange={e => setSecret(e.target.value)} required disabled={busy} />
        </label>
        <button className="rounded-xl bg-emerald-600 text-white px-5 py-3" disabled={busy}>{zh ? '解锁' : 'Unlock'}</button>
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </form>}
      <button disabled={busy} onClick={() => { lockVault(); void signOut(); }}>{zh ? '退出账号' : 'Sign out'}</button>
    </section>
  </main>;
}
export function E2EEGate() {
  const { user, loading } = useAuth();
  if (loading) return <div role="status" className="p-8">Loading…</div>;
  return <AccountGate key={user?.id ?? 'guest'} userId={user?.id ?? null} />;
}
