'use client';

import { aiResultViewSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

/**
 * Text generation for the prototype mini-apps.
 *
 * Task 23 moved this off `/api/gemini`, a Next route that forwarded whatever
 * prompt the browser sent straight to the vendor. Nothing checked what was
 * being sent or where it came from, and the model's input was effectively
 * whatever a client chose. It now goes through the API's orchestrator, which
 * means the policy guard, the quota, the budget, the ten-second timeout and
 * the output schema all apply to these calls too.
 *
 * `ASSISTANT_REPLY` with `USER_TYPED` provenance is the honest description of
 * what these mini-apps do: a person typed something and wants prose back.
 * When the model is unavailable the orchestrator answers from its fallback,
 * so this resolves rather than throwing - the caller gets text either way.
 */
export function useGemini() {
  /**
   * `systemInstruction` is folded into the input rather than passed as a
   * privileged channel. That is the point of the move: on the old route a
   * client could set the system instruction directly, which is the strongest
   * lever there is over what a model does. Here it is just more text from the
   * same person, subject to the same guard, quota, budget and schema. The
   * prompt that actually frames the request comes from the server's own
   * versioned template.
   */
  const generate = async (prompt: string, systemInstruction?: string): Promise<string> => {
    const text = systemInstruction ? `${systemInstruction}

${prompt}` : prompt;
    try {
      const result = aiResultViewSchema.parse(
        await apiFetch('/ai/suggest', {
          method: 'POST',
          body: JSON.stringify({
            capability: 'ASSISTANT_REPLY',
            source: 'PUBLIC_USER_INPUT',
            text,
            provenance: { kind: 'USER_TYPED' },
          }),
        })
      );

      if (result.output?.kind === 'ASSISTANT_REPLY') return result.output.reply;
      throw new Error('unexpected output');
    } catch (err) {
      throw new Error(
        err instanceof ApiError ? err.message : 'متأسفانه ارتباط با هوش مصنوعی با خطا مواجه شد. لطفاً دوباره تلاش کنید.'
      );
    }
  };

  return { generate };
}
