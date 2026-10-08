import { Suspense, lazy } from 'react';
import { getPublicPage } from './utils/publicPages';
import i18n from './i18n';
import { isApplicationEntry, resolveAppUrl } from './utils/siteRouting';
import { rememberApplicationEntry, shouldOpenApplication } from './lib/entryPreference';

const appUrl = resolveAppUrl(import.meta.env.VITE_APP_URL);
const applicationEntry = isApplicationEntry(
  new URL(window.location.href),
  appUrl,
) || (window.location.pathname === '/' && shouldOpenApplication());
const publicPage = getPublicPage(window.location.pathname);
if (!applicationEntry && publicPage) void i18n.changeLanguage(publicPage.locale);
if (applicationEntry) {
  rememberApplicationEntry();
  document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, follow');
}
// Preserve legacy auth/payment links and keep reloads in the app after cleanup.
if (applicationEntry && window.location.pathname === '/') {
  window.history.replaceState(
    {},
    '',
    '/app' + window.location.search + window.location.hash,
  );
}
const Page = applicationEntry
  ? lazy(() => import('./Application'))
  : lazy(() => import('./components/landing/LandingPage'));

export function EntryPage() {
  return (
    <Suspense
      fallback={
        <div className="entry-loading" role="status" aria-label="Loading">
          <span />
        </div>
      }
    >
      <Page pricingOnly={publicPage?.kind === 'pricing'} />
    </Suspense>
  );
}
