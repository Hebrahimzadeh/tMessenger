import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SpaceStatus } from '@taavon/database';
import {
  archiveSpace,
  buildSpaceFromPrompt,
  createSpace,
  createSpaceInvite,
  DuplicateRoleKeyError,
  editSpace,
  GateNotAllowedError,
  getSpace,
  InviteNotFoundError,
  joinSpaceRole,
  leaveSpaceRole,
  NotSpaceEditorError,
  precheckSpace,
  publishSpace,
  resolveSpaceInvite,
  revokeSpaceInvite,
  RoleNotFoundError,
  SpaceBlockedError,
  SpaceEditRefusedError,
  SpaceNotEditableError,
  SpaceNotFoundError,
  updateSpaceDefinition,
  type SpaceRepository,
  type SpaceRoleInputRecord,
  type SpaceRoleRecord,
  type SpaceVersionRecord,
} from './space.service';
import {
  brokenPolicySource,
  emptyPolicySource,
  fixtureGate,
  fixturePolicySource,
  noopOrchestratorRepository,
} from '../ai/capabilities/policy.fixtures';
import { AiOrchestrator } from '../ai/orchestrator';
import { FakeAiProvider } from '../ai/providers/fake-provider';
import { buildSpace } from '../ai/capabilities/space-builder';
import type { PolicyRuleSource } from '../ai/capabilities/policy-rules';

/**
 * The gate every test here uses: the real one, over the seeded baseline,
 * with no model behind it. A fake gate would prove only that the service
 * passes a verdict through; this proves the verdicts themselves.
 */
const gate = fixtureGate();

