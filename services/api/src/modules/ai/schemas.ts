import {
  AI_ERROR_CODES,
  OUTPUT_SCHEMA_BY_CAPABILITY,
  type AiCapability,
  type AiOutput,
} from '@taavon/contracts';

export class InvalidModelOutputError extends Error {
  readonly code = AI_ERROR_CODES.invalidOutput;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidModelOutputError';
  }
}

/**
 * Turns whatever the model said into a value the domain is allowed to see, or
 * refuses.
 *
 * Both failure modes are handled deliberately, because they are different and
 * only one of them is obvious. Prose where JSON was asked for fails at the
 * parse. Valid JSON of the wrong shape does not - it is the case a bare
 * `JSON.parse` in a try/catch lets straight through, and it is also what a
 * model does most often: right-looking object, missing field, empty string
 * where text was required. The schema is what catches that, which is why the
 * capability's own schema is applied rather than a generic "is it an object"
 * check.
 *
 * Models also like to wrap JSON in markdown fences even when told not to, so
 * one fence is stripped before parsing. That is a formatting quirk, not a
 * shape problem, and failing on it would reject correct answers.
 */
export function parseAndValidate(capability: AiCapability, raw: string): AiOutput {
  const cleaned = stripCodeFence(raw).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new InvalidModelOutputError('Model output was not JSON.');
  }

  const schema = OUTPUT_SCHEMA_BY_CAPABILITY[capability];
  const result = schema.safeParse(parsed);
  if (!result.success) {
    // The model's own text is deliberately absent from this message: it can
    // contain the input, and this message reaches logs.
    throw new InvalidModelOutputError(`Model output did not match the ${capability} schema.`);
  }

  return result.data;
}

function stripCodeFence(text: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(text);
  return fenced?.[1] ?? text;
}
