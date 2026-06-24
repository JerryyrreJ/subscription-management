import type { HandlerResponse } from '@netlify/functions';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export interface HttpErrorDetails {
  field?: string;
  suggestedFix?: string;
  allowedValues?: readonly string[];
  writableFields?: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly headers: Record<string, string> = {},
    public readonly details: HttpErrorDetails = {}
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const isNetworkFetchError = (error: unknown, seen = new Set<unknown>()): boolean => {
  if (!error || seen.has(error)) {
    return false;
  }
  seen.add(error);

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('fetch failed') || message.includes('network socket disconnected')) {
    return true;
  }

  if (isRecord(error)) {
    const recordText = ['message', 'details', 'hint']
      .map(key => error[key])
      .filter((value): value is string => typeof value === 'string')
      .join('\n')
      .toLowerCase();
    if (recordText.includes('fetch failed') || recordText.includes('network socket disconnected')) {
      return true;
    }

    const code = typeof error.code === 'string' ? error.code : undefined;
    if (code && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)) {
      return true;
    }
    return isNetworkFetchError(error.cause, seen);
  }

  return false;
};

export const jsonResponse = (
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {}
): HandlerResponse => ({
  statusCode,
  headers: { ...JSON_HEADERS, ...headers },
  body: JSON.stringify(body),
});

export const errorResponse = (
  error: unknown,
  requestId: string
): HandlerResponse => {
  if (error instanceof HttpError) {
    const details = Object.fromEntries(
      Object.entries(error.details).filter(([, value]) => value !== undefined)
    );

    return jsonResponse(error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
        ...(Object.keys(details).length > 0 ? details : {}),
      },
      requestId,
    }, error.headers);
  }

  return jsonResponse(500, {
    error: { code: 'internal_error', message: 'Internal server error' },
    requestId,
  });
};
