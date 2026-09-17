import { ProviderTimeoutError, ProviderUnavailableError, type AiProvider, type ProviderInput, type ProviderResult } from './ai-provider';

/**
 * Google's own endpoint, and the default.
 *
 * Overridable because reaching it is not a given. Verified on 2026-09-18 from
 * the production host: Google answers `400 FAILED_PRECONDITION - User location
 * is not supported for the API use`, and it is not the key or the DNS
 * unblocker at fault. The unblocker works - the hostname resolves to its
 * German relay and the TLS certificate that comes back is genuinely Google's -
 * but Google refuses that relay's addresses for this API. Swapping keys does
 * nothing; the request never gets far enough for the key to matter.
 *
 * `GEMINI_BASE_URL` lets a deployment point at any gateway that speaks the
 * same `{model}:generateContent?key=` shape, so a working path can be
 * configured without a release.
 */
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Checked against the live API on 2026-09-17: `gemini-2.0-flash`, which this
 * shipped with, now answers 404 with "no longer available ... use
 * models/gemini-3.6-flash".
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

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

  /**
   * The model is a parameter with a default rather than a constant, and the
   * default is worth keeping current: Google retires these on a schedule and
   * a retired one answers 404, which the orchestrator can only report as a
   * provider failure. `GEMINI_MODEL` lets a deployment move to the successor
   * the moment it is named, without waiting for a release.
   */
  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_GEMINI_MODEL,
    private readonly baseUrl = DEFAULT_GEMINI_BASE_URL
  ) {}

  async generate(input: ProviderInput): Promise<ProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: input.prompt }] }],
          systemInstruction: input.systemInstruction ? { parts: [{ text: input.systemInstruction }] } : undefined,
          // Low temperature on purpose: every capability here produces
          // structured output a schema has to accept, and creativity in that
          // context is just a higher rejection rate.
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: input.maxOutputTokens ?? 1200,
            responseMimeType: 'application/json',
          },
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
