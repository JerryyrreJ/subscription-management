import { Suspense, lazy, type ComponentType } from 'react';
import type { SupportedLocale } from './i18n/types';
import { getPublicPage } from './utils/publicPages';
import { setStoredLocale } from './utils/locale';
import { isApplicationEntry, resolveAppUrl } from './utils/siteRouting';
import { rememberApplicationEntry, shouldOpenApplication } from './lib/entryPreference';

import type { LegalKind, LegalLocale } from './components/legal/content';

type LandingPageProps = { pricingOnly?: boolean; locale?: SupportedLocale };
type LegalPageProps = { kind?: LegalKind; locale?: LegalLocale };

const appUrl = resolveAppUrl(import.meta.env.VITE_APP_URL);
const applicationEntry = isApplicationEntry(
  new URL(window.location.href),
  appUrl,
) || (window.location.pathname === '/' && shouldOpenApplication());
const publicPage = getPublicPage(window.location.pathname);
const isLegalRoute = !applicationEntry && (publicPage?.kind === 'privacy' || publicPage?.kind === 'terms');
if (!applicationEntry && publicPage) {
  document.documentElement.lang = publicPage.locale;
  setStoredLocale(publicPage.locale);
}
if (applicationEntry) {
  rememberApplicationEntry();
  document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, follow');
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${window.location.origin}/app`);
}
// Preserve legacy auth/payment links and keep reloads in the app after cleanup.
if (applicationEntry && window.location.pathname === '/') {
  window.history.replaceState(
    {},
    '',
    '/app' + window.location.search + window.location.hash,
  );
}

let ResolvedLandingPage: ComponentType<LandingPageProps> | null = null;
const loadLandingPage = () =>
  import('./components/landing/LandingPage').then((mod) => {
    ResolvedLandingPage = mod.default;
    return mod;
  });

let ResolvedLegalPage: ComponentType<LegalPageProps> | null = null;
const loadLegalPage = () =>
  import('./components/legal/LegalPage').then((mod) => {
    ResolvedLegalPage = mod.default;
    return mod;
  });

// eslint-disable-next-line react-refresh/only-export-components
export const entryPageReady = applicationEntry
  ? Promise.resolve()
  : isLegalRoute
    ? loadLegalPage().then(() => undefined)
    : loadLandingPage().then(() => undefined);

const LazyApplication = lazy(() => import('./Application'));
const LazyLandingPage = lazy(loadLandingPage);
const LazyLegalPage = lazy(loadLegalPage);

export function EntryPage() {
  const pricingOnly = publicPage?.kind === 'pricing';
  const locale = publicPage?.locale;

  if (isLegalRoute && (publicPage?.kind === 'privacy' || publicPage?.kind === 'terms') && ResolvedLegalPage) {
    return <ResolvedLegalPage kind={publicPage.kind} locale={publicPage.locale} />;
  }

  if (!applicationEntry && !isLegalRoute && ResolvedLandingPage) {
    return <ResolvedLandingPage pricingOnly={pricingOnly} locale={locale} />;
  }

  return (
    <Suspense
      fallback={
        <div className="entry-loading" role="status" aria-label="Loading">
          <span />
        </div>
      }
    >
      {applicationEntry ? (
        <LazyApplication />
      ) : publicPage?.kind === 'privacy' || publicPage?.kind === 'terms' ? (
        <LazyLegalPage kind={publicPage.kind} locale={publicPage.locale} />
      ) : (
        <LazyLandingPage pricingOnly={pricingOnly} locale={locale} />
      )}
    </Suspense>
  );
}
