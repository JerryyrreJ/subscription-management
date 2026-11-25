import { supabase } from '../lib/supabase';
import { isSafeExternalRedirectUrl } from '../utils/oauthConsent';

export type OAuthPermissionScope = 'read' | 'write';

export interface OAuthClientSummary {
  id: string;
  name: string;
  uri?: string | null;
  logoUri?: string | null;
}

export interface PendingOAuthConsentDetails {
  kind: 'consent_required';
  authorizationId: string;
  redirectUri: string;
  requestedScope: string;
  client: OAuthClientSummary;
}

export interface AutoApprovedOAuthRedirect {
  kind: 'redirect';
  redirectUrl: string;
}

export type OAuthAuthorizationLookup =
  | PendingOAuthConsentDetails
  | AutoApprovedOAuthRedirect;

export interface ConnectedOAuthApp {
  clientId: string;
  clientName: string;
  clientUri: string | null;
  logoUri: string | null;
  grantedAt: string;
  lastUsedAt: string | null;
  scopes: OAuthPermissionScope[];
}

interface OAuthClientScopeRow {
  client_id: string;
  client_name: string | null;
  scopes: string[] | null;
  last_used_at: string | null;
}

export class OAuthGrantServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'supabase_unavailable'
      | 'oauth_server_disabled'
      | 'invalid_redirect'
      | 'authorization_failed'
  ) {
    super(message);
    this.name = 'OAuthGrantServiceError';
  }
}

const normalizePermissionScopes = (
  raw: readonly string[] | null | undefined,
  fallback: OAuthPermissionScope[] = ['read']
): OAuthPermissionScope[] => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...fallback];
  }
  const filtered = raw.filter(
    (item): item is OAuthPermissionScope => item === 'read' || item === 'write'
  );
  if (!filtered.includes('read')) {
    return ['read', ...filtered];
  }
  return filtered;
};

const isOAuthDisabledError = (error: { message?: string; status?: number; code?: string } | null): boolean => {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  const code = (error.code ?? '').toLowerCase();
  return (
    error.status === 404 ||
    code.includes('oauth') && code.includes('disabled') ||
    msg.includes('oauth server is disabled') ||
    msg.includes('oauth 2.1 server is not enabled') ||
    msg.includes('not found')
  );
};