interface FakeSpace {
  id: string;
  slug: string;
  status: SpaceStatus;
  creatorId: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

function fakeSpaceRepo() {
  const spaces = new Map<string, FakeSpace>();
  const versionsBySpace = new Map<string, SpaceVersionRecord[]>();
  const rolesBySpace = new Map<string, SpaceRoleRecord[]>();
  const spaceAdmins = new Set<string>(); // `${userId}:${spaceId}`
  const roleMemberships = new Set<string>(); // `${userId}:${roleId}`
  const invites = new Map<string, { spaceId: string; revokedAt: Date | null }>();
  /** Everything `createBuiltSpace` was told, so a test can assert what a built space carries. */
  const builtAudit: Parameters<SpaceRepository['createBuiltSpace']>[0][] = [];
  /** Everything `setGateVerdict` was told, so a test can assert what the audit trail would carry. */
  const gateAudit: {
    spaceId: string;
    versionNumber: number;
    verdict: string;
    policyVersionRef: string;
    matchedPolicyRules: string[];
    actorId: string;
  }[] = [];
  // Real UUIDs, not "space-1"-style ids - getSpace() distinguishes an id
  // lookup from a slug lookup by shape, so the fixture needs to match what
  // the real Postgres-backed ids actually look like.
  const newId = (_prefix: string) => randomUUID();

  function record(id: string) {
    const space = spaces.get(id);
    if (!space) return null;
    const versions = versionsBySpace.get(id) ?? [];
    const latestVersion = versions[versions.length - 1]!;
    return { ...space, latestVersion, roles: rolesBySpace.get(id) ?? [] };
  }

  const repo: SpaceRepository = {
    async slugExists(slug) {
      return [...spaces.values()].some((s) => s.slug === slug);
    },

    async createDraft({ title, slug, policyVersion, creatorId }) {
      const id = newId('space');
      spaces.set(id, { id, slug, status: 'DRAFT', creatorId, publishedAt: null, archivedAt: null });
      versionsBySpace.set(id, [
        {
          versionNumber: 1,
          title,
          purpose: '',
          audience: null,
          participationMethods: [],
          cardHints: null,
          policyVersion,
          gateVerdict: null,
          gateReason: null,
          primaryRoleIds: [],
          supplementaryRoleIds: [],
        },
      ]);
      rolesBySpace.set(id, []);
      return { id };
    },

    async findById(id) {
      return record(id);
    },

    async findBySlug(slug) {
      const found = [...spaces.values()].find((s) => s.slug === slug);
      return found ? record(found.id) : null;
    },

    async hasSpaceAdminRole(userId, spaceId) {
      return spaceAdmins.has(`${userId}:${spaceId}`);
    },

    async createNewVersion({ spaceId, roles, createdBy, ...rest }) {
      const existingRoles = rolesBySpace.get(spaceId) ?? [];
      const byKey = new Map(existingRoles.map((r) => [r.key, r]));
      for (const input of roles) {
        const existing = byKey.get(input.key);
        const roleRecord: SpaceRoleRecord = {
          id: existing?.id ?? newId('role'),
          key: input.key,
          title: input.title,
          description: input.description ?? null,
          isPrimary: input.isPrimary,
        };
        byKey.set(input.key, roleRecord);
      }
      const updatedRoles = [...byKey.values()];
      rolesBySpace.set(spaceId, updatedRoles);

      const primaryRoleIds = roles.filter((r) => r.isPrimary).map((r) => byKey.get(r.key)!.id);
      const supplementaryRoleIds = roles.filter((r) => !r.isPrimary).map((r) => byKey.get(r.key)!.id);

      const versions = versionsBySpace.get(spaceId) ?? [];
      const versionNumber = versions.length + 1;
      versions.push({
        ...rest,
        audience: rest.audience ?? null,
        cardHints: rest.cardHints ?? null,
        versionNumber,
        gateVerdict: null,
        gateReason: null,
        primaryRoleIds,
        supplementaryRoleIds,
      });
      versionsBySpace.set(spaceId, versions);

      const space = spaces.get(spaceId)!;
      space.status = 'DRAFT';

      return { versionNumber };
    },

    async createBuiltSpace(input) {
      const id = newId('space');
      spaces.set(id, {
        id,
        slug: input.slug,
        status: input.status,
        creatorId: input.creatorId,
        publishedAt: input.status === 'PUBLISHED' ? new Date('2026-09-17T12:00:00Z') : null,
        archivedAt: null,
      });
      const roleRecords: SpaceRoleRecord[] = input.roles.map((role) => ({
        id: newId('role'),
        key: role.key,
        title: role.title,
        description: role.description ?? null,
        isPrimary: role.isPrimary,
      }));
      rolesBySpace.set(id, roleRecords);
      versionsBySpace.set(id, [
        {
          versionNumber: 1,
          title: input.title,
          purpose: input.purpose,
          audience: input.audience ?? null,
          participationMethods: input.participationMethods,
          cardHints: input.cardHints,
          policyVersion: input.policyVersion,
          gateVerdict: input.verdict,
          gateReason: input.reason,
          primaryRoleIds: roleRecords.filter((r) => r.isPrimary).map((r) => r.id),
          supplementaryRoleIds: roleRecords.filter((r) => !r.isPrimary).map((r) => r.id),
        },
      ]);
      builtAudit.push(input);
      return { id };
    },

    async publishNewVersion({ spaceId, roles, createdBy: _createdBy, gateReason, policyVersionRef: _ref, matchedPolicyRules: _rules, ...rest }) {
      const byKey = new Map((rolesBySpace.get(spaceId) ?? []).map((r) => [r.key, r]));
      for (const input of roles) {
        const existing = byKey.get(input.key);
        byKey.set(input.key, {
          id: existing?.id ?? newId('role'),
          key: input.key,
          title: input.title,
          description: input.description ?? null,
          isPrimary: input.isPrimary,
        });
      }
      rolesBySpace.set(spaceId, [...byKey.values()]);
      const versions = versionsBySpace.get(spaceId) ?? [];
      const versionNumber = versions.length + 1;
      versions.push({
        ...rest,
        audience: rest.audience ?? null,
        cardHints: rest.cardHints ?? null,
        versionNumber,
        gateVerdict: 'ALLOW',
        gateReason,
        primaryRoleIds: roles.filter((r) => r.isPrimary).map((r) => byKey.get(r.key)!.id),
        supplementaryRoleIds: roles.filter((r) => !r.isPrimary).map((r) => byKey.get(r.key)!.id),
      });
      versionsBySpace.set(spaceId, versions);
      // Status deliberately untouched, as in the real repository.
      return { versionNumber };
    },

    async setGateVerdict({ spaceId, versionNumber, verdict, reason, newStatus, policyVersionRef, matchedPolicyRules, actorId }) {
      const versions = versionsBySpace.get(spaceId)!;
      const version = versions.find((v) => v.versionNumber === versionNumber)!;
      version.gateVerdict = verdict;
      version.gateReason = reason;
      spaces.get(spaceId)!.status = newStatus;
      gateAudit.push({ spaceId, versionNumber, verdict, policyVersionRef, matchedPolicyRules, actorId });
    },

    async publish(spaceId) {
      const space = spaces.get(spaceId)!;
      space.status = 'PUBLISHED';
      space.publishedAt = new Date('2026-09-05T12:00:00Z');
      return { publishedAt: space.publishedAt };
    },

    async archive(spaceId) {
      const space = spaces.get(spaceId)!;
      space.status = 'ARCHIVED';
      space.archivedAt = new Date('2026-09-05T13:00:00Z');
      return { archivedAt: space.archivedAt };
    },

    async findRoleInSpace(spaceId, roleId) {
      const role = (rolesBySpace.get(spaceId) ?? []).find((r) => r.id === roleId);
      return role ? { id: role.id } : null;
    },

    async joinRole(_spaceId, userId, roleId) {
      roleMemberships.add(`${userId}:${roleId}`);
    },

    async leaveRole(userId, roleId) {
      roleMemberships.delete(`${userId}:${roleId}`);
    },

    async createInvite(spaceId, _createdBy, token) {
      invites.set(token, { spaceId, revokedAt: null });
    },

    async revokeInvite(spaceId, token) {
      const invite = invites.get(token);
      if (!invite || invite.spaceId !== spaceId || invite.revokedAt) return false;
      invite.revokedAt = new Date();
      return true;
    },

    async resolveInvite(token) {
      const invite = invites.get(token);
      if (!invite || invite.revokedAt) return null;
      const space = spaces.get(invite.spaceId)!;
      return { spaceId: space.id, slug: space.slug };
    },
  };

  return { repo, spaceAdmins, gateAudit, builtAudit, spaceCount: () => spaces.size, isRoleMember: (userId: string, roleId: string) => roleMemberships.has(`${userId}:${roleId}`) };
}

const TWO_PRIMARY_ROLES: SpaceRoleInputRecord[] = [
  { key: 'organizer', title: 'سازمان‌دهنده', isPrimary: true },
  { key: 'contributor', title: 'همکار', isPrimary: true },
];
const VALID_PURPOSE = 'این بستر برای هماهنگی داوطلبانه‌ی نگهداری باغچه‌ی محله تشکیل شده است.';

async function createAndFillValidDraft(repo: SpaceRepository, creatorId: string) {
  const { id } = await createSpace(repo, gate, creatorId, 'باغ محله');
  await updateSpaceDefinition(repo, id, creatorId, {
    title: 'باغ محله',
    purpose: VALID_PURPOSE,
    participationMethods: ['حضوری'],
    roles: TWO_PRIMARY_ROLES,
    policyVersion: 1,
  });
  return id;
}

describe('createSpace', () => {
  it('any authenticated user may create a draft, getting back a generated slug', async () => {
    const { repo } = fakeSpaceRepo();
    const result = await createSpace(repo, gate, 'user-1', 'باغ محله');
    expect(result.slug).toBe('باغ-محله');

    const space = await getSpace(repo, result.id, 'user-1');
    expect(space.status).toBe('DRAFT');
    expect(space.creatorId).toBe('user-1');
  });

  it('resolves a slug collision deterministically', async () => {
    const { repo } = fakeSpaceRepo();
    await createSpace(repo, gate, 'user-1', 'باغ محله');
    const second = await createSpace(repo, gate, 'user-2', 'باغ محله');
    expect(second.slug).toBe('باغ-محله-2');
  });
});

describe('updateSpaceDefinition', () => {
  it('the creator can edit, producing a new immutable version and resetting status to DRAFT', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');

    const result = await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: VALID_PURPOSE,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });

    expect(result.versionNumber).toBe(2);
    const space = await getSpace(repo, id, 'user-1');
    expect(space.definition.versionNumber).toBe(2);
    expect(space.definition.purpose).toBe(VALID_PURPOSE);
    expect(space.definition.roles).toHaveLength(2);
  });

  it('a space admin (scoped RoleAssignment) may also edit', async () => {
    const { repo, spaceAdmins } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    spaceAdmins.add(`user-2:${id}`);

    await expect(
      updateSpaceDefinition(repo, id, 'user-2', {
        title: 'باغ محله ۲',
        purpose: VALID_PURPOSE,
        participationMethods: ['حضوری'],
        roles: TWO_PRIMARY_ROLES,
        policyVersion: 1,
      })
    ).resolves.toMatchObject({ versionNumber: 2 });
  });

  it('rejects an unrelated user with NotSpaceEditorError', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');

    await expect(
      updateSpaceDefinition(repo, id, 'stranger', {
        title: 'x',
        purpose: VALID_PURPOSE,
        participationMethods: [],
        roles: [],
        policyVersion: 1,
      })
    ).rejects.toThrow(NotSpaceEditorError);
  });

  it('rejects duplicate role keys before touching the repository', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');

    await expect(
      updateSpaceDefinition(repo, id, 'user-1', {
        title: 'x',
        purpose: VALID_PURPOSE,
        participationMethods: ['حضوری'],
        roles: [
          { key: 'organizer', title: 'A', isPrimary: true },
          { key: 'organizer', title: 'B', isPrimary: false },
        ],
        policyVersion: 1,
      })
    ).rejects.toThrow(DuplicateRoleKeyError);
  });

  it('rejects editing a space that does not exist', async () => {
    const { repo } = fakeSpaceRepo();
    await expect(
      updateSpaceDefinition(repo, 'missing', 'user-1', {
        title: 'x',
        purpose: VALID_PURPOSE,
        participationMethods: [],
        roles: [],
        policyVersion: 1,
      })
    ).rejects.toThrow(SpaceNotFoundError);
  });

  it('keeps the draft-only edit function away from a PUBLISHED space - editSpace is the published path', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, gate, id, 'user-1');
    await publishSpace(repo, id, 'user-1');

    await expect(
      updateSpaceDefinition(repo, id, 'user-1', {
        title: 'x',
        purpose: VALID_PURPOSE,
        participationMethods: ['حضوری'],
        roles: TWO_PRIMARY_ROLES,
        policyVersion: 1,
      })
    ).rejects.toThrow(SpaceNotEditableError);
  });
});

