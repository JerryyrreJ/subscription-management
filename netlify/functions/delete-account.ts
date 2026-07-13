import type { Handler, HandlerEvent } from '@netlify/functions';
import { authenticateRequest, type AuthClient } from './_shared/auth';
import { getSupabaseAdminConfig, type SupabaseAdminConfig } from './_shared/env';
import { errorResponse, HttpError, isNetworkFetchError, jsonResponse } from './_shared/http';
import { logEvent } from './_shared/logging';
import { createSupabaseAdminClient, createSupabaseAuthClient } from './_shared/supabase';

const ACCOUNT_DELETION_CONFIRMATION = 'DELETE_ACCOUNT';

interface AccountDeletionAdminClient {
  auth: {
    admin: {
      deleteUser(userId: string): Promise<{
        data: unknown;
        error: { message: string; code?: string } | null;
      }>;
    };
  };
}

interface AccountDeletionDependencies {
  supabaseConfig: SupabaseAdminConfig;
  authClient: AuthClient;
  adminClient: AccountDeletionAdminClient;
  createRequestId(): string;
}

const createDefaultDependencies = (): AccountDeletionDependencies => {
  const supabaseConfig = getSupabaseAdminConfig(process.env);

  return {
    supabaseConfig,
    authClient: createSupabaseAuthClient(supabaseConfig),
    adminClient: createSupabaseAdminClient(supabaseConfig),
    createRequestId: () => crypto.randomUUID(),
  };
};

const parseConfirmation = (body: string | null): void => {
  let payload: unknown;

  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('confirmation' in payload) ||
    payload.confirmation !== ACCOUNT_DELETION_CONFIRMATION
  ) {
    throw new HttpError(400, 'account_deletion_confirmation_required', 'Account deletion confirmation is required');
  }
};

export const createDeleteAccountHandler = (
  dependenciesFactory: () => AccountDeletionDependencies = createDefaultDependencies
): Handler => async (event: HandlerEvent) => {
  let requestId: string = crypto.randomUUID();

  if (event.httpMethod !== 'DELETE') {
    return jsonResponse(405, {
      error: { code: 'method_not_allowed', message: 'Method not allowed' },
      requestId,
    }, { Allow: 'DELETE' });
  }

  try {
    const dependencies = dependenciesFactory();
    requestId = dependencies.createRequestId();
    parseConfirmation(event.body);

    const authenticated = await authenticateRequest(event.headers, dependencies.authClient);

    let deletionResult: Awaited<ReturnType<AccountDeletionAdminClient['auth']['admin']['deleteUser']>>;
    try {
      deletionResult = await dependencies.adminClient.auth.admin.deleteUser(authenticated.userId);
    } catch (error) {
      if (isNetworkFetchError(error)) {
        throw new HttpError(503, 'account_deletion_service_unavailable', 'Account deletion service is temporarily unavailable');
      }
      throw error;
    }

    if (deletionResult.error) {
      logEvent('error', 'Supabase rejected account deletion', requestId, {
        userId: authenticated.userId,
        code: deletionResult.error.code,
      });
      throw new HttpError(502, 'account_deletion_failed', 'Account could not be deleted');
    }

    logEvent('info', 'Account permanently deleted', requestId, {
      userId: authenticated.userId,
    });

    return jsonResponse(200, {
      deleted: true,
      requestId,
    });
  } catch (error) {
    logEvent('error', 'Account deletion request failed', requestId, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return errorResponse(error, requestId);
  }
};

export const handler = createDeleteAccountHandler();
