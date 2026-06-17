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
