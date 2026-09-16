import { describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { createPrismaPolicyRuleSource } from './policy.repository';
import { BASELINE_FIXTURE } from './policy.fixtures';
import { evaluatePolicy, policyVersionRef } from './policy-rules';

async function probeDatabaseAvailability(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000));
    const probe = getPrisma().$queryRaw`SELECT 1`.then(() => 'ok' as const);
    return (await Promise.race([probe, timeout])) === 'ok';
  } catch {
    return false;
  }
}

const databaseAvailable = await probeDatabaseAvailability();

const byKey = <T extends { key: string }>(rules: T[]): T[] => [...rules].sort((a, b) => a.key.localeCompare(b.key));

describe.skipIf(!databaseAvailable)('the seeded policy baseline: real Postgres', () => {
  it('is exactly what the fixture says it is', async () => {
    const rules = await createPrismaPolicyRuleSource(getPrisma()).currentRules();

    // Every unit test in this task reasons about `BASELINE_FIXTURE`. This is
    // the assertion that makes those tests mean something about production
    // rather than about a copy of the rules that has quietly drifted.
    expect(byKey(rules)).toEqual(byKey(BASELINE_FIXTURE));
  });

  it('carries a source and an example for every rule', async () => {
    const rules = await createPrismaPolicyRuleSource(getPrisma()).currentRules();

    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      // A rule nobody can trace to a law or a published policy, and that
      // carries no concrete case, is not one anybody can apply consistently.
      expect(rule.source.trim().length, rule.key).toBeGreaterThan(0);
      expect(rule.example.trim().length, rule.key).toBeGreaterThan(0);
      expect(rule.matchTerms.length, rule.key).toBeGreaterThan(0);
    }
  });

  it('decides the same way from the database as from the fixture', async () => {
    const rules = await createPrismaPolicyRuleSource(getPrisma()).currentRules();

    for (const text of [
      'برگزاری مسابقهٔ شرط‌بندی روی نتیجهٔ بازی‌ها',
      'صندوق محله با سود تضمینی ماهانه',
      'اهالی محله ابزارهایشان را به هم امانت می‌دهند',
      'این بستر مخصوص یک قوم است',
    ]) {
      const fromDb = evaluatePolicy(text, rules);
      const fromFixture = evaluatePolicy(text, BASELINE_FIXTURE);
      expect(fromDb.safetyLevel, text).toBe(fromFixture.safetyLevel);
      expect(fromDb.matched.map((m) => m.key), text).toEqual(fromFixture.matched.map((m) => m.key));
    }
  });

  it('produces the version reference that verdicts are recorded against', async () => {
    const rules = await createPrismaPolicyRuleSource(getPrisma()).currentRules();
    expect(policyVersionRef(rules)).toBe(policyVersionRef(BASELINE_FIXTURE));
  });
});
