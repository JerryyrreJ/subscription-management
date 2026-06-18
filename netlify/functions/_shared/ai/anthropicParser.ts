import Anthropic from '@anthropic-ai/sdk';
import type { AiConfig } from '../env';
import { normalizeDrafts } from '../../../../src/utils/subscriptionDraft';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS } from '../../../../src/utils/subscriptionDomain';
import type { CaptureInput, ParseResult, SubscriptionParser } from './types';

// Static instruction block — kept byte-stable so prompt caching can engage.
// No per-request data here; the current date is passed in the user turn.
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

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// output_config (structured outputs) is not yet in the SDK's param types; extend
// locally so the field is sent without resorting to `any`.
type StructuredMessageParams = Anthropic.MessageCreateParamsNonStreaming & {
  output_config?: { format: { type: 'json_schema'; schema: unknown } };
};

export const createAnthropicParser = (config: AiConfig): SubscriptionParser => {
  const client = new Anthropic({ apiKey: config.apiKey ?? undefined });

  return {
    async parse(input: CaptureInput, today: string): Promise<ParseResult> {
      const content: Anthropic.ContentBlockParam[] = [];

      if (input.image) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: input.image.mediaType as ImageMediaType,
            data: input.image.dataBase64,
          },
        });
      }

      const instruction = input.text && input.text.trim()
        ? input.text
        : 'Extract every subscription you can find in the attached image.';
      content.push({ type: 'text', text: `Current date: ${today}\n\n${instruction}` });

      const params: StructuredMessageParams = {
        model: config.model,
        max_tokens: 1024,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content }],
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      };

      const response = await client.messages.create(params);

      const text = response.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join('');

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
          inputTokens: response.usage.input_tokens ?? 0,
          outputTokens: response.usage.output_tokens ?? 0,
        },
      };
    },
  };
};
