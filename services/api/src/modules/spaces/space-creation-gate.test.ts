import { describe, expect, it } from 'vitest';
import { createSpaceCreationGate, GATE_TIMEOUT_MS, type SpaceGateDefinitionInput } from './space-creation-gate';
import {
  brokenPolicySource,
  emptyPolicySource,
  fixtureGate,
  fixturePolicySource,
  noopOrchestratorRepository,
} from '../ai/capabilities/policy.fixtures';
import { AiOrchestrator } from '../ai/orchestrator';
import type { PolicyRule, PolicyRuleSource } from '../ai/capabilities/policy-rules';

const VALID_PURPOSE = 'اهالی محله ابزارهایی که کم استفاده می‌شوند را برای امانت در اختیار هم می‌گذارند.';

function definition(overrides: Partial<SpaceGateDefinitionInput> = {}): SpaceGateDefinitionInput {
  return {
    title: 'امانات ابزار محله',
    purpose: VALID_PURPOSE,
    participationMethods: ['حضوری'],
    primaryRoleCount: 2,
    ...overrides,
  };
}

describe('the four verdicts', () => {
  it('REVISE for a purpose too short to judge', async () => {
    const result = await fixtureGate().evaluate(definition({ purpose: 'کوتاه' }));
    expect(result.verdict).toBe('REVISE');
    // And it says what to change, rather than only that something is wrong.
    expect(result.guidance?.suggestedRevisions.length).toBeGreaterThan(0);
  });

  it('REVISE for no participation method', async () => {
    const result = await fixtureGate().evaluate(definition({ participationMethods: [] }));
    expect(result.verdict).toBe('REVISE');
  });

  it('REVISE for the wrong number of primary roles', async () => {
    expect((await fixtureGate().evaluate(definition({ primaryRoleCount: 1 }))).verdict).toBe('REVISE');
    expect((await fixtureGate().evaluate(definition({ primaryRoleCount: 3 }))).verdict).toBe('REVISE');
  });

  it('BLOCK for an explicit rule, citing the rule and the law', async () => {
    const result = await fixtureGate().evaluate(definition({ purpose: `${VALID_PURPOSE} این بستر برای قمار آنلاین است.` }));

    expect(result.verdict).toBe('BLOCK');
    expect(result.matchedPolicyRules).toHaveLength(1);
    expect(result.matchedPolicyRules[0]).toContain('gambling@v1');
    expect(result.matchedPolicyRules[0]).toContain('قانون مجازات اسلامی');
  });

  it('HUMAN_REVIEW for something flagged but not banned', async () => {
    const result = await fixtureGate().evaluate(definition({ purpose: `${VALID_PURPOSE} با تضمین سود ثابت ماهانه.` }));
    expect(result.verdict).toBe('HUMAN_REVIEW');
  });

  it('ALLOW for an ordinary, complete definition', async () => {
    const result = await fixtureGate().evaluate(definition());
    expect(result.verdict).toBe('ALLOW');
    expect(result.matchedPolicyRules).toEqual([]);
  });

  it('is deterministic', async () => {
    const input = definition({ purpose: `${VALID_PURPOSE} قمار` });
    const a = await fixtureGate().evaluate(input);
    const b = await fixtureGate().evaluate(input);
    expect(a.verdict).toBe(b.verdict);
    expect(a.matchedPolicyRules).toEqual(b.matchedPolicyRules);
  });
});

describe('every verdict names the baseline that produced it', () => {
  it('cites the baseline on an ALLOW as well as a BLOCK', async () => {
    const allowed = await fixtureGate().evaluate(definition());
    const blocked = await fixtureGate().evaluate(definition({ purpose: `${VALID_PURPOSE} قمار` }));

    // An approval nobody can trace back is as unexplainable as a refusal.
    expect(allowed.policyVersionRef).toBe('baseline:v1:8rules');
    expect(blocked.policyVersionRef).toBe('baseline:v1:8rules');
  });
});

describe('an outage cannot be used to get around the gate', () => {
  it('fails closed to HUMAN_REVIEW when the baseline cannot be read', async () => {
    const result = await fixtureGate(brokenPolicySource).evaluate(definition());

    // Not ALLOW, which would make every outage a way through; and not BLOCK,
    // which would punish people for an infrastructure fault.
    expect(result.verdict).toBe('HUMAN_REVIEW');
    expect(result.policyVersionRef).toBe('unavailable');
    expect(result.guidance).toBeNull();
  });

  it('fails closed when the baseline is empty, which matches nothing and looks clean', async () => {
    const result = await fixtureGate(emptyPolicySource).evaluate(definition());
    expect(result.verdict).toBe('HUMAN_REVIEW');
  });

  it('fails closed when the baseline hangs', async () => {
    const hanging: PolicyRuleSource = { currentRules: () => new Promise<PolicyRule[]>(() => {}) };
    const result = await fixtureGate(hanging, null, { timeoutMs: 20 }).evaluate(definition());
    expect(result.verdict).toBe('HUMAN_REVIEW');
  });

  it('a blocked definition stays blocked through every one of those failures', async () => {
    const blocked = definition({ purpose: `${VALID_PURPOSE} قمار` });

    // The policy source is what fails here, so these land in HUMAN_REVIEW
    // rather than BLOCK - the point being that none of them reaches ALLOW.
    for (const source of [brokenPolicySource, emptyPolicySource]) {
      expect((await fixtureGate(source).evaluate(blocked)).verdict).not.toBe('ALLOW');
    }
    // With the baseline readable, it is a BLOCK with or without a model.
    expect((await fixtureGate().evaluate(blocked)).verdict).toBe('BLOCK');
  });

  it('waits five seconds by default', () => {
    expect(GATE_TIMEOUT_MS).toBe(5_000);
  });
});

describe('the title check made before a slug is claimed', () => {
  it('refuses a title that matches a SEVERE rule', async () => {
    await expect(fixtureGate().blocksOnTitle('باشگاه قمار محله')).resolves.toBe(true);
  });

  it('lets an ordinary title through', async () => {
    await expect(fixtureGate().blocksOnTitle('امانات ابزار محله')).resolves.toBe(false);
  });

  it('does not refuse on a REVIEW rule - that is what the full precheck is for', async () => {
    await expect(fixtureGate().blocksOnTitle('صندوق با سود تضمینی')).resolves.toBe(false);
  });

  it('does not refuse when the baseline is unreadable', async () => {
    // Creating a draft nobody else can see is not the dangerous step;
    // publishing is, and `evaluate` guards that one.
    await expect(fixtureGate(brokenPolicySource).blocksOnTitle('باشگاه قمار محله')).resolves.toBe(false);
  });
});

describe('the model has no vote', () => {
  it('reaches the same verdict with a provider as without one', async () => {
    const withoutModel = createSpaceCreationGate({
      orchestrator: new AiOrchestrator({ provider: null, repository: noopOrchestratorRepository(), dailyBudgetMicros: null }),
      policy: fixturePolicySource,
    });

    for (const input of [
      definition(),
      definition({ purpose: 'کوتاه' }),
      definition({ purpose: `${VALID_PURPOSE} قمار` }),
      definition({ purpose: `${VALID_PURPOSE} با تضمین سود ثابت.` }),
    ]) {
      expect((await fixtureGate().evaluate(input)).verdict).toBe((await withoutModel.evaluate(input)).verdict);
    }
  });
});
