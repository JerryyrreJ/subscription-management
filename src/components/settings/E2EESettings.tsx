import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { generateRecoveryKey, normalizeRecoveryKey, importRecoveryKey, encryptVault, decryptVault } from '../../lib/e2ee/crypto';
import { vaultEnabled, fetchVault, type VaultData } from '../../lib/e2ee/vault';
import { protectLocalAccount } from '../../lib/e2ee/storage';
import { SubscriptionService, type SupabaseSubscription } from '../../services/subscriptionService';
import { CategoryService, type SupabaseCategory } from '../../services/categoryService';
import { loadPendingSyncOperations, loadSubscriptions } from '../../utils/storage';
import { loadPendingCategorySync } from '../../utils/categories';
import { getUserDataScope } from '../../utils/dataScope';

export function E2EESettings() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const [secret, setSecret] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enabled = vaultEnabled();
  if (!user) return null;
  const enable = async () => {
    if (!supabase || normalizeRecoveryKey(secret) !== normalizeRecoveryKey(confirmation)) return;
    setBusy(true); setError('');
    try {
      const scope = getUserDataScope(user.id);
      if (loadPendingSyncOperations(scope).length || loadPendingCategorySync(scope)) throw new Error(zh ? '请先同步尚未上传的更改，然后重试。' : 'Sync all pending changes before enabling encryption.');
      const { data: prepared, error: prepareError } = await supabase.rpc('prepare_encrypted_vault');
      if (prepareError) throw prepareError;
      const snapshot = prepared.snapshot as { subscriptions: SupabaseSubscription[]; categories: SupabaseCategory[] };
      const ids = new Set(snapshot.subscriptions.map(s => s.id));
      if (loadSubscriptions(scope).some(s => !ids.has(s.id))) throw new Error(zh ? '存在尚未上传的本地订阅。请先同步。' : 'Some local subscriptions are not uploaded. Sync first.');
      const payload: VaultData = {
        version: 1,
        subscriptions: snapshot.subscriptions.map(SubscriptionService.transformFromSupabase),
        categories: snapshot.categories.map(CategoryService.transformFromSupabase),
      };
      const key = await importRecoveryKey(secret);
      const envelope = await encryptVault(key, user.id, payload);
      // Confirm the backup key decrypts the complete migration before removing plaintext.
      if (JSON.stringify(await decryptVault(key, user.id, envelope)) !== JSON.stringify(payload)) throw new Error('Encryption verification failed');
      const { error: enableError } = await supabase.rpc('enable_encrypted_vault', { p_snapshot_token: prepared.token, p_envelope: envelope });
      if (enableError) throw enableError;
      protectLocalAccount(user.id);
      setSecret(''); setConfirmation('');
      window.dispatchEvent(new Event('e2ee-changed'));
    } catch (cause) {
      // A timeout can happen after commit. Check authoritative state before allowing retry.
      try {
        if (await fetchVault(user.id)) {
          protectLocalAccount(user.id); setSecret(''); setConfirmation('');
          window.dispatchEvent(new Event('e2ee-changed')); return;
        }
      } catch { /* Keep the saved key; no success or plaintext-mode claim. */ }
      setError(cause instanceof Error ? cause.message : (zh ? '操作未完成。请保留密钥并重试；如状态不明，请刷新后检查。' : 'Operation incomplete. Keep your key and retry; refresh to verify an uncertain result.'));
    } finally { setBusy(false); }
  };
  return <section className="space-y-4 text-gray-900 dark:text-white">
    <h2 className="text-2xl font-semibold">{zh ? '端到端加密' : 'End-to-end encryption'}</h2>
    <div className="flex items-center justify-between gap-4">
      <p>{enabled ? (zh ? '已启用 · 所有设备' : 'Enabled · all devices') : (zh ? '未启用' : 'Not enabled')}</p>
      <button type="button" role="switch" aria-checked={enabled} aria-label={zh ? '端到端加密' : 'End-to-end encryption'} disabled={enabled || busy || Boolean(secret)} onClick={() => { setSecret(generateRecoveryKey()); setError(''); }} className={`w-12 h-7 rounded-full p-1 ${enabled ? 'bg-emerald-600' : 'bg-gray-400'}`}>
        <span className={`block w-5 h-5 bg-white rounded-full ${enabled ? 'translate-x-5' : ''}`} />
      </button>
    </div>
    <p>{zh ? '订阅详情和自定义分类仅在设备上解密。登录邮箱、账号资料及同步时间不在加密范围内。' : 'Subscription details and custom categories are decrypted only on your devices. Login email, account profile and sync timestamps are outside this encryption scope.'}</p>
    <p>{zh ? '此版本启用后不支持关闭。云端 Bark 提醒、AI 录入及普通 API/MCP 暂停；现有 API 密钥会撤销。加密模式需要联网保存，不保留离线草稿。' : 'This version cannot turn encryption off. Cloud Bark reminders, AI capture and ordinary API/MCP access are paused; existing API keys are revoked. Encrypted mode requires an online connection to save and does not retain offline drafts.'}</p>
    <p>{zh ? '旧版客户端需要升级。旧设备缓存、历史备份和已发送的通知不会被远程抹除。请关闭其他标签页，并先同步所有设备上的未保存更改。' : 'Older clients must upgrade. Old-device caches, historical backups and delivered notifications cannot be remotely erased. Close other tabs and sync pending changes on all devices first.'}</p>
    {enabled && <button className="rounded-xl border px-4 py-2" onClick={() => window.dispatchEvent(new Event('e2ee-changed'))}>{zh ? '锁定保险箱' : 'Lock vault'}</button>}
    {secret && <div className="rounded-2xl border p-5 space-y-4">
      <p className="font-semibold">{zh ? '保存恢复密钥。丢失后，我们无法恢复你的订阅。' : 'Save your recovery key. If lost, we cannot recover your subscriptions.'}</p>
      <p className="break-all font-mono select-all rounded-lg bg-gray-100 dark:bg-gray-900 p-3">{secret}</p>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(secret); } catch { setError(zh ? '复制失败，请手动选择并保存密钥。' : 'Copy failed. Select and save the key manually.'); }
      }}>{zh ? '复制密钥' : 'Copy key'}</button>
      <label className="block">{zh ? '粘贴已保存的密钥以确认' : 'Paste your saved key to confirm'}
        <input type="password" autoComplete="off" spellCheck={false} className="mt-2 w-full border rounded-xl p-3 bg-transparent" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
      </label>
      <button disabled={busy || !confirmation || normalizeRecoveryKey(secret) !== normalizeRecoveryKey(confirmation)} onClick={() => void enable()} className="rounded-xl bg-emerald-600 disabled:opacity-40 text-white px-4 py-3">{zh ? '我已保存密钥，启用并加密现有数据' : 'I saved my key — enable and encrypt existing data'}</button>
      <button disabled={busy} className="ml-3" onClick={() => { setSecret(''); setConfirmation(''); }}>{zh ? '取消' : 'Cancel'}</button>
    </div>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {busy && <div role="status" aria-live="polite" className="fixed inset-0 z-[200] bg-black/70 grid place-items-center text-white p-8"><p>{zh ? '正在加密并迁移，请勿关闭页面…' : 'Encrypting and migrating. Keep this page open…'}</p></div>}
  </section>;
}
