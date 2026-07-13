const DELETE_ACCOUNT_ENDPOINT = '/.netlify/functions/delete-account';

type AccountDeletionErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class AccountDeletionError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const deleteAccount = async (accessToken: string): Promise<void> => {
  const response = await fetch(DELETE_ACCOUNT_ENDPOINT, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ confirmation: 'DELETE_ACCOUNT' }),
  });

  const responseText = await response.text().catch(() => '');
  let body: unknown = null;

  if (responseText) {
    try {
      body = JSON.parse(responseText) as unknown;
    } catch {
      throw new AccountDeletionError('invalid_api_response', 'Account deletion service returned invalid JSON');
    }
  }

  if (!response.ok) {
    const errorBody = isRecord(body) ? body as AccountDeletionErrorBody : null;
    throw new AccountDeletionError(
      errorBody?.error?.code || 'account_deletion_failed',
      errorBody?.error?.message || `Account deletion failed with status ${response.status}`
    );
  }

  if (!isRecord(body) || body.deleted !== true) {
    throw new AccountDeletionError('invalid_api_response', 'Account deletion service returned an invalid response');
  }
};
