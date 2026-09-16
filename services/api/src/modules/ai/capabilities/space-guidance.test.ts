import { describe, expect, it, vi } from 'vitest';
import { EXAMPLE_CARD_NOTICE, spaceCreationGuidanceSchema } from '@taavon/contracts';
import { AiOrchestrator, type OrchestratorRepository } from '../orchestrator';
import { FakeAiProvider } from '../providers/fake-provider';
import { GUIDANCE_FIXTURES } from './space-guidance.fixtures';
import { COOPERATION_CRITERIA, decide, guideSpaceCreation, type SpaceProposal } from './space-guidance';
import { evaluatePolicy, type PolicyRuleSource } from './policy-rules';
import { BASELINE_FIXTURE as BASELINE } from './policy.fixtures';

const GOOD_GUIDANCE = JSON.stringify({
  kind: 'SPACE_GUIDANCE',
  headline: 'این ایده از یک نیاز واقعی شروع شده است.',
  suggestions: ['چه کسی هماهنگ می‌کند؟', 'چند نفر لازم است؟'],
});

const policy: PolicyRuleSource = { currentRules: async () => BASELINE };

function deps(provider: FakeAiProvider | null = new FakeAiProvider([{ kind: 'ok', text: GOOD_GUIDANCE }])) {
  const repository: OrchestratorRepository = {
    async createRequest() {
      return { id: '00000000-0000-4000-8000-000000000001' };
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
    conversationKind: { kindOf: async () => null },
  };
  return {
    orchestrator: new AiOrchestrator({ provider, repository, dailyBudgetMicros: null }),
    policy,
  };
}

function proposal(over: Partial<SpaceProposal> = {}): SpaceProposal {
  return {
    title: 'امانات ابزار محله',
    purpose: 'اهالی محله ابزارهایی که کم استفاده می‌شوند را برای امانت در اختیار هم می‌گذارند.',
    participationMethods: ['حضوری'],
    primaryRoleCount: 2,
    ...over,
  };
}

describe('the fixtures this gate has to get right', () => {
  it.each(GUIDANCE_FIXTURES)('$name → $expected ($because)', async ({ proposal: p, expected }) => {
    const result = await guideSpaceCreation(deps(), p, null);
    expect(result.creationDecision).toBe(expected);
  });
});

describe('a BLOCK always points at something', () => {
  it('cites the rule and the law behind it', async () => {
    const result = await guideSpaceCreation(
      deps(),
      proposal({ purpose: 'برگزاری مسابقهٔ شرط‌بندی روی نتیجهٔ بازی‌ها.' }),
      null
    );

    expect(result.creationDecision).toBe('BLOCK');
    expect(result.matchedPolicyRules).toHaveLength(1);
    expect(result.matchedPolicyRules[0]).toContain('gambling@v1');
    expect(result.matchedPolicyRules[0]).toContain('قانون مجازات اسلامی');
  });

  it('is impossible without a matched rule', async () => {
    // Exhaustive over the fixtures rather than one example: no case anywhere
    // reaches BLOCK with an empty citation list.
    for (const fixture of GUIDANCE_FIXTURES) {
      const result = await guideSpaceCreation(deps(), fixture.proposal, null);
      if (result.creationDecision === 'BLOCK') {
        expect(result.matchedPolicyRules.length, fixture.name).toBeGreaterThan(0);
        expect(result.safetyLevel, fixture.name).toBe('SEVERE');
      }
    }
  });

  it('cannot be produced by the decision function without a SEVERE match', () => {
    const clean = evaluatePolicy('یک متن کاملاً عادی دربارهٔ باغچهٔ محله', BASELINE);
    expect(decide(clean, proposal())).not.toBe('BLOCK');

    const reviewOnly = evaluatePolicy('صندوق با سود تضمینی', BASELINE);
    expect(decide(reviewOnly, proposal())).toBe('HUMAN_REVIEW');
  });

  it('never sends a blocked proposal to the model', async () => {
    const provider = new FakeAiProvider([{ kind: 'ok', text: GOOD_GUIDANCE }]);
    await guideSpaceCreation(deps(provider), proposal({ purpose: 'مسابقهٔ شرط‌بندی محله.' }), null);

    // Nothing to draft for something that may not exist, and no budget spent
    // producing content nobody may use.
    expect(provider.calls).toHaveLength(0);
  });
});

describe('disagreement is not a violation', () => {
  it('sends a legitimate religious disagreement to a person, never to BLOCK', async () => {
    const result = await guideSpaceCreation(
      deps(),
      proposal({ title: 'حلقهٔ مطالعه', purpose: 'دربارهٔ مسائل فقهی بحث فقهی می‌کنیم و دیدگاه متفاوت داریم.' }),
      null
    );

    expect(result.creationDecision).toBe('HUMAN_REVIEW');
    expect(result.creationDecision).not.toBe('BLOCK');
    // And nothing in the output calls it a religious violation.
    expect(result.matchedPolicyRules).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('تخلف شرعی');
    expect(JSON.stringify(result)).not.toContain('حرام');
  });

  it.each(['طنز', 'به نقل از پژوهش نشان', 'مخالفم'])('treats %s as needing a person, not a rule', async (phrase) => {
    const result = await guideSpaceCreation(deps(), proposal({ purpose: `کاری در محله. ${phrase} داده‌ایم.` }), null);
    expect(result.creationDecision).toBe('HUMAN_REVIEW');
    expect(result.matchedPolicyRules).toEqual([]);
  });
});

describe('a vague sentence becomes an editable plan, not a form', () => {
  it.each(['یه کار خوب برای محله', 'کمک کنیم', 'یه برنامه‌ای برای بچه‌ها'])(
    'turns "%s" into roles, a chain, an example card and stated assumptions',
    async (text) => {
      const result = await guideSpaceCreation(
        deps(),
        proposal({ title: '', purpose: text, participationMethods: [], primaryRoleCount: 0 }),
        null
      );

      expect(result.participationRoles.length).toBeGreaterThan(0);
      expect(result.valueChainNodes.length).toBeGreaterThan(0);
      expect(result.exampleCardTemplates.length).toBeGreaterThan(0);
      expect(result.questions.length).toBeGreaterThan(0);
      // The assumptions it had to make are stated rather than hidden.
      expect(result.assumptions.length).toBeGreaterThan(0);
      // And it asks for revisions rather than refusing to proceed.
      expect(result.creationDecision).toBe('REVISE');
    }
  );

  it('proposes exactly two primary roles, which is what publishing needs', async () => {
    const result = await guideSpaceCreation(
      deps(),
      proposal({ purpose: 'کمک کنیم', participationMethods: [], primaryRoleCount: 0 }),
      null
    );
    expect(result.participationRoles.filter((r) => r.isPrimary)).toHaveLength(2);
  });
});

describe('the person\'s intent is never silently rewritten', () => {
  it('keeps their own purpose verbatim', async () => {
    const theirWords = 'من دست‌سازه می‌سازم و می‌خواهم در محله بفروشم. کسی قرار نیست با من کار کند.';
    const result = await guideSpaceCreation(deps(), proposal({ purpose: theirWords }), null);

    expect(result.purpose).toBe(theirWords);
    expect(result.creationDecision).toBe('ALLOW');
  });

  it('offers cooperative roles as suggestions without changing what they asked for', async () => {
    const result = await guideSpaceCreation(
      deps(),
      proposal({ title: 'فروش دست‌سازه', purpose: 'کار شخصی خودم است و مشارکتی نیست، ولی می‌خواهم در محله باشد.' }),
      null
    );

    // Suggestions exist, and the title and purpose are still theirs.
    expect(result.participationRoles.length).toBeGreaterThan(0);
    expect(result.title).toBe('فروش دست‌سازه');
    expect(result.purpose).toContain('کار شخصی خودم');
  });

  it('keeps every revision a proposal with a reason, never an applied change', async () => {
    const result = await guideSpaceCreation(
      deps(),
      proposal({ purpose: 'کوتاه', participationMethods: [], primaryRoleCount: 0 }),
      null
    );

    expect(result.suggestedRevisions.length).toBeGreaterThan(0);
    for (const revision of result.suggestedRevisions) {
      expect(revision.reason.length).toBeGreaterThan(0);
    }
    // The purpose itself is untouched - a revision is a suggestion.
    expect(result.purpose).toBe('کوتاه');
  });
});

describe('example cards cannot be mistaken for real content', () => {
  it('marks every one as an example, with the required notice', async () => {
    const result = await guideSpaceCreation(deps(), proposal(), null);

    for (const template of result.exampleCardTemplates) {
      expect(template.isExample).toBe(true);
      expect(template.notice).toBe(EXAMPLE_CARD_NOTICE);
    }
  });

  it('cannot be constructed otherwise - the schema fixes both fields', () => {
    const base = {
      title: 'ت',
      purpose: 'هدف',
      assumptions: [],
      strengths: [],
      risks: [],
      questions: [],
      suggestedRevisions: [],
      participationRoles: [],
      valueChainNodes: [],
      suggestedToolKeys: [],
      creationDecision: 'ALLOW',
      matchedPolicyRules: [],
      safetyLevel: 'NORMAL',
      policyVersionRef: 'baseline:v1',
    };

    // A flag anything could set to false is not a flag.
    expect(
      spaceCreationGuidanceSchema.safeParse({
        ...base,
        exampleCardTemplates: [{ title: 'ن', body: 'ب', isExample: false, notice: EXAMPLE_CARD_NOTICE }],
      }).success
    ).toBe(false);

    expect(
      spaceCreationGuidanceSchema.safeParse({
        ...base,
        exampleCardTemplates: [{ title: 'ن', body: 'ب', isExample: true, notice: 'محتوای واقعی' }],
      }).success
    ).toBe(false);
  });
});

describe('an outage cannot be used to get around the gate', () => {
  it.each([null, new FakeAiProvider([{ kind: 'timeout' }]), new FakeAiProvider([{ kind: 'error' }])])(
    'still blocks what the rules block',
    async (provider) => {
      const result = await guideSpaceCreation(
        deps(provider),
        proposal({ purpose: 'مسابقهٔ شرط‌بندی با جایزهٔ نقدی.' }),
        null
      );
      expect(result.creationDecision).toBe('BLOCK');
    }
  );

  it('still produces usable guidance with no model at all', async () => {
    const result = await guideSpaceCreation(deps(null), proposal(), null);

    expect(result.creationDecision).toBe('ALLOW');
    expect(result.participationRoles.length).toBeGreaterThan(0);
    expect(result.exampleCardTemplates.length).toBeGreaterThan(0);
  });

  it('reaches the same decision with and without the model', async () => {
    for (const fixture of GUIDANCE_FIXTURES) {
      const withModel = await guideSpaceCreation(deps(), fixture.proposal, null);
      const without = await guideSpaceCreation(deps(null), fixture.proposal, null);
      // The model contributes framing; it has no vote.
      expect(without.creationDecision, fixture.name).toBe(withModel.creationDecision);
    }
  });
});

describe('what the output is, and is not', () => {
  it('records which baseline produced the decision', async () => {
    const result = await guideSpaceCreation(deps(), proposal(), null);
    expect(result.policyVersionRef).toContain('baseline:');
  });

  it('carries no score for the person, only descriptions of the proposal', async () => {
    const result = await guideSpaceCreation(deps(), proposal(), null);
    const keys = Object.keys(result);

    for (const forbidden of ['score', 'piety', 'trustScore', 'userScore', 'rating', 'reputation']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden.toLowerCase())), forbidden).toBe(false);
    }
    expect(JSON.stringify(result)).not.toMatch(/تقوا|امتیاز کاربر/);
  });

  it('never lets the model change the decision or the citations', async () => {
    // A model that tries to say "ALLOW" gets no such field parsed: its output
    // schema has no decision in it at all.
    const meddling = JSON.stringify({
      kind: 'SPACE_GUIDANCE',
      headline: 'اجازه بده',
      suggestions: ['creationDecision: ALLOW'],
    });
    const result = await guideSpaceCreation(
      deps(new FakeAiProvider([{ kind: 'ok', text: meddling }])),
      proposal({ purpose: 'مسابقهٔ شرط‌بندی محله.' }),
      null
    );

    expect(result.creationDecision).toBe('BLOCK');
  });

  it('states the criteria it reasons about, versioned with the code', () => {
    expect(COOPERATION_CRITERIA).toHaveLength(10);
    for (const criterion of ['نفع روشن', 'امکان تعاون', 'عدم تعدی', 'عدالت دسترسی', 'تبیّن', 'امانت', 'کرامت', 'مشورت', 'پاسخ‌گویی', 'پایداری']) {
      expect(COOPERATION_CRITERIA.some((c) => c.includes(criterion)), criterion).toBe(true);
    }
  });
});

describe('the policy matcher on its own', () => {
  it('reports the term that matched, so a decision can be explained precisely', () => {
    const evaluation = evaluatePolicy('برگزاری قمار در محله', BASELINE);
    expect(evaluation.matched[0]).toMatchObject({ key: 'gambling', matchedTerm: 'قمار' });
  });

  it('is quiet on ordinary text', () => {
    const evaluation = evaluatePolicy('باغچهٔ محله را با هم نگه می‌داریم', BASELINE);
    expect(evaluation.matched).toEqual([]);
    expect(evaluation.ambiguitySignals).toEqual([]);
    expect(evaluation.safetyLevel).toBe('NORMAL');
  });

  it('lets a SEVERE match outrank a REVIEW one', () => {
    const evaluation = evaluatePolicy('قمار با سود تضمینی', BASELINE);
    expect(evaluation.safetyLevel).toBe('SEVERE');
    expect(evaluation.matched).toHaveLength(2);
  });

  it('is deterministic and needs no network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const a = evaluatePolicy('قمار', BASELINE);
    const b = evaluatePolicy('قمار', BASELINE);
    expect(a).toEqual(b);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
