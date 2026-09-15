import type { AiCapability } from '@taavon/contracts';

export interface ProviderInput {
  capability: AiCapability;
  /** The rendered prompt, already minimized by the orchestrator. */
  prompt: string;
  systemInstruction?: string;
  /** Hard ceiling the orchestrator enforces on its own side too. */
  timeoutMs: number;
}

export interface ProviderResult {
  /** Raw text. The orchestrator parses and validates it; a provider never decides what is valid. */
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Micros, never a float - money must not be summed in binary floating point. */
  costMicros: number;
}

export class ProviderUnavailableError extends Error {
  constructor(message = 'The model provider is unavailable.') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export class ProviderTimeoutError extends Error {
  constructor(message = 'The model provider did not answer in time.') {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

/**
 * The one seam between this codebase and any model vendor.
 *
 * It is deliberately narrow: text in, text and usage out. A provider does not
 * parse, validate, decide what a capability means, or know what a space or a
 * card is. Everything that matters - which sources a capability may read,
 * whether the output is acceptable, what happens when it is not - lives in
 * the orchestrator, where it is testable without a network and cannot differ
 * between vendors.
 *
 * That is also what makes "خاموشی provider مسیر کارت دستی را نمی‌بندد" true:
 * nothing in the domain depends on this interface, only the orchestrator
 * does, and the orchestrator always has an answer.
 */
export interface AiProvider {
  readonly name: string;
  generate(input: ProviderInput): Promise<ProviderResult>;
}
