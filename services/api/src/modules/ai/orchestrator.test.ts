import { describe, expect, it, vi } from 'vitest';
import { AI_ERROR_CODES, type AiOutput, type AiRequestInput } from '@taavon/contracts';
import {
  AI_QUOTA_PER_USER,
  AiOrchestrator,
  CIRCUIT_COOLDOWN_MS,
  CIRCUIT_FAILURE_THRESHOLD,
  renderPrompt,
  type OrchestratorRepository,
} from './orchestrator';
import { PolicyViolationError } from './policy-guard';
import { FakeAiProvider } from './providers/fake-provider';

const USER = '11111111-1111-4111-8111-111111111111';
const DIRECT_CONVO = '22222222-2222-4222-8222-222222222222';
const ASSISTANT_CONVO = '33333333-3333-4333-8333-333333333333';

const GOOD_CARD = JSON.stringify({ kind: 'CARD_DRAFT', title: 'نردبان محله', body: 'نردبان سه‌متری برای امانت.' });

function cardInput(over: Partial<AiRequestInput> = {}): AiRequestInput {
  return {
    capability: 'CARD_DRAFT',
    source: 'PUBLIC_USER_INPUT',
    text: 'یک نردبان دارم که می‌تواند در محله امانت داده شود',
    provenance: { kind: 'USER_TYPED' },
    ...over,
  };
}

function fakeRepo(over: Partial<OrchestratorRepository> = {}) {
  const requests: { id: string; inputHash: string; inputChars: number }[] = [];
  const results: { requestId: string; outcome: string; payload: AiOutput | null; errorCode: string | null }[] = [];
  const usage: { requestId: string; costMicros: number }[] = [];

  const repo: OrchestratorRepository = {
    async createRequest(input) {
      const row = { id: `req-${requests.length + 1}`, inputHash: input.inputHash, inputChars: input.inputChars };
      requests.push(row);
      return { id: row.id };
    },
    async recordResult(input) {
      results.push(input);
    },
    async recordUsage(requestId, u) {
      usage.push({ requestId, costMicros: u.costMicros });
    },
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
    ...over,
  };

  return { repo, requests, results, usage };
}

function orchestrator(provider: FakeAiProvider | null, repoOver: Partial<OrchestratorRepository> = {}, opts = {}) {
  const { repo, requests, results, usage } = fakeRepo(repoOver);
  return {
    ai: new AiOrchestrator({ provider, repository: repo, dailyBudgetMicros: 1_000_000, ...opts }),
    requests,
    results,
    usage,
  };
}

describe('the happy path', () => {
  it('returns a validated suggestion and records what it cost', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_CARD }]);
    const { ai, results, usage } = orchestrator(provider);

    const result = await ai.generate(cardInput(), USER);

    expect(result.outcome).toBe('SUGGESTION');
    expect(result.output).toEqual({ kind: 'CARD_DRAFT', title: 'نردبان محله', body: 'نردبان سه‌متری برای امانت.' });
    expect(result.errorCode).toBeNull();
    expect(results).toHaveLength(1);
    expect(usage).toHaveLength(1);
  });

  it('stores the input\'s shape and never its text', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_CARD }]);
    const { ai, requests } = orchestrator(provider);
    const input = cardInput();

    await ai.generate(input, USER);

    const stored = requests[0]!;
    expect(stored.inputChars).toBe(input.text.length);
    expect(stored.inputHash).toMatch(/^[0-9a-f]{64}$/);
    // The hash identifies a replay; it is not the text.
    expect(stored.inputHash).not.toContain(input.text);
    expect(JSON.stringify(stored)).not.toContain(input.text);
  });

  it('sends only the one input, never anything the caller did not pass', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_CARD }]);
    const { ai } = orchestrator(provider);
    const input = cardInput();

    await ai.generate(input, USER);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.prompt).toBe(input.text);
  });
});

