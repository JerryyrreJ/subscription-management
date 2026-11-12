import Anthropic from '@anthropic-ai/sdk';
import type { AiConfig } from '../env';
import {
  AI_COMMAND_OUTPUT_SCHEMA,
  AI_COMMAND_SYSTEM_PROMPT,
  buildUserPromptText,
  parseNormalizedAiCommand,
} from './sharedPrompt';
import type { CaptureInput, ParseResult, SubscriptionParser } from './types';

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

      content.push({
        type: 'text',
        text: buildUserPromptText(input, today),
      });

      const params: StructuredMessageParams = {
        model: config.model,
        max_tokens: 1024,
        system: [{ type: 'text', text: AI_COMMAND_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content }],
        output_config: { format: { type: 'json_schema', schema: AI_COMMAND_OUTPUT_SCHEMA } },
      };

      const response = await client.messages.create(params);

      const text = response.content
        .map(block => (block.type === 'text' ? block.text : ''))
        .join('');

      const command = parseNormalizedAiCommand(text, today, input.subscriptions);

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
