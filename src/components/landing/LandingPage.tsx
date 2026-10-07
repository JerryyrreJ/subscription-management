import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  Cloud,
  Code2,
  CreditCard,
  Download,
  Globe2,
  Layers3,
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
import './landing.css';

type Copy = typeof landingCopy.en;
const samples = [
  { name: 'Netflix', symbol: 'N', amount: 15.49, className: 'netflix' },
  { name: 'Spotify', symbol: '≋', amount: 10.99, className: 'spotify' },
  { name: 'iCloud+', symbol: 'cloud', amount: 2.99, className: 'icloud' },
  { name: 'Notion', symbol: 'N', amount: 10, className: 'notion' },
];
const appUrl = resolveAppUrl(import.meta.env.VITE_APP_URL);
const monthlyTotal = samples.reduce((sum, sample) => sum + sample.amount, 0);

function Brand() {
  return (
    <span className="landing-brand">
      <span className="landing-brand-mark">
        <Layers3 size={19} strokeWidth={1.7} />
      </span>
      <span>
        SteadyRenew
        <span className="landing-brand-dot">.</span>
      </span>
    </span>
  );
}

function ProductPreview({ c }: { c: Copy }) {
  const [yearly, setYearly] = useState(false);
  return (
    <figure className="landing-preview" aria-label={c.preview}>
      <div className="landing-preview-topline">
        <span>
          <span className="landing-status-dot" />
          {c.preview}
        </span>
        <span>{c.example}</span>
      </div>
      <div className="landing-preview-window">
        <div className="landing-preview-toolbar">
          <Brand />
          <span className="landing-preview-avatar" aria-hidden="true">
            J
          </span>
        </div>
        <div className="landing-demo-overview">
          <div className="landing-demo-total">
            <div className="landing-demo-total-header">
              <span>
                <CreditCard size={15} />
                {c.overview}
              </span>
              <div
                className="landing-period"
                role="group"
                aria-label={c.period}
              >
                <button
                  type="button"
                  aria-pressed={!yearly}
                  onClick={() => setYearly(false)}
                >
                  {c.monthly}
                </button>
                <button
                  type="button"
                  aria-pressed={yearly}
                  onClick={() => setYearly(true)}
                >
                  {c.yearly}
                </button>
              </div>
            </div>
            <p>{yearly ? c.yearTotal : c.monthTotal}</p>
            <div className="landing-demo-amount" aria-live="polite">
              <span>$</span>
              {(monthlyTotal * (yearly ? 12 : 1)).toFixed(2)}
              <small>USD</small>
            </div>
            <span className="landing-demo-active">
              <span className="landing-status-dot" />
              {c.active}
            </span>
          </div>
          <div className="landing-demo-upcoming">
            <span className="landing-micro-label">
              <Bell size={13} />
              {c.next}
            </span>
            <div className="landing-upcoming-row">
              <span className="landing-service-icon spotify">≋</span>
              <div>
                <strong>Spotify</strong>
                <span>{c.tomorrow}</span>
              </div>
              <b>$10.99</b>
            </div>
            <div className="landing-upcoming-row">
              <span className="landing-service-icon icloud">
                <Cloud size={19} />
              </span>
              <div>
                <strong>iCloud+</strong>
                <span>{c.inFive}</span>
              </div>
              <b>$2.99</b>
            </div>
          </div>
        </div>
        <div className="landing-demo-list-heading">
          <h3>{c.subscriptions}</h3>
          <span>
            {c.all}
            <ChevronDown size={12} />
          </span>
        </div>
        <div className="landing-demo-cards">
          {samples.map((sample, index) => (
            <div className="landing-demo-card" key={sample.name}>
              <div className="landing-demo-card-top">
                <span className={`landing-service-icon ${sample.className}`}>
                  {sample.symbol === 'cloud' ? (
                    <Cloud size={22} />
                  ) : (
                    sample.symbol
                  )}
                </span>
                <span className="landing-demo-category">
                  {c.categories[index]}
                </span>
              </div>
              <h4>{sample.name}</h4>
              <p className="landing-demo-card-price">
                ${(sample.amount * (yearly ? 12 : 1)).toFixed(2)}
                <span>{yearly ? c.perYear : c.perMonth}</span>
              </p>
              <div className="landing-demo-card-date">
                <span>{c.renews}</span>
                <span>{c.dates[index]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption>
        <span>{c.previewNote}</span>
        <span>{c.previewAside}</span>
      </figcaption>
    </figure>
  );
}

export default function LandingPage() {
  const { language, setLanguage } = useAppLanguage();
  const c = landingCopy[language];
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || saved === 'light'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  });
  const guidesUrl = language === 'zh-CN' ? '/zh/blog' : '/blog';
  const pricingUrl = new URL(appUrl, window.location.origin);
  pricingUrl.pathname = '/pricing';
  const docsUrl = getDocumentationUrl('user-guide/agent-setup', language);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.title = c.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', c.description);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute('content', c.title);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute('content', c.description);
  }, [c]);

  return (
    <div className="landing-page" lang={language}>
      <a className="landing-skip" href="#main">
        {c.skip}
      </a>
      <header className="landing-header landing-shell">
        <a href="/" aria-label="SteadyRenew">
          <Brand />
        </a>
        <nav
          className="landing-nav"
          aria-label={language === 'zh-CN' ? '主导航' : 'Main navigation'}
        >
          <a href="#features">{c.features}</a>
          <a href="#pricing">{c.pricing}</a>
          <a href={guidesUrl}>{c.guides}</a>
        </nav>
        <div className="landing-header-actions">
          <button
            className="landing-icon-button landing-language"
            type="button"
            onClick={() =>
              void setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')
            }
            aria-label={
              language === 'zh-CN' ? 'Switch to English' : '切换到简体中文'
            }
          >
            <Globe2 size={15} />
            <span>{language === 'zh-CN' ? 'EN' : '中'}</span>
          </button>
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
          <ProductPreview c={c} />
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
              <div className="landing-feature-art landing-reminder-art">
                <div className="landing-reminder-orbit" aria-hidden="true" />
                <div className="landing-reminder">
                  <div className="landing-reminder-meta">
                    <span>
                      <span className="landing-notification-icon">
                        <Layers3 size={12} />
                      </span>
                      {c.reminderApp}
                    </span>
                    <span>{c.reminderTime}</span>
                  </div>
                  <strong>{c.reminderExample}</strong>
                  <p>{c.reminderDetail}</p>
                </div>
                <span className="landing-bell-badge" aria-hidden="true">
                  <Bell size={21} strokeWidth={1.5} />
                </span>
              </div>
              <div className="landing-feature-copy">
                <span className="landing-feature-index">01 — REMIND</span>
                <h3>{c.reminderTitle}</h3>
                <p>{c.reminderBody}</p>
              </div>
            </article>
            <article className="landing-feature-card">
              <div className="landing-feature-art landing-capture-art">
                <div className="landing-capture-prompt">
                  <Sparkles size={15} />
                  <span>{c.capturePrompt}</span>
                </div>
                <span
                  className="landing-capture-connector"
                  aria-hidden="true"
                />
                <div className="landing-capture-draft">
                  <div>
                    <span className="landing-service-icon netflix">N</span>
                    <span>
                      <strong>Netflix</strong>
                      <small>{c.captureField}</small>
                    </span>
                    <b>$15.49</b>
                  </div>
                  <p>
                    <Check size={12} />
                    {c.captureDraft}
                  </p>
                </div>
              </div>
              <div className="landing-feature-copy">
                <span className="landing-feature-index">02 — CAPTURE</span>
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
            <div className="landing-tools-visual">
              <div className="landing-tools-node">
                <Layers3 size={30} strokeWidth={1.3} />
                <span>SteadyRenew</span>
              </div>
              <div className="landing-tools-line" aria-hidden="true" />
              <div className="landing-tools-clients">
                <span>
                  <Sparkles size={16} />
                  Claude
                </span>
                <span>
                  <Code2 size={16} />
                  Codex
                </span>
                <span>
                  <span className="landing-mcp-symbol">⌘</span>MCP
                </span>
              </div>
              <p>{c.toolsNote}</p>
            </div>
          </div>
        </section>
        <section
          id="pricing"
          className="landing-pricing landing-shell"
          aria-labelledby="pricing-title"
        >
          <div className="landing-centered-heading">
            <p className="landing-eyebrow">{c.priceLabel}</p>
            <h2 id="pricing-title">
              {c.priceTitle}
              <br />
              <em>{c.priceAccent}</em>
            </h2>
            <p>{c.priceIntro}</p>
          </div>
          <div className="landing-plans">
            <article className="landing-plan">
              <div className="landing-plan-title">
                <h3>{c.free}</h3>
                <span>THE ESSENTIALS</span>
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
                <span>THE LIFETIME PASS</span>
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
              <a className="landing-button" href={pricingUrl.toString()}>
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
          <span className="landing-closing-mark" aria-hidden="true">
            <Layers3 size={25} strokeWidth={1.3} />
          </span>
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
          <a href="/" aria-label="SteadyRenew">
            <Brand />
          </a>
          <p>{c.footer}</p>
        </div>
        <div className="landing-footer-right">
          <nav
            aria-label={language === 'zh-CN' ? '页脚导航' : 'Footer navigation'}
          >
            <a href={guidesUrl}>{c.guides}</a>
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
