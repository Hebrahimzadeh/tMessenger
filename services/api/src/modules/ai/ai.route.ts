import type { FastifyInstance } from 'fastify';
import { aiRequestInputSchema, aiResultViewSchema } from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { getOptionalSession } from '../auth/session-guard';
import { AiOrchestrator } from './orchestrator';
import { PolicyViolationError } from './policy-guard';

export interface AiRouteOptions {
  sessionHmacKey: string;
  orchestrator: AiOrchestrator;
}

export async function aiRoutes(app: FastifyInstance, opts: AiRouteOptions) {
  /**
   * The only way into the model from outside this process.
   *
   * It replaces the old `/api/gemini` route, which took whatever prompt a
   * browser sent and forwarded it. Here the caller names a capability and a
   * source, must back both with provenance, and the guard checks that claim
   * against the database before anything is sent.
   *
   * The response is always a suggestion, never an instruction: a caller that
   * wants to change anything in the domain does so through that domain's own
   * endpoints, with the person confirming - "AI result فقط پیشنهاد است".
   */
  app.post('/ai/suggest', async (request, reply) => {
    // Optional rather than required: guidance on a public space is useful to
    // a visitor, and the quota simply does not apply to someone with no
    // session. The guard, the budget and the schema still do.
    const user = getOptionalSession(request, opts.sessionHmacKey);
    const input = aiRequestInputSchema.parse(request.body);

    try {
      const result = await opts.orchestrator.generate(input, user?.userId ?? null);
      return aiResultViewSchema.parse(result);
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        // 422 rather than 403: the request was understood and refused on
        // policy, and the code says exactly which policy.
        return reply.code(422).send(apiError(request, err.code, 'این ورودی مجاز نیست.'));
      }
      throw err;
    }
  });
}
