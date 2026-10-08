import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  Cloud,
  Download,
  Globe2,
  Moon,
  Plus,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useAppLanguage } from '../../hooks/useAppLanguage';
import type { Theme } from '../../types';
import { resolveAppUrl } from '../../utils/siteRouting';
import { landingCopy } from './copy';
import { getDocumentationUrl } from '../../lib/site';
import { MARKETING_ORIGIN } from '../../utils/siteUrls';
import './landing.css';

type Copy = typeof landingCopy.en;
const appUrl = resolveAppUrl(import.meta.env.VITE_APP_URL);

function Brand() {
  return <span className="landing-brand"><img src="/icon.png" alt="" width="32" height="32" />SteadyRenew</span>;
}

function ProductPreview({ c, language, theme }: { c: Copy; language: string; theme: Theme }) {
  return (
    <figure className="landing-preview">
      <a href={`/product-${language}-${theme}.jpg`} target="_blank" rel="noreferrer" aria-label={c.previewZoom}>
        <img className="landing-product-image" src={`/product-${language}-${theme}.jpg`} alt={c.previewAlt} width="1440" height="860" fetchPriority="high" />
      </a>
      <figcaption>{c.example}</figcaption>
    </figure>
  );
}

export default function LandingPage({ pricingOnly = false }: { pricingOnly?: boolean } = {}) {
  const { language } = useAppLanguage();
  const c = landingCopy[language];
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || saved === 'light'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  });
  const guidesUrl = language === 'zh-CN' ? '/zh/blog' : '/blog';
  const homeUrl = language === 'zh-CN' ? '/zh' : '/about';
  const publicPricingUrl = language === 'zh-CN' ? '/zh/pricing' : '/pricing';
  const pricingUrl = new URL(appUrl, typeof window === 'undefined' ? MARKETING_ORIGIN : window.location.origin);
  pricingUrl.searchParams.set('pricing', '1');
  const PriceHeading = pricingOnly ? 'h1' : 'h2';
  const docsUrl = getDocumentationUrl('user-guide/agent-setup', language);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.title = pricingOnly ? `${c.pricing} — SteadyRenew` : c.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', pricingOnly ? c.priceIntro : c.description);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute('content', pricingOnly ? `${c.pricing} — SteadyRenew` : c.title);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute('content', pricingOnly ? c.priceIntro : c.description);
  }, [c, pricingOnly]);

  return (
    <div className="landing-page" lang={language}>
      <a className="landing-skip" href="#main">
        {c.skip}
      </a>
      <header className="landing-header landing-shell">
        <a href={homeUrl} aria-label="SteadyRenew">
          <Brand />
        </a>
        <nav
          className="landing-nav"
          aria-label={language === 'zh-CN' ? '主导航' : 'Main navigation'}
        >
          <a href={pricingOnly ? `${homeUrl}#features` : '#features'}>{c.features}</a>
          <a href={publicPricingUrl}>{c.pricing}</a>
          <a href={getDocumentationUrl("index", language)}>{c.docs}</a>
        </nav>
        <div className="landing-header-actions">
          <a
            className="landing-icon-button landing-language"
            href={language === 'zh-CN' ? (pricingOnly ? '/pricing' : '/about') : (pricingOnly ? '/zh/pricing' : '/zh')}
            aria-label={
              language === 'zh-CN' ? 'Switch to English' : '切换到简体中文'
            }
          >
            <Globe2 size={15} />
            <span>{language === 'zh-CN' ? 'EN' : '中'}</span>
          </a>
          <button
            className="landing-icon-button"
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={
              language === 'zh-CN'
                ? theme === 'light'
                  ? '切换到深色模式'
                  : '切换到浅色模式'
                : theme === 'light'
                  ? 'Switch to dark mode'
                  : 'Switch to light mode'
            }
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <a className="landing-nav-cta" href={appUrl}>
            {c.open}
            <ArrowUpRight size={15} />
          </a>
        </div>
      </header>
      <main id="main">
        {!pricingOnly && <>
        <section
          className="landing-hero landing-shell"
          aria-labelledby="hero-title"
        >
          <p className="landing-eyebrow">
            <span className="landing-status-dot" />
            {c.eyebrow}
          </p>
          <h1 id="hero-title">
            {c.headline}
            <br />
            <em>{c.accent}</em>
          </h1>
          <p className="landing-hero-intro">{c.intro}</p>
          <div className="landing-hero-actions">
            <a className="landing-button" href={appUrl}>
              {c.start}
              <ArrowUpRight size={17} />
            </a>
            <a className="landing-text-link" href="#preview">
              {c.explore}
              <ArrowDown size={15} />
            </a>
          </div>
          <p className="landing-reassurance">{c.reassurance}</p>
        </section>
        <div id="preview" className="landing-shell">
          <ProductPreview c={c} language={language} theme={theme} />
        </div>
        <div className="landing-benefits landing-shell">
          {c.benefits.map((benefit) => (
            <span key={benefit}>
              <Check size={15} />
              {benefit}
            </span>
          ))}
        </div>
        <section
          id="features"
          className="landing-features landing-shell"
          aria-labelledby="features-title"
        >
          <div className="landing-section-heading">
            <div>
              <p className="landing-eyebrow">{c.featureLabel}</p>
              <h2 id="features-title">
                {c.featureTitle}
                <br />
                <em>{c.featureAccent}</em>
              </h2>
            </div>
            <p>{c.featureIntro}</p>
          </div>
          <div className="landing-feature-grid">
            <article className="landing-feature-card">
              <Bell className="landing-feature-icon" size={24} aria-hidden="true" />
              <div className="landing-feature-copy">
                <h3>{c.reminderTitle}</h3>
                <p>{c.reminderBody}</p>
              </div>
            </article>
            <article className="landing-feature-card">
              <Sparkles className="landing-feature-icon" size={24} aria-hidden="true" />
              <div className="landing-feature-copy">
                <h3>{c.captureTitle}</h3>
                <p>{c.captureBody}</p>
              </div>
            </article>
          </div>
          <div className="landing-small-features">
            {c.smallFeatures.map(([title, body], index) => {
              const Icon = [Globe2, Cloud, Download][index];
              return (
                <article key={title}>
                  <Icon size={23} strokeWidth={1.4} />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section
          className="landing-tools landing-shell"
          aria-labelledby="tools-title"
        >
          <div className="landing-tools-panel">
            <div>
              <p className="landing-eyebrow">{c.toolsLabel}</p>
              <h2 id="tools-title">{c.toolsTitle}</h2>
              <p className="landing-tools-description">{c.toolsBody}</p>
              <a
                className="landing-text-link"
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
              >
                {c.toolsLink}
                <ArrowUpRight size={15} />
              </a>
            </div>
            <div className="landing-tools-visual" role="img" aria-label={c.toolsDiagram}>
              <div className="landing-tools-node"><Brand /></div>
              <div className="landing-tools-line" aria-hidden="true" />
              <div className="landing-tools-protocol">MCP</div>
              <div className="landing-tools-line" aria-hidden="true" />
              <div className="landing-tools-clients">
                <span>Claude</span>
                <span>ChatGPT</span>
                <span>Gemini</span>
              </div>
              <p>{c.toolsNote}</p>
            </div>
          </div>
        </section>
        </>}
        <section
          id="pricing"
          className="landing-pricing landing-shell"
          aria-labelledby="pricing-title"
        >
          <div className="landing-centered-heading">
            <p className="landing-eyebrow">{c.priceLabel}</p>
            <PriceHeading id="pricing-title">
              {c.priceTitle}
              <br />
              <em>{c.priceAccent}</em>
            </PriceHeading>
            <p>{c.priceIntro}</p>
          </div>
          <div className="landing-plans">
            <article className="landing-plan">
              <div className="landing-plan-title">
                <h3>{c.free}</h3>
              </div>
              <p>{c.freeSubtitle}</p>
              <div className="landing-price">
                <span>$</span>
                <strong>0</strong>
                <span>{c.forever}</span>
              </div>
              <ul>
                {c.freeItems.map((item) => (
                  <li key={item}>
                    <Check size={15} />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                className="landing-button landing-button-outline"
                href={appUrl}
              >
                {c.start}
                <ArrowUpRight size={16} />
              </a>
            </article>
            <article className="landing-plan landing-plan-premium">
              <div className="landing-plan-title">
                <h3>Premium</h3>
              </div>
              <p>{c.premium}</p>
              <div className="landing-price">
                <span>$</span>
                <strong>9</strong>
                <span>{c.once}</span>
              </div>
              <ul>
                {c.premiumItems.map((item) => (
                  <li key={item}>
                    <Check size={15} />
                    {item}
                  </li>
                ))}
              </ul>
              <a className="landing-button" href={pricingOnly ? pricingUrl.toString() : publicPricingUrl}>
                {c.priceLink}
                <ArrowUpRight size={16} />
              </a>
            </article>
          </div>
          <p className="landing-price-note">{c.priceNote}</p>
        </section>
        <section
          className="landing-faq landing-shell"
          aria-labelledby="faq-title"
        >
          <div>
            <p className="landing-eyebrow">{c.faqLabel}</p>
            <h2 id="faq-title">{c.faqTitle}</h2>
          </div>
          <div>
            {c.faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus size={17} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="landing-closing landing-shell">
          <h2>
            {c.closing}
            <br />
            <em>{c.closingAccent}</em>
          </h2>
          <p>{c.closingNote}</p>
          <a className="landing-button" href={appUrl}>
            {c.start}
            <ArrowRight size={16} />
          </a>
        </section>
      </main>
      <footer className="landing-footer landing-shell">
        <div>
          <a href={homeUrl} aria-label="SteadyRenew">
            <Brand />
          </a>
          <p>{c.footer}</p>
        </div>
        <div className="landing-footer-right">
          <nav
            aria-label={language === 'zh-CN' ? '页脚导航' : 'Footer navigation'}
          >
            <a href={guidesUrl}>{c.guides}</a>
            <a href={getDocumentationUrl("index", language)}>{c.docs}</a>
            <a
              href="https://github.com/JerryyrreJ/subscription-management"
              target="_blank"
              rel="noreferrer"
            >
              {c.source}
              <ArrowUpRight size={12} />
            </a>
            <a href={appUrl}>
              {c.open}
              <ArrowUpRight size={12} />
            </a>
          </nav>
          <p>
            © {new Date().getFullYear()} · {c.madeBy}
          </p>
        </div>
      </footer>
    </div>
  );
}
