import { Suspense, lazy } from 'react';
import { isApplicationEntry, resolveAppUrl } from './utils/siteRouting';

const appUrl = resolveAppUrl(import.meta.env.VITE_APP_URL);
const applicationEntry = isApplicationEntry(
  new URL(window.location.href),
  appUrl,
);
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
      <Page />
    </Suspense>
  );
}
