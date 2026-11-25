import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Eye,
  Globe,
  Loader2,
  LogOut,
  PlugZap,
  ShieldCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { setStoredLocale } from '../../utils/locale';
import {
  clearPendingOAuthAuthorizationId,
  describeOAuthRedirectTarget,
  extractAuthorizationId,
  peekPendingOAuthAuthorizationId,
  savePendingOAuthAuthorizationId,
} from '../../utils/oauthConsent';
import {
  OAuthGrantService,
  OAuthGrantServiceError,
  type PendingOAuthConsentDetails,
} from '../../services/oauthGrantService';
import { AuthModal } from '../AuthModal';

export function OAuthConsentPage() {
  const { t, i18n } = useTranslation(['developerApi', 'app']);
  const { user, loading: authLoading, signOut } = useAuth();

  const isDevPreview = useMemo(() => {
    if (!import.meta.env.DEV) {
      return false;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('preview') === '1';
  }, []);

  const authorizationId = useMemo(() => {
    const fromQuery = extractAuthorizationId(window.location.search);
    if (fromQuery) {
      return fromQuery;
    }
    if (isDevPreview) {
      return 'dev_preview_authorization';
    }
    return peekPendingOAuthAuthorizationId(window.sessionStorage);
  }, [isDevPreview]);

  const effectiveUser = useMemo(
    () => user ?? (isDevPreview ? { id: 'preview-user', email: 'alex@steadyrenew.com' } : null),
    [user, isDevPreview]
  );

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [details, setDetails] = useState<PendingOAuthConsentDetails | null>(() =>
    isDevPreview
      ? {
          kind: 'consent_required',
          authorizationId: 'dev_preview_authorization',
          redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
          requestedScope: 'openid email profile',
          client: {
            id: 'preview-client-chatgpt',
            name: 'ChatGPT',
            uri: 'https://chatgpt.com',
            logoUri: null,
          },
        }
      : null
  );
  const [accessMode, setAccessMode] = useState<'write' | 'read'>('write');
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<'approve' | 'deny' | null>(null);
  const [errorKind, setErrorKind] = useState<'none' | 'server_disabled' | 'generic'>('none');
  const [errorMessage, setErrorMessage] = useState('');

  const redirectTarget = useMemo(
    () => (details ? describeOAuthRedirectTarget(details.redirectUri) : null),
    [details]
  );

  const isChinese = i18n.language.startsWith('zh');

  const toggleLanguage = () => {
    const nextLocale = isChinese ? 'en' : 'zh-CN';
    void i18n.changeLanguage(nextLocale);
    setStoredLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  };

  // Persist authorization_id in sessionStorage while unauthenticated so social
  // OAuth sign-in (Google / GitHub -> /app) can return here without losing context.
  useEffect(() => {
    if (!authorizationId || isDevPreview) {
      return;
    }
    if (!user) {
      savePendingOAuthAuthorizationId(window.sessionStorage, authorizationId);
    }
  }, [authorizationId, isDevPreview, user]);

  const loadAuthorization = useCallback(async () => {
    if (!authorizationId || !user || isDevPreview) {
      return;
    }

    setLoadingDetails(true);
    setErrorKind('none');
    setErrorMessage('');

    try {
      const result = await OAuthGrantService.getAuthorizationDetails(authorizationId);
      if (result.kind === 'redirect') {
        clearPendingOAuthAuthorizationId(window.sessionStorage);
        window.location.assign(result.redirectUrl);
        return;
      }
      setDetails(result);
    } catch (err) {
      if (err instanceof OAuthGrantServiceError && err.code === 'oauth_server_disabled') {
        setErrorKind('server_disabled');
      } else {
        setErrorKind('generic');
      }
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDetails(false);
    }
  }, [authorizationId, isDevPreview, user]);

  useEffect(() => {
    if (isDevPreview) {
      return;
    }
    if (!authLoading && user && authorizationId) {
      void loadAuthorization();
    } else if (!user) {
      setDetails(null);
    }
  }, [authLoading, user, authorizationId, isDevPreview, loadAuthorization]);

  const handleApprove = async () => {
    if (isDevPreview || !user || !details) return;
    setSubmittingAction('approve');
    setErrorKind('none');
    setErrorMessage('');

    try {
      const redirectUrl = await OAuthGrantService.approveAuthorization({
        userId: user.id,
        authorizationId: details.authorizationId,
        clientId: details.client.id,
        clientName: details.client.name,
        scopes: accessMode === 'write' ? ['read', 'write'] : ['read'],
      });
      clearPendingOAuthAuthorizationId(window.sessionStorage);
      window.location.assign(redirectUrl);
    } catch (err) {
      setErrorKind('generic');
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setSubmittingAction(null);
    }
  };

  const handleDeny = async () => {
    if (!authorizationId) return;
    setSubmittingAction('deny');
    setErrorKind('none');
    setErrorMessage('');

    try {
      const redirectUrl = await OAuthGrantService.denyAuthorization(authorizationId);
      clearPendingOAuthAuthorizationId(window.sessionStorage);
      window.location.assign(redirectUrl);
    } catch (err) {
      setErrorKind('generic');
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setSubmittingAction(null);
    }
  };

  const handleSwitchAccount = async () => {
    if (authorizationId) {
      savePendingOAuthAuthorizationId(window.sessionStorage, authorizationId);
    }
    await signOut();
    setAuthModalOpen(true);
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col justify-between px-4 py-4 sm:py-5"
      style={{
        background:
          'radial-gradient(circle at 50% 0%, var(--settings-accent-soft) 0%, transparent 52%), var(--app-canvas)',
      }}
    >
      <header
        className={`w-full max-w-lg mx-auto flex items-center justify-between gap-3 transition-opacity duration-150 ${authModalOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-hidden={authModalOpen}
      >
        <a
          href="/app"
          className="inline-flex items-center gap-2 text-sm font-semibold app-theme-text-primary hover:opacity-80 transition-opacity"
        >
          <span
            className="w-7 h-7 rounded-lg grid place-items-center text-xs font-bold tracking-tight"
            style={{
              background: 'var(--settings-accent-soft)',
              color: 'var(--settings-accent)',
              border: '1px solid var(--app-border)',
            }}
          >
            SR
          </span>
          <span>SteadyRenew</span>
        </a>

        <button
          type="button"
          onClick={toggleLanguage}
          className="settings-button !min-h-[32px] !py-1 !px-2.5 !text-xs"
        >
          <Globe className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isChinese ? 'English' : '中文'}</span>
        </button>
      </header>

      <main
        className={`w-full max-w-lg mx-auto my-3 transition-opacity duration-150 ${authModalOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-hidden={authModalOpen}
      >
        <div
          className="rounded-2xl p-5 sm:p-6 shadow-sm"
          style={{
            background: 'var(--app-surface)',
            border: '1px solid var(--app-border)',
          }}
        >
          {/* Connection handshake header */}
          <div className="flex items-center justify-center gap-2.5 mb-3.5">
            <div
              className="w-10 h-10 rounded-xl grid place-items-center overflow-hidden"
              style={{
                background: 'var(--app-control)',
                border: '1px solid var(--app-border)',
                color: 'var(--app-secondary)',
              }}
            >
              {details?.client.logoUri && /^https:\/\//i.test(details.client.logoUri) ? (
                <img
                  src={details.client.logoUri}
                  alt={details.client.name}
                  className="w-6 h-6 object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <PlugZap className="w-4 h-4" aria-hidden="true" />
              )}
            </div>
            <div className="flex items-center gap-1.5" style={{ color: 'var(--settings-accent)' }}>
              <span className="w-4 h-px" style={{ background: 'var(--app-border)' }} />
              <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="w-4 h-px" style={{ background: 'var(--app-border)' }} />
            </div>
            <div
              className="w-10 h-10 rounded-xl grid place-items-center"
              style={{
                background: 'var(--settings-accent-soft)',
                color: 'var(--settings-accent)',
                border: '1px solid var(--app-border)',
              }}
            >
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>

          <p className="agent-setup-eyebrow text-center mb-1.5">{t('developerApi:consentEyebrow')}</p>

          {!authorizationId ? (
            <div className="text-center space-y-4">
              <h1 className="text-xl font-semibold app-theme-text-primary">
                {t('developerApi:consentMissingIdTitle')}
              </h1>
              <p className="text-sm app-theme-text-muted leading-relaxed">
                {t('developerApi:consentMissingIdDesc')}
              </p>
              <div className="pt-2">
                <a href="/app" className="settings-button inline-flex">
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  {t('developerApi:consentBackToApp')}
                </a>
              </div>
            </div>
          ) : !isDevPreview && (authLoading || (user && loadingDetails && !details)) ? (
            <div className="py-8 text-center space-y-3" role="status">
              <Loader2
                className="w-6 h-6 animate-spin mx-auto"
                style={{ color: 'var(--settings-accent)' }}
                aria-hidden="true"
              />
              <p className="text-sm app-theme-text-secondary">
                {t('developerApi:consentLoadingTitle')}
              </p>
            </div>
          ) : !effectiveUser ? (
            <div className="text-center space-y-4">
              <h1 className="text-xl font-semibold app-theme-text-primary">
                {t('developerApi:consentSignInTitle')}
              </h1>
              <p className="text-sm app-theme-text-muted leading-relaxed">
                {t('developerApi:consentSignInDescription')}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="settings-button-primary w-full"
                >
                  {t('developerApi:consentSignInButton')}
                </button>
              </div>
            </div>
          ) : errorKind !== 'none' && !details ? (
            <div className="text-center space-y-4">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 grid place-items-center mx-auto">
                <AlertCircle className="w-5 h-5" aria-hidden="true" />
              </div>
              <h1 className="text-xl font-semibold app-theme-text-primary">
                {errorKind === 'server_disabled'
                  ? t('developerApi:consentServerDisabledTitle')
                  : t('developerApi:consentErrorTitle')}
              </h1>
              <p className="text-sm app-theme-text-muted leading-relaxed">
                {errorKind === 'server_disabled'
                  ? t('developerApi:consentServerDisabledDesc')
                  : errorMessage}
              </p>
              <div className="pt-2">
                <a href="/app" className="settings-button inline-flex">
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  {t('developerApi:consentBackToApp')}
                </a>
              </div>
            </div>
          ) : details ? (
            <div className="space-y-3.5">
              <div className="text-center">
                <h1 className="text-lg sm:text-xl font-semibold app-theme-text-primary leading-snug text-balance">
                  {t('developerApi:consentTitle', { client: details.client.name })}
                </h1>
                <p className="text-xs sm:text-sm app-theme-text-muted mt-1.5 leading-relaxed text-balance">
                  {t('developerApi:consentSubtitle')}
                </p>
                {details.client.uri && (
                  <p className="text-[11px] font-mono app-theme-text-muted mt-1 truncate">
                    {details.client.uri}
                  </p>
                )}
              </div>

              {/* Active account strip */}
              <div className="settings-inset px-3 py-2 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="app-theme-text-muted shrink-0">
                    {t('developerApi:consentSignedInAs')}
                  </span>
                  <span className="font-medium app-theme-text-primary truncate">
                    {effectiveUser.email || effectiveUser.id}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSwitchAccount()}
                  disabled={Boolean(submittingAction)}
                  className="shrink-0 inline-flex items-center gap-1 app-theme-text-secondary hover:underline disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('developerApi:consentSwitchAccount')}
                </button>
              </div>

              {/* Verified redirect destination (cannot be spoofed by DCR client metadata) */}
              {redirectTarget && (
                <div className="settings-inset px-3 py-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="app-theme-text-muted shrink-0">
                      {t('developerApi:consentRedirectLabel')}
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0">
                      {redirectTarget.kind === 'custom_scheme' && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                          style={{
                            background: 'var(--settings-accent-soft)',
                            color: 'var(--settings-accent)',
                          }}
                        >
                          {t('developerApi:consentRedirectCustomSchemeBadge')}
                        </span>
                      )}
                      {redirectTarget.kind === 'loopback' && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                          style={{
                            background: 'var(--app-control)',
                            color: 'var(--app-secondary)',
                          }}
                        >
                          {t('developerApi:consentRedirectLoopbackBadge')}
                        </span>
                      )}
                      <code
                        className="font-mono font-medium app-theme-text-primary truncate"
                        title={details.redirectUri}
                      >
                        {redirectTarget.displayTarget}
                      </code>
                    </span>
                  </div>
                  <p className="text-[11px] app-theme-text-muted leading-relaxed">
                    {t('developerApi:consentRedirectUnverifiedHint')}
                  </p>
                </div>
              )}

              {/* Scope selection cards */}
              <fieldset className="space-y-2" disabled={Boolean(submittingAction)}>
                <legend className="text-xs font-semibold uppercase tracking-wider app-theme-text-muted mb-1.5">
                  {t('developerApi:consentPermissionHeading')}
                </legend>

                {(
                  [
                    {
                      value: 'write' as const,
                      title: t('developerApi:consentReadWriteTitle'),
                      desc: t('developerApi:consentReadWriteDesc'),
                      icon: PlugZap,
                    },
                    {
                      value: 'read' as const,
                      title: t('developerApi:consentReadOnlyTitle'),
                      desc: t('developerApi:consentReadOnlyDesc'),
                      icon: Eye,
                    },
                  ]
                ).map(option => {
                  const selected = accessMode === option.value;
                  const Icon = option.icon;
                  return (
                    <label
                      key={option.value}
                      className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer transition-colors"
                      style={{
                        border: `1px solid ${selected ? 'var(--settings-accent)' : 'var(--app-border)'}`,
                        background: selected ? 'var(--settings-accent-soft)' : 'var(--app-surface)',
                      }}
                    >
                      <input
                        type="radio"
                        name="oauth-consent-scope"
                        value={option.value}
                        checked={selected}
                        onChange={() => setAccessMode(option.value)}
                        className="mt-0.5"
                        style={{ accentColor: 'var(--settings-accent)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Icon
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: selected ? 'var(--settings-accent)' : 'var(--app-muted)' }}
                            aria-hidden="true"
                          />
                          <span className="text-sm font-medium app-theme-text-primary">
                            {option.title}
                          </span>
                        </div>
                        <p className="text-xs app-theme-text-secondary mt-0.5 leading-relaxed">
                          {option.desc}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </fieldset>

              {/* Explicit security boundaries */}
              <div
                className="rounded-xl px-3 py-2.5 space-y-1 text-xs"
                style={{
                  background: 'var(--app-control)',
                  border: '1px solid var(--app-border)',
                }}
              >
                <p className="font-semibold app-theme-text-primary">
                  {t('developerApi:consentBoundariesTitle')}
                </p>
                <ul className="space-y-1 app-theme-text-secondary">
                  <li className="flex items-start gap-2">
                    <Check
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: 'var(--settings-accent)' }}
                      aria-hidden="true"
                    />
                    <span>{t('developerApi:consentBoundaryBark')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: 'var(--settings-accent)' }}
                      aria-hidden="true"
                    />
                    <span>{t('developerApi:consentBoundaryBilling')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: 'var(--settings-accent)' }}
                      aria-hidden="true"
                    />
                    <span>{t('developerApi:consentBoundaryRevoke')}</span>
                  </li>
                </ul>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300"
                >
                  {errorMessage}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => void handleDeny()}
                  disabled={Boolean(submittingAction)}
                  className="settings-button sm:flex-1"
                >
                  {submittingAction === 'deny' && (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  )}
                  {submittingAction === 'deny'
                    ? t('developerApi:consentDenying')
                    : t('developerApi:consentDeny')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleApprove()}
                  disabled={Boolean(submittingAction) || !redirectTarget || redirectTarget.kind === 'invalid'}
                  className="settings-button-primary sm:flex-1"
                >
                  {submittingAction === 'approve' && (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  )}
                  {submittingAction === 'approve'
                    ? t('developerApi:consentApproving')
                    : t('developerApi:consentApprove')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <footer
        className={`w-full max-w-lg mx-auto text-center text-xs app-theme-text-muted transition-opacity duration-150 ${authModalOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-hidden={authModalOpen}
      >
        <p>{t('developerApi:agentCloudOnly')}</p>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        contextBanner={t('developerApi:consentSignInBanner')}
      />
    </div>
  );
}
