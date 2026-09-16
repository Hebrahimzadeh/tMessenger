import type { PrismaClient } from '@taavon/database';
import type { PolicyRule, PolicyRuleSource } from './policy-rules';

/**
 * Reads the baseline from the database, newest version of each rule.
 *
 * Read-only by construction: there is no write path here and none anywhere
 * else in the application - "baseline policy را immutable و فقط از
 * migration/seed بازبینی‌شده بساز". A changed rule arrives as a new
 * `PolicyVersion` row from a reviewed migration, which is what makes a past
 * verdict still explainable after the wording moves on.
 *
 * Takes the client itself or a function returning it. The lazy form exists
 * for one specific reason: `app.db` is decorated by a plugin `server.ts`
 * registers *after* `buildApp()` returns, so anything that reads `app.db`
 * while wiring routes captures `undefined` and fails on the first query -
 * which the gate then reports as an outage rather than as the wiring mistake
 * it is.
 */
export function createPrismaPolicyRuleSource(db: PrismaClient | (() => PrismaClient)): PolicyRuleSource {
  const prisma = (): PrismaClient => (typeof db === 'function' ? db() : db);

  return {
    async currentRules(): Promise<PolicyRule[]> {
      const definitions = await prisma().policyDefinition.findMany({
        select: {
          key: true,
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { version: true, title: true, source: true, example: true, severity: true, matchTerms: true },
          },
        },
      });

      return definitions.flatMap((definition) => {
        const latest = definition.versions[0];
        // A definition with no version is not a rule anybody can apply, so it
        // is left out rather than treated as an empty one that matches all
        // text or none of it.
        if (!latest) return [];
        return [
          {
            key: definition.key,
            version: latest.version,
            title: latest.title,
            source: latest.source,
            example: latest.example,
            severity: latest.severity,
            matchTerms: latest.matchTerms,
          },
        ];
      });
    },
  };
}
