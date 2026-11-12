import type { AiConfig } from '../env';
import {
  AI_COMMAND_OUTPUT_SCHEMA,
  AI_COMMAND_SYSTEM_PROMPT,
  buildUserPromptText,
  parseNormalizedAiCommand,
} from './sharedPrompt';
import type { CaptureInput, ParseResult, SubscriptionParser } from './types';

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
      schema: typeof AI_COMMAND_OUTPUT_SCHEMA;
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

    content.push({
      type: 'text',
      text: buildUserPromptText(input, today),
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
          { role: 'system', content: AI_COMMAND_SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        provider: { require_parameters: true },
        max_tokens: 1024,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'subscription_command',
            strict: true,
            schema: AI_COMMAND_OUTPUT_SCHEMA,
          },
        },
      } satisfies OpenRouterRequest),
    });

    const body = await response.json().catch(() => ({})) as OpenRouterResponse;
    if (!response.ok) {
      throw new Error(body.error?.message ?? `OpenRouter request failed (${response.status})`);
    }

    const text = extractText(body.choices?.[0]?.message?.content);
    const command = parseNormalizedAiCommand(text, today, input.subscriptions);

    return {
      command,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      },
    };
  },
});