describe('precheckSpace', () => {
  it('ALLOW verdict moves status to DRAFT (ready to publish)', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');

    const result = await precheckSpace(repo, gate, id, 'user-1');
    expect(result).toEqual({
      verdict: 'ALLOW',
      reason: expect.any(String),
      status: 'DRAFT',
      policyVersionRef: 'baseline:v1:8rules',
      matchedPolicyRules: [],
      guidance: expect.objectContaining({ creationDecision: 'ALLOW' }),
    });
  });

  it('REVISE verdict moves status to PRECHECK_REQUIRED', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله'); // purpose still empty

    const result = await precheckSpace(repo, gate, id, 'user-1');
    expect(result.verdict).toBe('REVISE');
    expect(result.status).toBe('PRECHECK_REQUIRED');
  });

  it('HUMAN_REVIEW verdict moves status to HUMAN_REVIEW', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} با تضمین سود ثابت.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });

    const result = await precheckSpace(repo, gate, id, 'user-1');
    expect(result.verdict).toBe('HUMAN_REVIEW');
    expect(result.status).toBe('HUMAN_REVIEW');
  });

  it('BLOCK verdict moves status to PRECHECK_REQUIRED (never publishable, never silently public)', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} این بستر برای قمار است.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });

    const result = await precheckSpace(repo, gate, id, 'user-1');
    expect(result.verdict).toBe('BLOCK');
    expect(result.status).toBe('PRECHECK_REQUIRED');
  });

  it('a fresh edit after an ALLOW resets the verdict, requiring a new precheck', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, gate, id, 'user-1');

    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله (ویرایش)',
      purpose: VALID_PURPOSE,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });

    await expect(publishSpace(repo, id, 'user-1')).rejects.toThrow(GateNotAllowedError);
  });

  it('rejects a non-editor', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await expect(precheckSpace(repo, gate, id, 'stranger')).rejects.toThrow(NotSpaceEditorError);
  });

  it('records the baseline and the matched rules alongside the verdict, for the audit trail', async () => {
    const { repo, gateAudit } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} این بستر برای قمار است.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });

    const result = await precheckSpace(repo, gate, id, 'user-1');

    expect(result.matchedPolicyRules[0]).toContain('gambling@v1');
    expect(gateAudit).toHaveLength(1);
    expect(gateAudit[0]).toMatchObject({
      verdict: 'BLOCK',
      actorId: 'user-1',
      policyVersionRef: 'baseline:v1:8rules',
      matchedPolicyRules: result.matchedPolicyRules,
    });
  });

  it('an outage in the gate becomes HUMAN_REVIEW, never an ALLOW', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');

    // The very definition that was about to be approved.
    expect((await precheckSpace(repo, gate, id, 'user-1')).verdict).toBe('ALLOW');

    const result = await precheckSpace(repo, fixtureGate(brokenPolicySource), id, 'user-1');
    expect(result.verdict).toBe('HUMAN_REVIEW');
    expect(result.status).toBe('HUMAN_REVIEW');
    expect(result.guidance).toBeNull();
  });

  it('an empty baseline does not become a clean bill of health', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');

    const result = await precheckSpace(repo, fixtureGate(emptyPolicySource), id, 'user-1');
    expect(result.verdict).toBe('HUMAN_REVIEW');
  });

  it('a HUMAN_REVIEW space cannot be published', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, fixtureGate(brokenPolicySource), id, 'user-1');

    await expect(publishSpace(repo, id, 'user-1')).rejects.toThrow(GateNotAllowedError);
  });
});

