import { useEffect } from 'react';
import { legalContact, legalContent, type LegalKind, type LegalLocale } from './content';
import './legal.css';

export default function LegalPage({ kind = 'privacy', locale = 'en' }: { kind?: LegalKind; locale?: LegalLocale }) {
 const c = legalContent[locale][kind];
 const zh = locale === 'zh-CN';
 const prefix = zh ? '/zh' : '';
 useEffect(() => { document.title = `${c.title} — SteadyRenew`; }, [c.title]);
 return (
  <div className="legal-page">
   <a className="legal-skip" href="#legal-main">{zh ? '跳至正文' : 'Skip to content'}</a>
   <header className="legal-header">
    <a className="legal-brand" href={prefix || '/'}>SteadyRenew</a>
    <nav aria-label={zh ? '页面导航' : 'Page navigation'}>
     <a href={`${zh ? '' : '/zh'}/${kind}`} lang={zh ? 'en' : 'zh-CN'}>{zh ? 'English' : '简体中文'}</a>
     <a href="/app">{zh ? '打开应用' : 'Open app'} ↗</a>
    </nav>
   </header>
   <main id="legal-main" className="legal-layout">
    <aside><p>{zh ? '法律与隐私' : 'LEGAL & PRIVACY'}</p><nav aria-label={zh ? '法律页面' : 'Legal pages'}>
     {(['privacy', 'terms'] as const).map(item => <a key={item} href={`${prefix}/${item}`} aria-current={kind === item ? 'page' : undefined}>{legalContent[locale][item].title}</a>)}
    </nav></aside>
    <article>
     <p className="legal-date">{zh ? '更新日期：2026 年 10 月 8 日' : 'Last updated: October 8, 2026'}</p>
     <h1>{c.title}</h1><p className="legal-intro">{c.intro}</p>
     {!legalContact.email && <p role="note" className="legal-draft">{zh ? '草稿：运营者和公开联系邮箱待确认，尚不用于正式发布或 OAuth 审核。' : 'Draft: operator and public contact email await confirmation. Not ready for publication or OAuth review.'}</p>}
     {c.sections.map(([title, body], index) => <section key={title} id={`section-${index + 1}`}><h2><span>{String(index + 1).padStart(2, '0')}</span>{title}</h2><p>{body}</p></section>)}
     <section><h2>{zh ? '联系我们' : 'Contact'}</h2>
      {legalContact.email ? <p>{legalContact.operator ? `${legalContact.operator} · ` : ''}<a href={`mailto:${legalContact.email}`}>{legalContact.email}</a></p> : <p>{zh ? '待确认对外运营者名称及隐私、服务和退款联系邮箱。' : 'Public operator name and contact email for privacy, service, and refund requests are pending confirmation.'}</p>}
     </section>
     <footer><a href={`${prefix}/${kind === 'privacy' ? 'terms' : 'privacy'}`}>{legalContent[locale][kind === 'privacy' ? 'terms' : 'privacy'].title} →</a><p>© 2026 SteadyRenew</p></footer>
    </article>
   </main>
  </div>
 );
}
