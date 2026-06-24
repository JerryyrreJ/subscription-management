import Anthropic from '@anthropic-ai/sdk';
import type { AiConfig } from '../env';
import { normalizeAiCommand } from '../../../../src/utils/aiCommand';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS } from '../../../../src/utils/subscriptionDomain';
import type { CaptureInput, ParseResult, SubscriptionParser } from './types';

// Static instruction block — kept byte-stable so prompt caching can engage.
// No per-request data here; the current date is passed in the user turn.
const SYSTEM_PROMPT = [
  'You are a subscription command parser. Convert the user input into exactly one structured command for a subscription tracker.',
  '',
  'Return ONLY JSON matching the schema. Supported actions:',
  '- create: user wants to add one or more subscriptions from text, a statement, a receipt, or a screenshot.',
  '- update: user wants to change fields on one or more existing subscriptions.',
  '- delete: user wants to cancel, remove, delete, or stop tracking exactly one existing subscription.',
  '- none: no supported action, missing target, ambiguous target, or not enough information.',
  '',
  'Rules:',
  '- For update/delete, choose subscriptionId ONLY from the provided currentSubscriptions list. Never invent IDs.',
  '- If the user requests multiple subscription updates, return action update with an updates array. Each item must include subscriptionId and patch.',
  '- Names in currentSubscriptions may include emoji or icons. Match by the visible name/meaning too; for example 鱼云 can match 🐟云.',
  '- If the user names a subscription but multiple current subscriptions match, return none with a short reason.',
  '- If the target is absent from currentSubscriptions, return none with a short reason.',
  '- For create, one subscription object per distinct recurring subscription. Do not invent subscriptions that are not present.',
  '- For create, ignore one-off purchases, refunds, transfers, and non-recurring charges.',
  '- amount: recurring charge as a number in major currency units (e.g. 15.99). No currency symbol.',
  `- currency: one of ${SUBSCRIPTION_CURRENCIES.join(', ')}. Infer from symbols (¥=CNY, $=USD, €=EUR, £=GBP, etc.). If unsure, use USD.`,
  `- period: one of ${SUBSCRIPTION_PERIODS.join(', ')}. Use custom only for intervals that are not monthly or yearly, and then set customDate to the interval length in days.`,
  '- lastPaymentDate: most recent charge date in YYYY-MM-DD. If creating and the input does not state one, use the provided current date.',
  '- The app derives the next renewal date from lastPaymentDate + period. If the user asks to change a renewal date, next payment date, due date, 续费日期, 下次付款日, or 到期日, return an update patch with nextPaymentDate in YYYY-MM-DD for the requested renewal date.',
  '- For update, include only changed fields in patch.',
  '- Never execute anything; only describe the command for user confirmation.',
].join('\n');

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['create', 'update', 'delete', 'none'] },
    subscriptionId: { type: 'string' },
    targetName: { type: 'string' },
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
        nextPaymentDate: { type: 'string' },
        customDate: { type: 'string' },
        notificationEnabled: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    updates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subscriptionId: { type: 'string' },
          targetName: { type: 'string' },
          message: { type: 'string' },
          patch: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              category: { type: 'string' },
              amount: { type: 'number' },
              currency: { type: 'string', enum: [...SUBSCRIPTION_CURRENCIES] },
              period: { type: 'string', enum: [...SUBSCRIPTION_PERIODS] },
              lastPaymentDate: { type: 'string' },
              nextPaymentDate: { type: 'string' },
              customDate: { type: 'string' },
              notificationEnabled: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        required: ['patch'],
        additionalProperties: false,
      },
    },
  },
  required: ['action'],
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

      const { command } = normalizeAiCommand(raw, today, input.subscriptions);

      return {
        command,
        usage: {
          inputTokens: response.usage.input_tokens ?? 0,
          outputTokens: response.usage.output_tokens ?? 0,
        },
      };
    },
  };
};