describe('a blocked title never claims a slug', () => {
  it('creates no space at all', async () => {
    const { repo, spaceCount } = fakeSpaceRepo();

    await expect(createSpace(repo, gate, 'user-1', 'باشگاه قمار محله')).rejects.toThrow(SpaceBlockedError);
    // "BLOCK هیچ Space/slug عمومی نسازد" - not a hidden draft, not a
    // reserved name: no row was written, so no slug was taken either.
    expect(spaceCount()).toBe(0);
  });

  it('lets an ordinary title through', async () => {
    const { repo } = fakeSpaceRepo();
    const { slug } = await createSpace(repo, gate, 'user-1', 'امانات ابزار محله');
    expect(slug.length).toBeGreaterThan(0);
  });

  it('does not refuse a title when the baseline is unreadable', async () => {
    const { repo } = fakeSpaceRepo();
    // A draft is invisible to everyone but its creator, so an outage here
    // costs nothing; the precheck before publishing is what fails closed.
    await expect(createSpace(repo, fixtureGate(brokenPolicySource), 'user-1', 'باشگاه قمار محله')).resolves.toBeTruthy();
  });
});

describe('publishSpace', () => {
  it('publishes only after an ALLOW precheck on the current version', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, gate, id, 'user-1');

    const result = await publishSpace(repo, id, 'user-1');
    expect(result.status).toBe('PUBLISHED');

    const space = await getSpace(repo, id, null);
    expect(space.status).toBe('PUBLISHED');
    expect(space.gate).toBeUndefined();
  });

  it('rejects publishing without ever running precheck ("publish بدون ALLOW ممنوع")', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await expect(publishSpace(repo, id, 'user-1')).rejects.toThrow(GateNotAllowedError);
  });

  it('rejects publishing while in HUMAN_REVIEW ("HUMAN_REVIEW قابل انتشار نباشد")', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} با تضمین سود ثابت.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });
    await precheckSpace(repo, gate, id, 'user-1');

    await expect(publishSpace(repo, id, 'user-1')).rejects.toThrow(GateNotAllowedError);
  });

  it('rejects re-publishing an already-PUBLISHED space', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, gate, id, 'user-1');
    await publishSpace(repo, id, 'user-1');

    await expect(publishSpace(repo, id, 'user-1')).rejects.toThrow(SpaceNotEditableError);
  });

  it('rejects a non-editor', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, gate, id, 'user-1');
    await expect(publishSpace(repo, id, 'stranger')).rejects.toThrow(NotSpaceEditorError);
  });
});

