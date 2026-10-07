import { ArrowUpRight, Download } from 'lucide-react';
import { useAppLanguage } from '../hooks/useAppLanguage';
import { APPLICATION_URL, isLegacyApplicationOrigin } from '../utils/siteUrls';

export function LegacyDomainNotice({ onExport }: { onExport: () => void }) {
  const { language } = useAppLanguage();
  if (!isLegacyApplicationOrigin(window.location.origin)) return null;
  const zh = language === 'zh-CN';

  return (
    <aside className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-5 text-sm text-emerald-950 dark:text-emerald-100" aria-label={zh ? '域名迁移说明' : 'Domain migration'}>
      <p className="font-semibold">{zh ? '我们有了新地址：steadyrenew.com/app' : 'Our new home: steadyrenew.com/app'}</p>
      <p className="mt-2 leading-relaxed">{zh
        ? '云端记录可在新站登录同一账户后同步。仅保存在此浏览器的记录，请先导出 JSON，再到新站导入。旧站会暂时保留；旧域名的通行密钥不能直接用于新域名，请使用其他登录方式。'
        : 'Sign in with the same account on the new site to sync cloud records. For browser-only records, export JSON here and import it on the new site. This old address remains available during the transition. Passkeys from the old domain cannot sign in on the new domain; use another sign-in method.'}</p>
      <div className="flex flex-wrap items-center gap-5 mt-3">
        <button type="button" className="inline-flex items-center gap-2 font-medium underline underline-offset-4" onClick={onExport}><Download size={15} />{zh ? '先导出当前记录' : 'Export current records'}</button>
        <a className="inline-flex items-center gap-2 font-medium underline underline-offset-4" href={APPLICATION_URL} target="_blank" rel="noopener noreferrer">{zh ? '打开新站' : 'Open the new site'}<ArrowUpRight size={15} /></a>
      </div>
    </aside>
  );
}
