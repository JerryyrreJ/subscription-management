import type { AiCommand, AiSubscriptionContextItem } from '../../../../src/utils/aiCommand';

// The seam that keeps the model out of the business logic. The function depends
// only on SubscriptionParser; swapping models or providers — or self-hosting with
// a different backend — means adding an implementation and a factory case, not
// touching the handler.

export interface CaptureImage {
  mediaType: string;
  dataBase64: string;
}

export interface CaptureInput {
  text?: string;
  image?: CaptureImage;
  subscriptions: AiSubscriptionContextItem[];
}

export interface ParseUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ParseResult {
  command: AiCommand;
  usage: ParseUsage;
}

export interface SubscriptionParser {
  /** Turn one capture (sentence / pasted text / image) into reviewable drafts. */
  parse(input: CaptureInput, today: string): Promise<ParseResult>;
}
