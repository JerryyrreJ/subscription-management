import { useEffect } from 'react';
import { App } from './App';
import { DeveloperApiModal } from './components/DeveloperApiModal';
import { OAuthConsentPage } from './components/oauth/OAuthConsentPage';
import { AuthProvider } from './contexts/AuthContext';
import {
  buildOAuthConsentUrl,
  consumePendingOAuthAuthorizationId,
  isOAuthConsentPath,
} from './utils/oauthConsent';
import './i18n';
import './styles/settings.css';

export default function Application() {
  const onConsentRoute = isOAuthConsentPath(window.location.pathname);
  const onDevSettingsPreview =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('preview_mcp_settings') === '1';

  useEffect(() => {
    if (onConsentRoute || onDevSettingsPreview) {
      return;
    }
    const pendingAuthorizationId = consumePendingOAuthAuthorizationId(window.sessionStorage);
    if (pendingAuthorizationId) {
      window.location.replace(buildOAuthConsentUrl(window.location.origin, pendingAuthorizationId));
    }
  }, [onConsentRoute, onDevSettingsPreview]);

  return (
    <AuthProvider>
      {onConsentRoute ? (
        <OAuthConsentPage />
      ) : onDevSettingsPreview ? (
        <div className="min-h-[100dvh] p-6 sm:p-10" style={{ background: 'var(--app-canvas)' }}>
          <DeveloperApiModal
            isOpen={true}
            accessToken="dev_preview_token"
            onClose={() => {}}
            onOpenAuth={() => {}}
            isStandalone={false}
          />
        </div>
      ) : (
        <App />
      )}
    </AuthProvider>
  );
}
