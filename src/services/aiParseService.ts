import type { AiCommand, AiSubscriptionContextItem } from '../utils/aiCommand';

export type { DraftSubscription } from '../utils/subscriptionDraft';
export type { AiCommand, AiSubscriptionContextItem } from '../utils/aiCommand';

export interface ParseQuota {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface ParseCaptureResult {
  command: AiCommand;
  quota: ParseQuota | null;
}

export interface CaptureRequest {
  text?: string;
  image?: { mediaType: string; dataBase64: string };
  subscriptions?: AiSubscriptionContextItem[];
}

// Stable error codes the function emits; the UI maps them to localized copy and
// decides whether to offer the manual fallback.
export class AiParseError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AiParseError';
  }
}

const ENDPOINT = '/.netlify/functions/ai-parse-subscriptions';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export async function parseCapture(
  accessToken: string,
  request: CaptureRequest
): Promise<ParseCaptureResult> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new AiParseError('network_error', 'Could not reach the AI capture service');
  }

  const text = await response.text().catch(() => '');
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new AiParseError('invalid_response', 'AI capture returned invalid data');
    }
  }

  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const code = typeof error?.code === 'string' ? error.code : 'request_failed';
    const message = typeof error?.message === 'string' ? error.message : `Request failed (${response.status})`;
    throw new AiParseError(code, message);
  }

  if (!isRecord(body) || !isRecord(body.command)) {
    throw new AiParseError('invalid_response', 'AI capture returned an invalid response');
  }

  const quota = isRecord(body.quota)
    ? {
        remaining: Number(body.quota.remaining ?? 0),
        limit: Number(body.quota.limit ?? 0),
        resetAt: String(body.quota.resetAt ?? ''),
      }
    : null;

  return { command: body.command as unknown as AiCommand, quota };
}