describe('a policy refusal is not a degraded outcome', () => {
  it('throws rather than falling back when a direct conversation is offered', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_CARD }]);
    const { ai, requests, results } = orchestrator(provider);

    await expect(
      ai.generate(
        cardInput({
          capability: 'ASSISTANT_REPLY',
          source: 'ASSISTANT_CONVERSATION',
          provenance: { kind: 'ASSISTANT_THREAD', conversationId: DIRECT_CONVO },
        }),
        USER
      )
    ).rejects.toBeInstanceOf(PolicyViolationError);

    // Nothing was stored and nothing was sent - a refused request leaves no
    // record of the text's shape either.
    expect(requests).toHaveLength(0);
    expect(results).toHaveLength(0);
    expect(provider.calls).toHaveLength(0);
  });

  it('carries the private-input code so it can be alerted on separately', async () => {
    const { ai } = orchestrator(new FakeAiProvider());
    const error = await ai
      .generate(
        cardInput({
          capability: 'ASSISTANT_REPLY',
          source: 'ASSISTANT_CONVERSATION',
          provenance: { kind: 'ASSISTANT_THREAD', conversationId: DIRECT_CONVO },
        }),
        USER
      )
      .catch((e: unknown) => e);

    expect((error as PolicyViolationError).code).toBe(AI_ERROR_CODES.privateInputForbidden);
  });
});

describe('every other failure degrades instead of breaking the caller', () => {
  it.each([
    ['timeout' as const, AI_ERROR_CODES.timeout],
    ['error' as const, AI_ERROR_CODES.providerFailed],
    ['invalid-json' as const, AI_ERROR_CODES.invalidOutput],
    ['wrong-shape' as const, AI_ERROR_CODES.invalidOutput],
  ])('answers with a fallback when the provider %ss', async (behaviour, expectedCode) => {
    const provider = new FakeAiProvider([{ kind: behaviour }]);
    const { ai } = orchestrator(provider);

    const result = await ai.generate(cardInput(), USER);

    expect(result.outcome).toBe('FALLBACK');
    expect(result.errorCode).toBe(expectedCode);
    // A usable answer, not an error the caller has to handle.
    expect(result.output).toMatchObject({ kind: 'CARD_DRAFT' });
  });

  // Valid JSON of the wrong shape is the case a bare JSON.parse lets through,
  // and the one a model actually produces most often.
  it('refuses valid JSON that does not match the capability', async () => {
    const provider = new FakeAiProvider([{ kind: 'wrong-shape' }]);
    const { ai } = orchestrator(provider);

    const result = await ai.generate(cardInput(), USER);
    expect(result.errorCode).toBe(AI_ERROR_CODES.invalidOutput);
    expect(result.output).not.toMatchObject({ somethingElse: true });
  });

  it('answers with a fallback when there is no provider at all', async () => {
    const { ai } = orchestrator(null);

    const result = await ai.generate(cardInput(), USER);

    // "خاموشی provider مسیر کارت دستی را نمی‌بندد" - the manual path is
    // untouched because the caller still gets a usable draft.
    expect(result.outcome).toBe('FALLBACK');
    expect(result.errorCode).toBe(AI_ERROR_CODES.disabled);
    expect(result.output).toMatchObject({ kind: 'CARD_DRAFT' });
  });

  it('keeps the person\'s own words in the card fallback rather than inventing any', async () => {
    const { ai } = orchestrator(null);
    const input = cardInput();

    const result = await ai.generate(input, USER);
    expect(result.output).toMatchObject({ body: input.text });
  });

  it('still records usage when the output turns out to be unusable', async () => {
    const provider = new FakeAiProvider([{ kind: 'invalid-json' }]);
    const { ai, usage } = orchestrator(provider);

    await ai.generate(cardInput(), USER);

    // The call was made and the money was spent. A budget that counted only
    // successes would undercount exactly when things go worst.
    expect(usage).toHaveLength(1);
  });
});

