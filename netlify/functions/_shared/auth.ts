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

const getHeader = (headers: HeadersLike, name: string): string | undefined => {
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

  return {
    userId: result.data.user.id,
    email: result.data.user.email,
  };
};