describe('archiveSpace', () => {
  it('the creator can archive a published space', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, gate, id, 'user-1');
    await publishSpace(repo, id, 'user-1');

    const result = await archiveSpace(repo, id, 'user-1');
    expect(result.status).toBe('ARCHIVED');
  });

  it('rejects a non-creator/non-admin', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await expect(archiveSpace(repo, id, 'stranger')).rejects.toThrow(NotSpaceEditorError);
  });

  it('rejects archiving an already-archived space (no un-archive in MVP)', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await archiveSpace(repo, id, 'user-1');
    await expect(archiveSpace(repo, id, 'user-1')).rejects.toThrow(SpaceNotEditableError);
  });
});

describe('getSpace', () => {
  it('a PUBLISHED space is visible to an anonymous caller, with no gate field', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, gate, id, 'user-1');
    await publishSpace(repo, id, 'user-1');

    const view = await getSpace(repo, id, null);
    expect(view.status).toBe('PUBLISHED');
    expect(view.gate).toBeUndefined();
  });

  it("canManage stays true for the creator even after publishing - a real bug found in Task 13: gate's mere presence was originally the only ownership signal, and gate is always omitted once PUBLISHED regardless of who's asking, which silently broke owner-only UI (like Task 13's own health panel) for every published space", async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, gate, id, 'user-1');
    await publishSpace(repo, id, 'user-1');

    const ownerView = await getSpace(repo, id, 'user-1');
    expect(ownerView.canManage).toBe(true);
    expect(ownerView.gate).toBeUndefined(); // still correctly omitted - it's pre-publish moderation state, not the ownership signal

    const anonView = await getSpace(repo, id, null);
    expect(anonView.canManage).toBe(false);

    const strangerView = await getSpace(repo, id, 'stranger');
    expect(strangerView.canManage).toBe(false);
  });

  it('a DRAFT space 404s for an anonymous caller', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await expect(getSpace(repo, id, null)).rejects.toThrow(SpaceNotFoundError);
  });

  it('a DRAFT space 404s for an authenticated but unrelated caller (no existence leak)', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await expect(getSpace(repo, id, 'stranger')).rejects.toThrow(SpaceNotFoundError);
  });

  it('the creator sees a DRAFT space with its gate field included', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, gate, id, 'user-1');

    const view = await getSpace(repo, id, 'user-1');
    expect(view.gate).toEqual({ verdict: 'ALLOW', reason: expect.any(String) });
  });

  it('a BLOCK-verdict space (status PRECHECK_REQUIRED) 404s for an anonymous caller - "BLOCK هیچ slug/Space عمومی نسازد"', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} این بستر برای قمار است.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });
    const precheck = await precheckSpace(repo, gate, id, 'user-1');
    expect(precheck.verdict).toBe('BLOCK');

    await expect(getSpace(repo, id, null)).rejects.toThrow(SpaceNotFoundError);
  });

  it('a HUMAN_REVIEW space 404s for an anonymous caller - "HUMAN_REVIEW ... نشت عمومی صفر"', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} با تضمین سود ثابت.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });
    const precheck = await precheckSpace(repo, gate, id, 'user-1');
    expect(precheck.verdict).toBe('HUMAN_REVIEW');

    await expect(getSpace(repo, id, null)).rejects.toThrow(SpaceNotFoundError);
    await expect(getSpace(repo, id, 'stranger')).rejects.toThrow(SpaceNotFoundError);
  });

  it('resolves by slug as well as by id', async () => {
    const { repo } = fakeSpaceRepo();
    const { id, slug } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    const bySlug = await getSpace(repo, slug, 'user-1');
    expect(bySlug.id).toBe(id);
  });
});

