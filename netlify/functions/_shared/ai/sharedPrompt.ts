import { normalizeAiCommand, type AiCommand } from '../../../../src/utils/aiCommand';
import { SUBSCRIPTION_CURRENCIES, SUBSCRIPTION_PERIODS } from '../../../../src/utils/subscriptionDomain';
import type { CaptureInput } from './types';

// Static instruction block — kept byte-stable so provider prompt caching can engage.
// No per-request data here; the current date is passed in the user turn.
export const AI_COMMAND_SYSTEM_PROMPT = [
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
  `- period: one of ${SUBSCRIPTION_PERIODS.join(', ')}. Monthly means the same calendar day each month, so the actual cycle can be 28, 29, 30, or 31 days. A fixed interval such as every 30 days must use custom with customDate set to 30.`,
  '- nextPaymentDate: authoritative upcoming renewal date in YYYY-MM-DD. For create, use the stated next charge date; if it is missing, use the provided current date and let the user review it.',
  '- If the user asks to change a renewal date, next payment date, due date, 续费日期, 下次付款日, or 到期日, return an update patch with nextPaymentDate. Use legacy lastPaymentDate only for an update when the user explicitly says a charge already happened.',
  '- For update, include only changed fields in patch.',
  '- Never execute anything; only describe the command for user confirmation.',
].join('\n');

const PATCH_PROPERTIES = {
  name: { type: 'string' },
  category: { type: 'string' },
  amount: { type: 'number' },
  currency: { type: 'string', enum: [...SUBSCRIPTION_CURRENCIES] },
  period: { type: 'string', enum: [...SUBSCRIPTION_PERIODS] },
  lastPaymentDate: { type: 'string' },
  nextPaymentDate: { type: 'string' },
  customDate: { type: 'string' },
  notificationEnabled: { type: 'boolean' },
} as const;

export const AI_COMMAND_OUTPUT_SCHEMA = {
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
          nextPaymentDate: { type: 'string' },
          customDate: { type: 'string' },
          notificationEnabled: { type: 'boolean' },
        },
        required: ['name', 'amount', 'currency', 'period'],
        additionalProperties: false,
      },
    },
    patch: {
      type: 'object',
      properties: { ...PATCH_PROPERTIES },
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
            properties: { ...PATCH_PROPERTIES },
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

export const buildUserPromptText = (input: CaptureInput, today: string): string => {
  const instruction = input.text && input.text.trim()
    ? input.text
    : 'Parse the requested subscription command from the attached image.';
  return [
    `Current date: ${today}`,
    `Current subscriptions: ${JSON.stringify(input.subscriptions)}`,
    '',
    instruction,
  ].join('\n');
};

export const parseNormalizedAiCommand = (
  rawText: string,
  today: string,
  subscriptions: CaptureInput['subscriptions']
): AiCommand => {
  let raw: unknown = {};
  try {
    raw = JSON.parse(rawText);
  } catch {
    raw = {};
  }

  return normalizeAiCommand(raw, today, subscriptions).command;
};
