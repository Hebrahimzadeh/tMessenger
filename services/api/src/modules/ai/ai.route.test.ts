import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { AI_ERROR_CODES } from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import { aiRoutes } from './ai.route';
import { AiOrchestrator, type OrchestratorRepository } from './orchestrator';
import { FakeAiProvider } from './providers/fake-provider';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const USER = '11111111-1111-4111-8111-111111111111';
const DIRECT_CONVO = '22222222-2222-4222-8222-222222222222';
const ASSISTANT_CONVO = '33333333-3333-4333-8333-333333333333';

const GOOD_REPLY = JSON.stringify({ kind: 'ASSISTANT_REPLY', reply: 'می‌توانید از بستر امانات محله شروع کنید.' });

function repo(): OrchestratorRepository {
  let n = 0;
  return {
    async createRequest() {
      n += 1;
      return { id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` };
    },
    async recordResult() {},
    async recordUsage() {},
    async countRecentRequests() {
      return 0;
    },
    async spentTodayMicros() {
      return 0;
    },
    async currentPromptVersion() {
      return null;
    },
    conversationKind: {
      kindOf: async (id) => (id === DIRECT_CONVO ? 'DIRECT' : id === ASSISTANT_CONVO ? 'SYSTEM_ASSISTANT' : null),
    },
  };
}

function buildApp(provider: FakeAiProvider | null) {
  const app = Fastify();
  app.register(cookie);
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(apiError(request, 'VALIDATION_ERROR', 'داده ارسالی معتبر نیست.', err.issues));
      return;
    }
    reply.send(err);
  });
  app.register(aiRoutes, {
    prefix: '/v1',
    sessionHmacKey: SESSION_HMAC_KEY,
    orchestrator: new AiOrchestrator({ provider, repository: repo(), dailyBudgetMicros: null }),
  });
  return app;
}

function cookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

const validBody = {
  capability: 'ASSISTANT_REPLY',
  source: 'PUBLIC_USER_INPUT',
  text: 'چطور یک بستر برای امانت ابزار بسازم؟',
  provenance: { kind: 'USER_TYPED' },
};

describe('POST /v1/ai/suggest', () => {
  it('returns a validated suggestion', async () => {
    const app = buildApp(new FakeAiProvider([{ kind: 'ok', text: GOOD_REPLY }]));

    const response = await app.inject({ method: 'POST', url: '/v1/ai/suggest', cookies: cookieFor(USER), payload: validBody });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ outcome: 'SUGGESTION', output: { kind: 'ASSISTANT_REPLY' } });
    await app.close();
  });

  it('serves a visitor with no session, since public guidance is useful to one', async () => {
    const app = buildApp(new FakeAiProvider([{ kind: 'ok', text: GOOD_REPLY }]));

    const response = await app.inject({ method: 'POST', url: '/v1/ai/suggest', payload: validBody });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('refuses a direct conversation with its own code, not a generic error', async () => {
    const app = buildApp(new FakeAiProvider([{ kind: 'ok', text: GOOD_REPLY }]));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/suggest',
      cookies: cookieFor(USER),
      payload: {
        capability: 'ASSISTANT_REPLY',
        source: 'ASSISTANT_CONVERSATION',
        text: 'متن خصوصی',
        provenance: { kind: 'ASSISTANT_THREAD', conversationId: DIRECT_CONVO },
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe(AI_ERROR_CODES.privateInputForbidden);
    // The refused text never comes back in the response either.
    expect(response.body).not.toContain('متن خصوصی');
    await app.close();
  });

  it('allows a genuine assistant thread', async () => {
    const app = buildApp(new FakeAiProvider([{ kind: 'ok', text: GOOD_REPLY }]));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/suggest',
      cookies: cookieFor(USER),
      payload: {
        capability: 'ASSISTANT_REPLY',
        source: 'ASSISTANT_CONVERSATION',
        text: 'سلام همیار',
        provenance: { kind: 'ASSISTANT_THREAD', conversationId: ASSISTANT_CONVO },
      },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('rejects a source the enum does not have - there is no private-message value to send', async () => {
    const app = buildApp(new FakeAiProvider([{ kind: 'ok', text: GOOD_REPLY }]));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/suggest',
      cookies: cookieFor(USER),
      payload: { ...validBody, source: 'PRIVATE_DIRECT_MESSAGE' },
    });

    // Not a policy refusal - the value simply does not exist, so it fails
    // validation before any of this module's own logic runs.
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('rejects a body with no provenance at all', async () => {
    const app = buildApp(new FakeAiProvider([{ kind: 'ok', text: GOOD_REPLY }]));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/suggest',
      cookies: cookieFor(USER),
      payload: { capability: 'ASSISTANT_REPLY', source: 'PUBLIC_USER_INPUT', text: 'سلام' },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('answers with a fallback rather than an error when the provider is off', async () => {
    const app = buildApp(null);

    const response = await app.inject({ method: 'POST', url: '/v1/ai/suggest', cookies: cookieFor(USER), payload: validBody });

    // The caller gets something usable, so no domain path depends on the
    // model being available.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ outcome: 'FALLBACK', errorCode: AI_ERROR_CODES.disabled });
    expect(response.json().output.kind).toBe('ASSISTANT_REPLY');
    await app.close();
  });

  it('answers with a fallback when the model returns nonsense', async () => {
    const app = buildApp(new FakeAiProvider([{ kind: 'invalid-json' }]));

    const response = await app.inject({ method: 'POST', url: '/v1/ai/suggest', cookies: cookieFor(USER), payload: validBody });

    expect(response.json()).toMatchObject({ outcome: 'FALLBACK', errorCode: AI_ERROR_CODES.invalidOutput });
    await app.close();
  });

  it('rejects an over-long input before anything is sent', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_REPLY }]);
    const app = buildApp(provider);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/ai/suggest',
      cookies: cookieFor(USER),
      payload: { ...validBody, text: 'ا'.repeat(9000) },
    });

    expect(response.statusCode).toBe(400);
    expect(provider.calls).toHaveLength(0);
    await app.close();
  });

  it('never returns a reasoning trace, only the structured output', async () => {
    const withReasoning = JSON.stringify({
      kind: 'ASSISTANT_REPLY',
      reply: 'پاسخ',
      reasoning: 'first I considered... then I decided...',
    });
    const app = buildApp(new FakeAiProvider([{ kind: 'ok', text: withReasoning }]));

    const response = await app.inject({ method: 'POST', url: '/v1/ai/suggest', cookies: cookieFor(USER), payload: validBody });

    // The schema strips anything it did not ask for, so a model that
    // volunteers its reasoning cannot get it stored or returned.
    expect(response.json().output).toEqual({ kind: 'ASSISTANT_REPLY', reply: 'پاسخ' });
    expect(response.body).not.toContain('first I considered');
    await app.close();
  });
});
