import { ProviderTimeoutError, ProviderUnavailableError, type AiProvider, type ProviderInput, type ProviderResult } from './ai-provider';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Rough token accounting. The API does return usage metadata, but it is
 * absent often enough (errors, partial responses) that the budget cannot
 * depend on it. Four characters per token is the usual English
 * approximation and runs high for Persian, which is the safe direction to
 * be wrong in: overestimating spends the budget early rather than
 * overshooting it.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Gemini Flash pricing, in micros per thousand tokens. Adjust with the vendor's own rates. */
const INPUT_MICROS_PER_1K = 75;
const OUTPUT_MICROS_PER_1K = 300;

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * The real vendor adapter, and the whole of this codebase's knowledge of
 * Gemini.
 *
 * Task 23 moved it off the `/api/gemini` route it used to live on. That route
 * took an arbitrary prompt from the browser and forwarded it, which meant the
 * model's input was whatever a client chose to send and nothing checked
 * where it came from. Behind this interface the orchestrator decides what is
 * sent, and the guard decides whether it may be.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model = 'gemini-2.0-flash'
  ) {}

  async generate(input: ProviderInput): Promise<ProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}/${this.model}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: input.prompt }] }],
          systemInstruction: input.systemInstruction ? { parts: [{ text: input.systemInstruction }] } : undefined,
          // Low temperature on purpose: every capability here produces
          // structured output a schema has to accept, and creativity in that
          // context is just a higher rejection rate.
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200, responseMimeType: 'application/json' },
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw new ProviderTimeoutError();
      throw new ProviderUnavailableError();
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // The status is deliberately not carried into the message: an upstream
      // error body can echo the prompt back, and nothing from a failed
      // response should end up in a log line.
      throw new ProviderUnavailableError(`Provider responded with ${response.status}.`);
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new ProviderUnavailableError('Provider returned no text.');

    const inputTokens = data.usageMetadata?.promptTokenCount ?? estimateTokens(input.prompt);
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? estimateTokens(text);

    return {
      text,
      model: this.model,
      inputTokens,
      outputTokens,
      costMicros: Math.ceil(
        (inputTokens / 1000) * INPUT_MICROS_PER_1K + (outputTokens / 1000) * OUTPUT_MICROS_PER_1K
      ),
    };
  }
}
