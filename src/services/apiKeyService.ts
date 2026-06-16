export interface ApiKeyMetadata {
 id: string;
 name: string;
 keyPrefix: string;
 createdAt: string;
 lastUsedAt: string | null;
 revokedAt: string | null;
}

export interface ApiKeyLimits {
 activeKeys: number;
 requestsPerHour: number;
 plan: 'free' | 'premium';
}

interface ApiKeyListResponse {
 keys: ApiKeyMetadata[];
 limits: ApiKeyLimits;
}

interface ApiKeyCreateResponse {
 apiKey: string;
 key: ApiKeyMetadata;
}

const API_KEYS_ENDPOINT = '/.netlify/functions/api-keys';

type ApiErrorBody = {
 error?: {
  code?: string;
  message?: string;
 };
};

export class ApiKeyServiceError extends Error {
 constructor(
  public readonly code: string,
  message: string
 ) {
  super(message);
  this.name = 'ApiKeyServiceError';
 }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
 Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseApiResponse = async (response: Response): Promise<unknown> => {
 const contentType = response.headers.get('content-type') ?? '';
 const responseText = await response.text().catch(() => '');
 let body: unknown = null;

 if (responseText && contentType.includes('application/json')) {
  try {
   body = JSON.parse(responseText) as unknown;
  } catch {
   throw new ApiKeyServiceError(
    'invalid_api_response',
    'Developer API returned invalid JSON'
   );
  }
 }

 if (!response.ok) {
  const errorBody = isRecord(body) ? body as ApiErrorBody : null;
  const message = errorBody?.error?.message;
  const code = errorBody?.error?.code;
  throw new ApiKeyServiceError(
   code || 'request_failed',
   message || `Request failed with status ${response.status}`
  );
 }

 if (!body) {
  throw new ApiKeyServiceError(
   'developer_api_unavailable',
   'Developer API endpoint is unavailable'
  );
 }

 return body;
};

const isApiKeyMetadata = (value: unknown): value is ApiKeyMetadata => {
 if (!isRecord(value)) {
  return false;
 }

 return typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.keyPrefix === 'string' &&
  typeof value.createdAt === 'string' &&
  (typeof value.lastUsedAt === 'string' || value.lastUsedAt === null) &&
  (typeof value.revokedAt === 'string' || value.revokedAt === null);
};

const isApiKeyLimits = (value: unknown): value is ApiKeyLimits => {
 if (!isRecord(value)) {
  return false;
 }

 return typeof value.activeKeys === 'number' &&
  typeof value.requestsPerHour === 'number' &&
  (value.plan === 'free' || value.plan === 'premium');
};

const parseListResponse = (body: unknown): ApiKeyListResponse => {
 if (!isRecord(body) || !Array.isArray(body.keys) || !body.keys.every(isApiKeyMetadata) || !isApiKeyLimits(body.limits)) {
  throw new ApiKeyServiceError(
   'invalid_api_response',
   'Developer API returned an invalid response'
  );
 }

 return {
  keys: body.keys,
  limits: body.limits,
 };
};

const parseCreateResponse = (body: unknown): ApiKeyCreateResponse => {
 if (!isRecord(body) || typeof body.apiKey !== 'string' || !isApiKeyMetadata(body.key)) {
  throw new ApiKeyServiceError(
   'invalid_api_response',
   'Developer API returned an invalid response'
  );
 }

 return {
  apiKey: body.apiKey,
  key: body.key,
 };
};

const parseRevokeResponse = (body: unknown): void => {
 if (!isRecord(body) || body.revoked !== true) {
  throw new ApiKeyServiceError(
   'invalid_api_response',
   'Developer API returned an invalid response'
  );
 }
};

const authHeaders = (accessToken: string): HeadersInit => ({
 Authorization: `Bearer ${accessToken}`,
});

export class ApiKeyService {
 static async listApiKeys(accessToken: string): Promise<ApiKeyListResponse> {
  const response = await fetch(API_KEYS_ENDPOINT, {
   headers: authHeaders(accessToken),
  });

  return parseListResponse(await parseApiResponse(response));
 }

 static async createApiKey(accessToken: string, name: string): Promise<ApiKeyCreateResponse> {
  const response = await fetch(API_KEYS_ENDPOINT, {
   method: 'POST',
   headers: {
    ...authHeaders(accessToken),
    'Content-Type': 'application/json',
   },
   body: JSON.stringify({ name }),
  });

  return parseCreateResponse(await parseApiResponse(response));
 }

 static async revokeApiKey(accessToken: string, id: string): Promise<void> {
  const response = await fetch(`${API_KEYS_ENDPOINT}?${new URLSearchParams({ id })}`, {
   method: 'DELETE',
   headers: authHeaders(accessToken),
  });

  parseRevokeResponse(await parseApiResponse(response));
 }
}