describe('space roles: join/leave', () => {
  it('joining and leaving is idempotent and only works for a role that belongs to the space', async () => {
    const { repo, isRoleMember } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    const space = await getSpace(repo, id, 'user-1');
    const roleId = space.definition.roles[0]!.id;

    await joinSpaceRole(repo, id, roleId, 'user-2');
    await joinSpaceRole(repo, id, roleId, 'user-2'); // idempotent, no throw
    expect(isRoleMember('user-2', roleId)).toBe(true);

    await leaveSpaceRole(repo, id, roleId, 'user-2');
    await leaveSpaceRole(repo, id, roleId, 'user-2'); // idempotent, no throw
    expect(isRoleMember('user-2', roleId)).toBe(false);
  });

  it('rejects a role id that does not belong to this space', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await expect(joinSpaceRole(repo, id, 'not-a-real-role', 'user-2')).rejects.toThrow(RoleNotFoundError);
  });
});

describe('space invites', () => {
  it('the creator can create, resolve, and revoke an invite; a revoked token no longer resolves', async () => {
    const { repo } = fakeSpaceRepo();
    const { id, slug } = await createSpace(repo, gate, 'user-1', 'باغ محله');

    const { token } = await createSpaceInvite(repo, id, 'user-1');
    const resolved = await resolveSpaceInvite(repo, token);
    expect(resolved).toEqual({ spaceId: id, slug });

    await revokeSpaceInvite(repo, id, token, 'user-1');
    await expect(resolveSpaceInvite(repo, token)).rejects.toThrow(InviteNotFoundError);
  });

  it('rejects an unrelated user creating an invite', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, gate, 'user-1', 'باغ محله');
    await expect(createSpaceInvite(repo, id, 'stranger')).rejects.toThrow(NotSpaceEditorError);
  });

  it('resolving an unknown token throws InviteNotFoundError', async () => {
    const { repo } = fakeSpaceRepo();
    await expect(resolveSpaceInvite(repo, 'not-a-real-token')).rejects.toThrow(InviteNotFoundError);
  });
});


// --- One prompt, a whole space (owner decision 2026-09-17) ---------------

function builderWith(provider: FakeAiProvider | null = null, policy: PolicyRuleSource = fixturePolicySource) {
  const orchestrator = new AiOrchestrator({ provider, repository: noopOrchestratorRepository(), dailyBudgetMicros: null });
  return { build: (prompt: string, requesterId: string | null) => buildSpace({ orchestrator, policy }, prompt, requesterId) };
}

const CREATOR = '44444444-4444-4444-8444-444444444444';