export const OAuthGrantService = {
  async getAuthorizationDetails(authorizationId: string): Promise<OAuthAuthorizationLookup> {
    if (!supabase) {
      throw new OAuthGrantServiceError('Cloud authentication is not configured.', 'supabase_unavailable');
    }

    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error || !data) {
      if (isOAuthDisabledError(error as { message?: string; status?: number; code?: string })) {
        throw new OAuthGrantServiceError(
          error?.message || 'OAuth 2.1 Server is not enabled on Supabase.',
          'oauth_server_disabled'
        );
      }
      throw new OAuthGrantServiceError(
        error?.message || 'Unable to load authorization request details.',
        'authorization_failed'
      );
    }

    if ('redirect_url' in data && typeof data.redirect_url === 'string') {
      if (!isSafeExternalRedirectUrl(data.redirect_url)) {
        throw new OAuthGrantServiceError('Unsafe OAuth redirect URL.', 'invalid_redirect');
      }
      return {
        kind: 'redirect',
        redirectUrl: data.redirect_url,
      };
    }

    const details = data as {
      authorization_id: string;
      redirect_uri: string;
      scope?: string;
      client?: {
        id?: string;
        name?: string;
        uri?: string;
        logo_uri?: string;
      };
    };

    const clientId = details.client?.id?.trim();
    if (!clientId) {
      throw new OAuthGrantServiceError('Missing OAuth client identifier.', 'authorization_failed');
    }

    const redirectUri = details.redirect_uri?.trim() ?? '';
    if (!isSafeExternalRedirectUrl(redirectUri)) {
      throw new OAuthGrantServiceError('Unsafe OAuth redirect URL.', 'invalid_redirect');
    }

    return {
      kind: 'consent_required',
      authorizationId: details.authorization_id || authorizationId,
      redirectUri,
      requestedScope: details.scope ?? '',
      client: {
        id: clientId,
        name: details.client?.name?.trim() || clientId,
        uri: details.client?.uri?.trim() || null,
        logoUri: details.client?.logo_uri?.trim() || null,
      },
    };
  },

  async saveClientScopes(params: {
    userId: string;
    clientId: string;
    clientName?: string | null;
    scopes: OAuthPermissionScope[];
  }): Promise<void> {
    if (!supabase) {
      throw new OAuthGrantServiceError('Cloud authentication is not configured.', 'supabase_unavailable');
    }

    const normalizedScopes = normalizePermissionScopes(params.scopes, ['read', 'write']);
    const cleanName = params.clientName?.trim()
      ? params.clientName.trim().slice(0, 120)
      : null;

    const { error } = await supabase.from('oauth_client_scopes').upsert(
      {
        user_id: params.userId,
        client_id: params.clientId,
        client_name: cleanName,
        scopes: normalizedScopes,
      },
      { onConflict: 'user_id,client_id' }
    );

    if (error) {
      throw new OAuthGrantServiceError(error.message, 'authorization_failed');
    }
  },

  async approveAuthorization(params: {
    userId: string;
    authorizationId: string;
    clientId: string;
    clientName?: string | null;
    scopes: OAuthPermissionScope[];
  }): Promise<string> {
    if (!supabase) {
      throw new OAuthGrantServiceError('Cloud authentication is not configured.', 'supabase_unavailable');
    }

    await this.saveClientScopes({
      userId: params.userId,
      clientId: params.clientId,
      clientName: params.clientName,
      scopes: params.scopes,
    });

    const { data, error } = await supabase.auth.oauth.approveAuthorization(
      params.authorizationId,
      { skipBrowserRedirect: true }
    );

    if (error || !data?.redirect_url) {
      throw new OAuthGrantServiceError(
        error?.message || 'Failed to approve authorization request.',
        'authorization_failed'
      );
    }

    if (!isSafeExternalRedirectUrl(data.redirect_url)) {
      throw new OAuthGrantServiceError('Unsafe OAuth redirect URL.', 'invalid_redirect');
    }

    return data.redirect_url;
  },

  async denyAuthorization(authorizationId: string): Promise<string> {
    if (!supabase) {
      throw new OAuthGrantServiceError('Cloud authentication is not configured.', 'supabase_unavailable');
    }

    const { data, error } = await supabase.auth.oauth.denyAuthorization(
      authorizationId,
      { skipBrowserRedirect: true }
    );

    if (error || !data?.redirect_url) {
      throw new OAuthGrantServiceError(
        error?.message || 'Failed to deny authorization request.',
        'authorization_failed'
      );
    }

    if (!isSafeExternalRedirectUrl(data.redirect_url)) {
      throw new OAuthGrantServiceError('Unsafe OAuth redirect URL.', 'invalid_redirect');
    }

    return data.redirect_url;
  },

  async listConnectedApps(userId: string): Promise<{
    apps: ConnectedOAuthApp[];
    oauthAvailable: boolean;
  }> {
    if (!supabase) {
      return { apps: [], oauthAvailable: false };
    }

    const { data: grants, error: grantsError } = await supabase.auth.oauth.listGrants();
    if (grantsError) {
      if (isOAuthDisabledError(grantsError as { message?: string; status?: number; code?: string })) {
        return { apps: [], oauthAvailable: false };
      }
      throw new OAuthGrantServiceError(grantsError.message, 'authorization_failed');
    }

    const grantList = Array.isArray(grants) ? grants : [];
    if (grantList.length === 0) {
      return { apps: [], oauthAvailable: true };
    }

    const { data: scopeRows } = await supabase
      .from('oauth_client_scopes')
      .select('client_id, client_name, scopes, last_used_at')
      .eq('user_id', userId);

    const scopeMap = new Map<string, OAuthClientScopeRow>();
    for (const row of (scopeRows ?? []) as OAuthClientScopeRow[]) {
      scopeMap.set(row.client_id, row);
    }

    const apps: ConnectedOAuthApp[] = grantList.map(grant => {
      const scopeRow = scopeMap.get(grant.client.id);
      return {
        clientId: grant.client.id,
        clientName: grant.client.name?.trim() || scopeRow?.client_name || grant.client.id,
        clientUri: grant.client.uri?.trim() || null,
        logoUri: grant.client.logo_uri?.trim() || null,
        grantedAt: grant.granted_at,
        lastUsedAt: scopeRow?.last_used_at ?? null,
        scopes: normalizePermissionScopes(scopeRow?.scopes, ['read']),
      };
    });

    return { apps, oauthAvailable: true };
  },

  async revokeConnectedApp(userId: string, clientId: string): Promise<void> {
    if (!supabase) {
      throw new OAuthGrantServiceError('Cloud authentication is not configured.', 'supabase_unavailable');
    }

    // Delete scope record first so fail-closed API enforcement takes effect immediately
    // and any deletion error leaves the grant visible for retry.
    const { error: scopeDeleteError } = await supabase
      .from('oauth_client_scopes')
      .delete()
      .eq('user_id', userId)
      .eq('client_id', clientId);

    if (scopeDeleteError) {
      throw new OAuthGrantServiceError(scopeDeleteError.message, 'authorization_failed');
    }

    const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
    if (error) {
      throw new OAuthGrantServiceError(error.message, 'authorization_failed');
    }
  },
};
