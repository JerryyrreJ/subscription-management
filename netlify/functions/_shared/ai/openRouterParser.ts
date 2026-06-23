import type { AiConfig } from '../env';
import { normalizeAiCommand } from '../../../../src/utils/aiCommand';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS } from '../../../../src/utils/subscriptionDomain';
import type { CaptureInput, ParseResult, SubscriptionParser } from './types';

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = [
  'You are a subscription command parser. Convert the user input into exactly one structured command for a subscription tracker.',
  '',
  'Return ONLY JSON matching the schema. Supported actions:',
  '- create: user wants to add one or more subscriptions from text, a statement, a receipt, or a screenshot.',
  '- update: user wants to change fields on exactly one existing subscription.',
  '- delete: user wants to cancel, remove, delete, or stop tracking exactly one existing subscription.',
  '- none: no supported action, missing target, ambiguous target, or not enough information.',
  '',
  'Rules:',
  '- For update/delete, choose subscriptionId ONLY from the provided currentSubscriptions list. Never invent IDs.',
  '- If the user names a subscription but multiple current subscriptions match, return none with a short reason.',
  '- If the target is absent from currentSubscriptions, return none with a short reason.',
  '- For create, one subscription object per distinct recurring subscription. Do not invent subscriptions that are not present.',
  '- For create, ignore one-off purchases, refunds, transfers, and non-recurring charges.',
  '- amount: recurring charge as a number in major currency units (e.g. 15.99). No currency symbol.',
  `- currency: one of ${SUBSCRIPTION_CURRENCIES.join(', ')}. Infer from symbols (¥=CNY, $=USD, €=EUR, £=GBP, etc.). If unsure, use USD.`,
  `- period: one of ${SUBSCRIPTION_PERIODS.join(', ')}. Use custom only for intervals that are not monthly or yearly, and then set customDate to the interval length in days.`,
  '- lastPaymentDate: most recent charge date in YYYY-MM-DD. If creating and the input does not state one, use the provided current date.',
  '- For update, include only changed fields in patch.',
  '- Never execute anything; only describe the command for user confirmation.',
].join('\n');

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['create', 'update', 'delete', 'none'] },
    subscriptionId: { type: 'string' },
    reason: { type: 'string' },
    message: { type: 'string' },
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
    patch: {
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
      additionalProperties: false,
    },
  },
  required: ['action'],
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
      : 'Parse the requested subscription command from the attached image.';
    content.push({
      type: 'text',
      text: [
        `Current date: ${today}`,
        `Current subscriptions: ${JSON.stringify(input.subscriptions)}`,
        '',
        instruction,
      ].join('\n'),
    });

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
            name: 'subscription_command',
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

    const { command } = normalizeAiCommand(raw, today, input.subscriptions);

    return {
      command,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      },
    };
  },
});