describe('buildSpaceFromPrompt', () => {
  it('turns one prompt into a published space the person manages', async () => {
    const { repo } = fakeSpaceRepo();

    const result = await buildSpaceFromPrompt(repo, builderWith(), CREATOR, 'یه کار خوب برای محله');

    expect(result.outcome).toBe('PUBLISHED');
    const space = await getSpace(repo, result.space!.id, CREATOR);
    expect(space.status).toBe('PUBLISHED');
    // "مدیریت اون بستر هم میشه خودش".
    expect(space.creatorId).toBe(CREATOR);
    expect(space.canManage).toBe(true);
    // And anyone can see it, with no second step.
    await expect(getSpace(repo, result.space!.id, null)).resolves.toMatchObject({ status: 'PUBLISHED' });
  });

  it('stores text about the space, not the prompt', async () => {
    const { repo } = fakeSpaceRepo();
    const prompt = 'من یه نردبون دارم می‌خوام قرض بدم';

    const result = await buildSpaceFromPrompt(repo, builderWith(), CREATOR, prompt);
    const space = await getSpace(repo, result.space!.id, null);

    expect(space.definition.purpose).not.toContain(prompt);
    expect(space.definition.purpose).toMatch(/بستری است برای/);
  });

  it('stores exactly two primary roles with server-assigned keys', async () => {
    const { repo } = fakeSpaceRepo();
    const result = await buildSpaceFromPrompt(repo, builderWith(), CREATOR, 'آموزش خیاطی به خانم‌های محله');
    const space = await getSpace(repo, result.space!.id, null);

    expect(space.definition.roles.filter((r) => r.isPrimary)).toHaveLength(2);
    for (const role of space.definition.roles) expect(role.key).toMatch(/^(primary|supporting)-\d$/);
  });

  it('marks every sample card as an example', async () => {
    const { repo } = fakeSpaceRepo();
    const result = await buildSpaceFromPrompt(repo, builderWith(), CREATOR, 'امانت ابزار محله');
    const space = await getSpace(repo, result.space!.id, null);

    expect(space.definition.cardHints?.length).toBeGreaterThan(0);
    for (const hint of space.definition.cardHints ?? []) {
      expect(hint).toMatchObject({ isExample: true, label: 'نمونه' });
    }
  });

  it('records the document, the baseline and whether a model wrote it', async () => {
    const { repo, builtAudit } = fakeSpaceRepo();
    await buildSpaceFromPrompt(repo, builderWith(), CREATOR, 'امانت ابزار محله');

    expect(builtAudit[0]).toMatchObject({
      verdict: 'ALLOW',
      policyVersionRef: 'baseline:v1:8rules',
      creativityApplied: false,
    });
    expect(builtAudit[0]!.documentRef).toMatch(/^space-builder:v1:/);
  });

  it('creates nothing at all for an explicitly forbidden prompt', async () => {
    const { repo, spaceCount } = fakeSpaceRepo();

    const result = await buildSpaceFromPrompt(repo, builderWith(), CREATOR, 'بستری برای شرط‌بندی روی مسابقه‌های محله');

    expect(result.outcome).toBe('BLOCKED');
    expect(result.space).toBeNull();
    expect(result.matchedPolicyRules[0]).toContain('gambling@v1');
    // No row, so no slug either.
    expect(spaceCount()).toBe(0);
  });

  it('creates a space held for a person, visible to its manager and nobody else', async () => {
    const { repo } = fakeSpaceRepo();

    const result = await buildSpaceFromPrompt(repo, builderWith(), CREATOR, 'صندوق محله با سود تضمینی ماهانه');

    expect(result.outcome).toBe('HUMAN_REVIEW');
    await expect(getSpace(repo, result.space!.id, CREATOR)).resolves.toMatchObject({ status: 'HUMAN_REVIEW' });
    await expect(getSpace(repo, result.space!.id, null)).rejects.toThrow(SpaceNotFoundError);
  });

  it('never publishes when the policy baseline is down', async () => {
    const { repo } = fakeSpaceRepo();
    const result = await buildSpaceFromPrompt(repo, builderWith(null, brokenPolicySource), CREATOR, 'امانت ابزار محله');

    expect(result.outcome).toBe('HUMAN_REVIEW');
    await expect(getSpace(repo, result.space!.id, null)).rejects.toThrow(SpaceNotFoundError);
  });

  it('uses what the model designed when it answers', async () => {
    const { repo } = fakeSpaceRepo();
    const designed = {
      kind: 'SPACE_BUILD',
      title: 'امانت وسایل محله',
      description: 'این بستر جایی است برای امانت‌دادن و امانت‌گرفتن وسایلی که در خانه کم استفاده می‌شوند، میان همسایه‌ها.',
      audience: 'همسایه‌ها',
      participationMethods: ['ثبت کارت وسیلهٔ قابل امانت'],
      roles: [
        { title: 'دارندهٔ وسیله', description: 'امانت می‌دهد.', isPrimary: true },
        { title: 'نیازمند وسیله', description: 'امانت می‌گیرد.', isPrimary: true },
      ],
      cardHints: [],
      reviewNote: '',
    };
    const provider = new FakeAiProvider([{ kind: 'ok', text: JSON.stringify(designed) }]);

    const result = await buildSpaceFromPrompt(repo, builderWith(provider), CREATOR, 'من یه نردبون دارم می‌خوام قرض بدم');
    const space = await getSpace(repo, result.space!.id, null);

    expect(result.creativityApplied).toBe(true);
    expect(space.definition.title).toBe('امانت وسایل محله');
    expect(space.definition.purpose).toBe(designed.description);
  });

  it('gives two spaces built from the same prompt different slugs', async () => {
    const { repo } = fakeSpaceRepo();
    const a = await buildSpaceFromPrompt(repo, builderWith(), CREATOR, 'امانت ابزار محله');
    const b = await buildSpaceFromPrompt(repo, builderWith(), CREATOR, 'امانت ابزار محله');
    expect(a.space!.slug).not.toBe(b.space!.slug);
  });
});

