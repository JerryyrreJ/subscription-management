import type { AiConfig } from '../env';
import { normalizeDrafts } from '../../../../src/utils/subscriptionDraft';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS } from '../../../../src/utils/subscriptionDomain';
import type { CaptureInput, ParseResult, SubscriptionParser } from './types';

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Keep the provider-agnostic extraction contract aligned with Anthropic's parser.
const SYSTEM_PROMPT = [
  'You extract subscription records from messy user input — a sentence, a pasted bank/credit-card statement, a receipt email, or a screenshot of a subscriptions list.',
  '',
  'Return ONLY structured data of the subscriptions you can identify. Rules:',
  '- One object per distinct recurring subscription. Do not invent subscriptions that are not present. If you find none, return an empty list.',
  '- Ignore one-off purchases, refunds, transfers, and non-recurring charges.',
  '- amount: the recurring charge as a number in major currency units (e.g. 15.99). No currency symbol.',
  `- currency: one of ${SUBSCRIPTION_CURRENCIES.join(', ')}. Infer from symbols (¥=CNY, $=USD, €=EUR, £=GBP, etc.). If unsure, use USD.`,
  `- period: one of ${SUBSCRIPTION_PERIODS.join(', ')}. Use "custom" only for intervals that are not monthly or yearly, and then set customDate to the interval length in days.`,
  '- lastPaymentDate: the most recent charge date in YYYY-MM-DD. If the input does not state one, use the provided current date.',
  '- category: a short label such as Streaming, Productivity, AI, Music, Developer Tools. Leave empty if unclear.',
  '- name: the service name (e.g. "Netflix", "ChatGPT Plus").',
  'Do not include any commentary — only the structured subscriptions.',
].join('\n');

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    subscriptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string', enum: [...SUBSCRIPTION_CURRENCIES] },
          period: { type: 'string', enum: [...SUBSCRIPTION_PERIODS] },
          lastPaymentDate: { type: 'string' },
          customDate: { type: 'string' },
          notificationEnabled: { type: 'boolean' },
        },
        required: ['name', 'amount', 'currency', 'period'],
        additionalProperties: false,
      },
    },
  },
  required: ['subscriptions'],
  additionalProperties: false,
};

type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface OpenRouterRequest {
  model?: string;
  models?: string[];
  messages: Array<{
    role: 'system' | 'user';
    content: string | OpenRouterContentPart[];
  }>;
  provider: { require_parameters: boolean };
  max_tokens: number;
  response_format: {
    type: 'json_schema';
    json_schema: {
      name: string;
      strict: boolean;
      schema: typeof OUTPUT_SCHEMA;
    };
  };
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

const modelPayload = (config: AiConfig): Pick<OpenRouterRequest, 'model' | 'models'> => {
  const models = [config.model, ...config.fallbackModels].filter(Boolean);
  const uniqueModels = [...new Set(models)];

  return uniqueModels.length > 1
    ? { models: uniqueModels }
    : { model: uniqueModels[0] ?? config.model };
};

const extractText = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }

  return '';
};

export const createOpenRouterParser = (config: AiConfig): SubscriptionParser => ({
  async parse(input: CaptureInput, today: string): Promise<ParseResult> {
    const content: OpenRouterContentPart[] = [];

    if (input.image) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${input.image.mediaType};base64,${input.image.dataBase64}`,
        },
      });
    }

    const instruction = input.text && input.text.trim()
      ? input.text
      : 'Extract every subscription you can find in the attached image.';
    content.push({ type: 'text', text: `Current date: ${today}\n\n${instruction}` });

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (config.openRouterSiteUrl) {
      headers['HTTP-Referer'] = config.openRouterSiteUrl;
    }
    if (config.openRouterAppTitle) {
      headers['X-Title'] = config.openRouterAppTitle;
    }

    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...modelPayload(config),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        provider: { require_parameters: true },
        max_tokens: 1024,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'subscription_capture',
            strict: true,
            schema: OUTPUT_SCHEMA,
          },
        },
      } satisfies OpenRouterRequest),
    });

    const body = await response.json().catch(() => ({})) as OpenRouterResponse;
    if (!response.ok) {
      throw new Error(body.error?.message ?? `OpenRouter request failed (${response.status})`);
    }

    const text = extractText(body.choices?.[0]?.message?.content);
    let raw: unknown = {};
    try {
      raw = JSON.parse(text);
    } catch {
      raw = {};
    }

    const { drafts } = normalizeDrafts(raw, today);

    return {
      drafts,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      },
    };
  },
});
