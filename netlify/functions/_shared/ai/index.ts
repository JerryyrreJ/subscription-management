import type { AiConfig } from '../env';
import { createAnthropicParser } from './anthropicParser';
import { createOpenRouterParser } from './openRouterParser';
import type { SubscriptionParser } from './types';

export type { CaptureInput, CaptureImage, ParseResult, ParseUsage, SubscriptionParser } from './types';

// Returns the configured parser, or null when the feature is unavailable (no key
// configured — e.g. a self-host that hasn't supplied one). The handler treats
// null as "AI capture off" and the UI falls back to the manual form.
export const createParser = (config: AiConfig): SubscriptionParser | null => {
  if (!config.apiKey) {
    return null;
  }

  switch (config.provider) {
    case 'anthropic':
      return createAnthropicParser(config);
    case 'openrouter':
      return createOpenRouterParser(config);
    default:
      return null;
  }
};