describe('editSpace after publication', () => {
  async function publishedSpace() {
    const store = fakeSpaceRepo();
    const result = await buildSpaceFromPrompt(store.repo, builderWith(), CREATOR, 'امانت ابزار محله');
    const space = await getSpace(store.repo, result.space!.id, CREATOR);
    const edit = {
      title: space.definition.title,
      purpose: space.definition.purpose,
      audience: space.definition.audience ?? undefined,
      participationMethods: space.definition.participationMethods,
      cardHints: space.definition.cardHints ?? undefined,
      roles: space.definition.roles.map((r) => ({
        key: r.key,
        title: r.title,
        ...(r.description ? { description: r.description } : {}),
        isPrimary: r.isPrimary,
      })),
      policyVersion: 1,
    };
    return { ...store, id: space.id, edit };
  }

  it('applies an ordinary edit and the space stays published', async () => {
    const { repo, id, edit } = await publishedSpace();

    await editSpace(repo, gate, id, CREATOR, { ...edit, title: 'امانت ابزار کوچه‌ی ما' });

    const after = await getSpace(repo, id, null);
    expect(after.status).toBe('PUBLISHED');
    expect(after.definition.title).toBe('امانت ابزار کوچه‌ی ما');
  });

  it('lets only the manager edit', async () => {
    const { repo, id, edit } = await publishedSpace();
    await expect(editSpace(repo, gate, id, 'stranger', { ...edit, title: 'عنوان دیگر' })).rejects.toThrow(NotSpaceEditorError);
  });

  it('refuses an edit that matches an explicit rule, leaving the published version untouched', async () => {
    const { repo, id, edit } = await publishedSpace();
    const before = await getSpace(repo, id, null);

    const attempt = editSpace(repo, gate, id, CREATOR, { ...edit, purpose: `${edit.purpose} برگزاری شرط‌بندی هم داریم.` });

    await expect(attempt).rejects.toThrow(SpaceEditRefusedError);
    await attempt.catch((err: SpaceEditRefusedError) => {
      expect(err.verdict).toBe('BLOCK');
      expect(err.matchedPolicyRules[0]).toContain('gambling@v1');
    });
    const after = await getSpace(repo, id, null);
    expect(after.definition.purpose).toBe(before.definition.purpose);
    expect(after.status).toBe('PUBLISHED');
  });

  it('refuses an edit that needs a person, without unpublishing anything', async () => {
    const { repo, id, edit } = await publishedSpace();
    const attempt = editSpace(repo, gate, id, CREATOR, { ...edit, purpose: `${edit.purpose} با سود تضمینی.` });

    await expect(attempt).rejects.toMatchObject({ verdict: 'HUMAN_REVIEW' });
    expect((await getSpace(repo, id, null)).status).toBe('PUBLISHED');
  });

  it.each([
    ['a purpose too short to read', { purpose: 'کوتاه' }, 'معرفی بستر'],
    ['no participation method', { participationMethods: [] }, 'روش مشارکت'],
  ])('names the field when %s', async (_label, change, expected) => {
    const { repo, id, edit } = await publishedSpace();
    await expect(editSpace(repo, gate, id, CREATOR, { ...edit, ...change })).rejects.toThrow(expected);
  });

  it('names the field when the roles no longer have two primaries', async () => {
    const { repo, id, edit } = await publishedSpace();
    const roles = edit.roles.map((r) => ({ ...r, isPrimary: false }));
    await expect(editSpace(repo, gate, id, CREATOR, { ...edit, roles })).rejects.toThrow('دو نقش اصلی');
  });

  it('does not refuse a title fix over wording nobody touched', async () => {
    // A published description may legitimately mention disagreement - the
    // model describes respectful rules - and that must not make the space
    // uneditable.
    const { repo, id, edit } = await publishedSpace();
    await editSpace(repo, gate, id, CREATOR, {
      ...edit,
      purpose: `${edit.purpose} هر اختلاف نظر با احترام زیر کارت مطرح می‌شود.`,
    }).catch(() => undefined);

    // Whatever that first edit did, a later change to the title alone is judged on the title.
    const current = await getSpace(repo, id, CREATOR);
    await expect(
      editSpace(repo, gate, id, CREATOR, { ...edit, purpose: current.definition.purpose, title: 'امانت ابزار محلهٔ ما' })
    ).resolves.toBeTruthy();
  });

  it('refuses rather than publishes when the baseline is down', async () => {
    const { repo, id, edit } = await publishedSpace();
    await expect(
      editSpace(repo, fixtureGate(brokenPolicySource), id, CREATOR, { ...edit, title: 'عنوان تازه' })
    ).rejects.toMatchObject({ verdict: 'HUMAN_REVIEW' });
    expect((await getSpace(repo, id, null)).definition.title).toBe(edit.title);
  });

  it('still uses the draft path for a space that is not published', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await expect(
      editSpace(repo, gate, id, 'user-1', {
        title: 'باغ محله',
        purpose: VALID_PURPOSE,
        participationMethods: ['حضوری'],
        roles: TWO_PRIMARY_ROLES,
        policyVersion: 1,
      })
    ).resolves.toMatchObject({ versionNumber: 3 });
  });
});