describe('quota and budget', () => {
  it('falls back once a person is over their quota, without calling the provider', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_CARD }]);
    const { ai } = orchestrator(provider, { countRecentRequests: async () => AI_QUOTA_PER_USER + 5 });

    const result = await ai.generate(cardInput(), USER);

    expect(result.outcome).toBe('FALLBACK');
    expect(result.errorCode).toBe(AI_ERROR_CODES.quotaExceeded);
    expect(provider.calls).toHaveLength(0);
  });

  it('falls back once the day\'s budget is spent', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_CARD }]);
    const { ai } = orchestrator(provider, { spentTodayMicros: async () => 1_000_000 });

    const result = await ai.generate(cardInput(), USER);

    expect(result.errorCode).toBe(AI_ERROR_CODES.budgetExhausted);
    expect(provider.calls).toHaveLength(0);
  });

  it('still calls the provider while there is budget left', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_CARD }]);
    const { ai } = orchestrator(provider, { spentTodayMicros: async () => 999_999 });

    await expect(ai.generate(cardInput(), USER)).resolves.toMatchObject({ outcome: 'SUGGESTION' });
  });

  it('skips the quota check entirely for an anonymous caller, rather than erroring', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_CARD }]);
    const countRecentRequests = vi.fn(async () => 0);
    const { ai } = orchestrator(provider, { countRecentRequests });

    await ai.generate(cardInput(), null);
    expect(countRecentRequests).not.toHaveBeenCalled();
  });
});

describe('the circuit breaker', () => {
  it('stops dialling a dead provider after repeated failures', async () => {
    const provider = new FakeAiProvider([{ kind: 'error' }]);
    const { ai } = orchestrator(provider);

    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) {
      await ai.generate(cardInput(), USER);
    }
    const callsBefore = provider.calls.length;

    const afterOpen = await ai.generate(cardInput(), USER);

    expect(afterOpen.errorCode).toBe(AI_ERROR_CODES.circuitOpen);
    expect(provider.calls).toHaveLength(callsBefore);
  });

  it('lets one request through again after the cooldown', async () => {
    const provider = new FakeAiProvider([{ kind: 'error' }]);
    let clock = 0;
    const { repo } = fakeRepo();
    const ai = new AiOrchestrator({ provider, repository: repo, dailyBudgetMicros: null, now: () => clock });

    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) await ai.generate(cardInput(), USER);
    const callsWhenOpen = provider.calls.length;

    clock += CIRCUIT_COOLDOWN_MS + 1;
    await ai.generate(cardInput(), USER);

    // Half-open: it tries again rather than staying shut forever.
    expect(provider.calls.length).toBeGreaterThan(callsWhenOpen);
  });

  it('does not count a schema rejection against the circuit', async () => {
    // The vendor answered; the prompt needs fixing. Tripping the breaker here
    // would hide a prompt problem behind what looks like an outage.
    const provider = new FakeAiProvider([{ kind: 'wrong-shape' }]);
    const { ai } = orchestrator(provider);

    for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD + 2; i += 1) {
      const result = await ai.generate(cardInput(), USER);
      expect(result.errorCode).toBe(AI_ERROR_CODES.invalidOutput);
    }
  });
});

describe('the prompt', () => {
  it('substitutes the input where the template puts it', () => {
    expect(renderPrompt('پیش از این: {{input}} :پس از این', 'متن')).toBe('پیش از این: متن :پس از این');
  });

  it('appends when the template has no placeholder', () => {
    expect(renderPrompt('دستور', 'متن')).toBe('دستور\n\nمتن');
  });

  it('sends the input alone when no template is configured', () => {
    expect(renderPrompt(null, 'متن')).toBe('متن');
  });

  it('records which prompt version produced a result', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_CARD }]);
    const createRequest = vi.fn(async () => ({ id: 'req-1' }));
    const { ai } = orchestrator(provider, {
      createRequest,
      currentPromptVersion: async () => ({ id: 'prompt-7', template: 'الگو: {{input}}' }),
    });

    await ai.generate(cardInput(), USER);

    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ promptVersionId: 'prompt-7' }));
    expect(provider.calls[0]!.prompt).toContain('الگو:');
  });
});
