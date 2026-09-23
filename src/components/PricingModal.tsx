import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { ArrowDown, ArrowLeft, ArrowUpRight, Check, FileText, Layers3, Loader2, Plus, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { config } from '../lib/config';
import { useAuth } from '../contexts/AuthContext';
import { redirectToCheckout } from '../services/payment';
import { pricingCopy } from './pricing/copy';
import './pricing/pricing.css';

interface PricingModalProps { isOpen: boolean; onClose: () => void; onUpgrade?: () => void }

export function PricingModal({ isOpen, onClose, onUpgrade }: PricingModalProps) {
 useModalScrollLock(isOpen);
 const { i18n } = useTranslation();
 const c = pricingCopy[i18n.language.startsWith('zh') ? 'zh' : 'en'];
 const { session, userProfile, refreshUserProfile } = useAuth();
 const dialog = useRef<HTMLDialogElement>(null);
 const busy = useRef(false);
 const [processing, setProcessing] = useState(false);
 const [error, setError] = useState(false);
 const [timedOut, setTimedOut] = useState(false);
 const premium = Boolean(userProfile?.is_premium);
 const payment = new URLSearchParams(window.location.search).get('payment');
 const verifying = payment === 'success' && !premium;
 const available = config.features.payment && config.features.cloudSync;

 useEffect(() => {
  if (!isOpen) return;
  const element = dialog.current;
  element?.showModal();
  return () => { element?.close(); };
 }, [isOpen]);

 useEffect(() => {
  if (!isOpen || !verifying || !session) return;
  let cancelled = false;
  const refresh = () => { void refreshUserProfile().catch(() => { /* keep pending; never infer payment from URL */ }); };
  refresh();
  const timer = window.setInterval(refresh, 3000);
  const timeout = window.setTimeout(() => {
   window.clearInterval(timer);
   if (!cancelled) setTimedOut(true);
  }, 60_000);
  return () => { cancelled = true; window.clearInterval(timer); window.clearTimeout(timeout); };
 }, [isOpen, verifying, session, refreshUserProfile]);

 const pay = async () => {
  if (busy.current || premium || (verifying && session) || !available) return;
  if (!session) {
   sessionStorage.setItem('pricing-return', '1');
   onUpgrade?.();
   return;
  }
  busy.current = true; setProcessing(true); setError(false);
  try { await redirectToCheckout(session.access_token); }
  catch { setError(true); busy.current = false; setProcessing(false); }
 };

 if (!isOpen) return null;
 const features = [
  { Icon: Sparkles, title: c.ai, note: c.aiNote },
  { Icon: TrendingUp, title: c.reports, note: c.reportsNote },
  { Icon: FileText, title: c.pdf, note: c.pdfNote },
 ];
 const label = premium ? c.active : !available ? c.unavailable : !session ? c.login : verifying ? c.pending
  : processing ? c.processing : c.buy;

 return (
  <dialog ref={dialog} className="pricing-page" aria-labelledby="pricing-title" onCancel={e => { e.preventDefault(); onClose(); }}>
   <div className="pricing-shell">
    <header className="pricing-nav">
     <button className="pricing-back" onClick={onClose} aria-label={c.back}><ArrowLeft size={17} /><span>Subscription Manager<span className="pricing-nav-dot">.</span></span></button>
     <span className="pricing-nav-label">FREE & PREMIUM</span>
    </header>
    <main>
     <section className="pricing-hero">
      <div className="pricing-story">
       <p className="pricing-eyebrow"><span />{c.label}</p>
       <h1 id="pricing-title">{c.title}<br /><em>{c.accent}</em></h1>
       <p className="pricing-intro">{c.intro}</p>
       <a className="pricing-detail-link" href="#pricing-compare">{c.compare}<ArrowDown size={16} /></a>
       <div className="pricing-free-note"><div className="pricing-free-icon"><Layers3 size={23} /></div><div><h2>{c.free}</h2><p>{c.freeNote}</p></div></div>
      </div>
      <div className="pricing-pass-wrap">
       <div className="pricing-pass-shadow" aria-hidden="true" />
       <article className="pricing-pass">
        <div className="pricing-pass-top"><span>{c.pass}</span><Sparkles size={19} /></div>
        <div className="pricing-pass-heading"><h2>Premium</h2><span className="pricing-pill">LIFETIME</span></div>
        <p className="pricing-pass-intro">{c.premiumIntro}</p>
        <div className="pricing-price"><span className="pricing-dollar">$</span><strong>9</strong><span>{c.once}</span></div>
        <div className="pricing-perforation" aria-hidden="true" />
        <p className="pricing-included">{c.included}</p>
        <ul className="pricing-features">{features.map(({Icon, title, note}) => <li key={title}><Icon size={20} /><div><strong>{title}</strong><p>{note}</p></div></li>)}</ul>
        <button className="pricing-buy" onClick={() => void pay()} disabled={!available || processing || premium || (verifying && Boolean(session))}>
         <span>{label}</span>{processing || (verifying && !timedOut) ? <Loader2 className="pricing-spin" size={19} /> : premium ? <Check size={19} /> : <ArrowUpRight size={20} />}
        </button>
        <div aria-live="polite" className="pricing-feedback">
         {error && <p role="alert">{c.error}</p>}
         {verifying && <p>{timedOut ? c.waiting : c.pending}</p>}
         {payment === 'cancelled' && !processing && <p>{c.cancelled}</p>}
        </div>
        <p className="pricing-safe"><ShieldCheck size={14} />{c.secure}</p>
        <p className="pricing-no-renew">{c.noRenew}</p>
       </article>
       <div className="pricing-stamp" aria-hidden="true">{c.stamp}</div>
      </div>
     </section>
     <section id="pricing-compare" className="pricing-comparison">
      <div className="pricing-section-heading"><p className="pricing-eyebrow">{c.detailLabel}</p><h2>{c.detailTitle}</h2><p>{c.detailIntro}</p></div>
      <div className="pricing-table-wrap"><table><thead><tr><th scope="col">{c.capability}</th><th scope="col">Free <small>$0</small></th><th scope="col">Premium <small>$9</small></th></tr></thead><tbody>
       {c.rows.map((row, index) => <tr key={row}><th scope="row">{row}</th><td>{index === 0 ? c.unlimited : index === 5 ? c.api : index === 6 ? '10' : index === 7 ? c.no : <><Check size={17} aria-hidden="true" /><span className="pricing-sr">{c.yes}</span></>}</td><td>{index === 0 ? c.unlimited : index === 5 ? c.api : index === 6 ? '300' : <><Check size={17} aria-hidden="true" /><span className="pricing-sr">{c.yes}</span></>}</td></tr>)}
      </tbody></table></div>
      <div className="pricing-smallprint"><p>{c.limits}</p><p>{c.quota}</p></div>
     </section>
     <section className="pricing-faq"><div><p className="pricing-eyebrow">{c.faqLabel}</p><h2>{c.faqTitle}</h2></div><div>{c.faqs.map(([question, answer]) => <details key={question}><summary>{question}<Plus size={18} /></summary><p>{answer}</p></details>)}</div></section>
    </main>
    <footer className="pricing-footer"><span>Subscription Manager.</span><p>{c.footer}</p><button onClick={onClose}>{c.back}<ArrowUpRight size={14} /></button></footer>
   </div>
  </dialog>
 );
}
