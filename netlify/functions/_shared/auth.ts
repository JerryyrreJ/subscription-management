import type { User } from '@supabase/supabase-js';
import { HttpError, isNetworkFetchError } from './http';

export interface AuthClient {
  auth: {
    getUser(accessToken: string): Promise<{
      data: { user: User | null };
      error: { message: string } | null;
    }>;
  };
}

export interface AuthenticatedRequest {
  userId: string;
  email?: string;
}

type HeadersLike = Record<string, string | undefined>;

export const getHeader = (headers: HeadersLike, name: string): string | undefined => {
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry?.[1];
};

export const extractBearerToken = (headers: HeadersLike): string => {
  const authorization = getHeader(headers, 'authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new HttpError(401, 'authentication_required', 'Authentication required');
  }

  return match[1].trim();
};

const parseJwtPayload = (accessToken: string): Record<string, unknown> | null => {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    return null;
  }

  if (!parts[0] || !parts[1] || !parts[2]) {
    throw new HttpError(401, 'invalid_access_token', 'Invalid or expired access token');
  }

  try {
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(401, 'invalid_access_token', 'Invalid or expired access token');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(401, 'invalid_access_token', 'Invalid or expired access token');
  }
};

const hasOAuthClientIdClaim = (payload: Record<string, unknown>): boolean => {
  const clientId = payload.client_id;
  if (clientId === undefined || clientId === null) {
    return false;
  }
  if (typeof clientId === 'string') {
    return clientId.trim().length > 0;
  }
  return true;
};

export const authenticateRequest = async (
  headers: HeadersLike,
  authClient: AuthClient
): Promise<AuthenticatedRequest> => {
  const accessToken = extractBearerToken(headers);
  let result: Awaited<ReturnType<AuthClient['auth']['getUser']>>;
  try {
    result = await authClient.auth.getUser(accessToken);
  } catch (error) {
    if (isNetworkFetchError(error)) {
      throw new HttpError(503, 'auth_service_unavailable', 'Authentication service is temporarily unavailable', {}, {
        suggestedFix: 'Check the network connection to Supabase and try again.',
      });
    }
    throw error;
  }

  if (result.error || !result.data.user) {
    throw new HttpError(401, 'invalid_access_token', 'Invalid or expired access token');
  }

  const jwtPayload = parseJwtPayload(accessToken);
  if (jwtPayload) {
    if (
      typeof jwtPayload.sub === 'string' &&
      jwtPayload.sub.trim() !== '' &&
      jwtPayload.sub.trim() !== result.data.user.id
    ) {
      throw new HttpError(401, 'invalid_access_token', 'Invalid or expired access token');
    }

    if (hasOAuthClientIdClaim(jwtPayload)) {
      throw new HttpError(
        403,
        'oauth_token_not_allowed',
        'OAuth access tokens cannot access first-party account endpoints',
        {},
        {
          suggestedFix: 'Use a direct browser session for account, billing, AI capture, and API key management, or call /api/mcp and /api/v1/* with your OAuth token.',
        }
      );
    }
  }

  return {
    userId: result.data.user.id,
    email: result.data.user.email,
  };
};
