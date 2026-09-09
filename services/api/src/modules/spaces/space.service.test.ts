import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SpaceStatus } from '@taavon/database';
import {
  archiveSpace,
  createSpace,
  createSpaceInvite,
  DuplicateRoleKeyError,
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
  SpaceNotEditableError,
  SpaceNotFoundError,
  updateSpaceDefinition,
  type SpaceRepository,
  type SpaceRoleInputRecord,
  type SpaceRoleRecord,
  type SpaceVersionRecord,
} from './space.service';

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

    async setGateVerdict(spaceId, versionNumber, verdict, reason, newStatus) {
      const versions = versionsBySpace.get(spaceId)!;
      const version = versions.find((v) => v.versionNumber === versionNumber)!;
      version.gateVerdict = verdict;
      version.gateReason = reason;
      spaces.get(spaceId)!.status = newStatus;
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

  return { repo, spaceAdmins, isRoleMember: (userId: string, roleId: string) => roleMemberships.has(`${userId}:${roleId}`) };
}

const TWO_PRIMARY_ROLES: SpaceRoleInputRecord[] = [
  { key: 'organizer', title: 'سازمان‌دهنده', isPrimary: true },
  { key: 'contributor', title: 'همکار', isPrimary: true },
];
const VALID_PURPOSE = 'این بستر برای هماهنگی داوطلبانه‌ی نگهداری باغچه‌ی محله تشکیل شده است.';

async function createAndFillValidDraft(repo: SpaceRepository, creatorId: string) {
  const { id } = await createSpace(repo, creatorId, 'باغ محله');
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
    const result = await createSpace(repo, 'user-1', 'باغ محله');
    expect(result.slug).toBe('باغ-محله');

    const space = await getSpace(repo, result.id, 'user-1');
    expect(space.status).toBe('DRAFT');
    expect(space.creatorId).toBe('user-1');
  });

  it('resolves a slug collision deterministically', async () => {
    const { repo } = fakeSpaceRepo();
    await createSpace(repo, 'user-1', 'باغ محله');
    const second = await createSpace(repo, 'user-2', 'باغ محله');
    expect(second.slug).toBe('باغ-محله-2');
  });
});

describe('updateSpaceDefinition', () => {
  it('the creator can edit, producing a new immutable version and resetting status to DRAFT', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');

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
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
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
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');

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
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');

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

  it('rejects editing an already-PUBLISHED space', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, id, 'user-1');
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

    const result = await precheckSpace(repo, id, 'user-1');
    expect(result).toEqual({ verdict: 'ALLOW', reason: expect.any(String), status: 'DRAFT' });
  });

  it('REVISE verdict moves status to PRECHECK_REQUIRED', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله'); // purpose still empty

    const result = await precheckSpace(repo, id, 'user-1');
    expect(result.verdict).toBe('REVISE');
    expect(result.status).toBe('PRECHECK_REQUIRED');
  });

  it('HUMAN_REVIEW verdict moves status to HUMAN_REVIEW', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} با تضمین سود ثابت.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });

    const result = await precheckSpace(repo, id, 'user-1');
    expect(result.verdict).toBe('HUMAN_REVIEW');
    expect(result.status).toBe('HUMAN_REVIEW');
  });

  it('BLOCK verdict moves status to PRECHECK_REQUIRED (never publishable, never silently public)', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} این بستر برای قمار است.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });

    const result = await precheckSpace(repo, id, 'user-1');
    expect(result.verdict).toBe('BLOCK');
    expect(result.status).toBe('PRECHECK_REQUIRED');
  });

  it('a fresh edit after an ALLOW resets the verdict, requiring a new precheck', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, id, 'user-1');

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
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await expect(precheckSpace(repo, id, 'stranger')).rejects.toThrow(NotSpaceEditorError);
  });
});

describe('publishSpace', () => {
  it('publishes only after an ALLOW precheck on the current version', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, id, 'user-1');

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
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} با تضمین سود ثابت.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });
    await precheckSpace(repo, id, 'user-1');

    await expect(publishSpace(repo, id, 'user-1')).rejects.toThrow(GateNotAllowedError);
  });

  it('rejects re-publishing an already-PUBLISHED space', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, id, 'user-1');
    await publishSpace(repo, id, 'user-1');

    await expect(publishSpace(repo, id, 'user-1')).rejects.toThrow(SpaceNotEditableError);
  });

  it('rejects a non-editor', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, id, 'user-1');
    await expect(publishSpace(repo, id, 'stranger')).rejects.toThrow(NotSpaceEditorError);
  });
});

describe('archiveSpace', () => {
  it('the creator can archive a published space', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, id, 'user-1');
    await publishSpace(repo, id, 'user-1');

    const result = await archiveSpace(repo, id, 'user-1');
    expect(result.status).toBe('ARCHIVED');
  });

  it('rejects a non-creator/non-admin', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await expect(archiveSpace(repo, id, 'stranger')).rejects.toThrow(NotSpaceEditorError);
  });

  it('rejects archiving an already-archived space (no un-archive in MVP)', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await archiveSpace(repo, id, 'user-1');
    await expect(archiveSpace(repo, id, 'user-1')).rejects.toThrow(SpaceNotEditableError);
  });
});

describe('getSpace', () => {
  it('a PUBLISHED space is visible to an anonymous caller, with no gate field', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, id, 'user-1');
    await publishSpace(repo, id, 'user-1');

    const view = await getSpace(repo, id, null);
    expect(view.status).toBe('PUBLISHED');
    expect(view.gate).toBeUndefined();
  });

  it("canManage stays true for the creator even after publishing - a real bug found in Task 13: gate's mere presence was originally the only ownership signal, and gate is always omitted once PUBLISHED regardless of who's asking, which silently broke owner-only UI (like Task 13's own health panel) for every published space", async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, id, 'user-1');
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
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await expect(getSpace(repo, id, null)).rejects.toThrow(SpaceNotFoundError);
  });

  it('a DRAFT space 404s for an authenticated but unrelated caller (no existence leak)', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await expect(getSpace(repo, id, 'stranger')).rejects.toThrow(SpaceNotFoundError);
  });

  it('the creator sees a DRAFT space with its gate field included', async () => {
    const { repo } = fakeSpaceRepo();
    const id = await createAndFillValidDraft(repo, 'user-1');
    await precheckSpace(repo, id, 'user-1');

    const view = await getSpace(repo, id, 'user-1');
    expect(view.gate).toEqual({ verdict: 'ALLOW', reason: expect.any(String) });
  });

  it('a BLOCK-verdict space (status PRECHECK_REQUIRED) 404s for an anonymous caller - "BLOCK هیچ slug/Space عمومی نسازد"', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} این بستر برای قمار است.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });
    const precheck = await precheckSpace(repo, id, 'user-1');
    expect(precheck.verdict).toBe('BLOCK');

    await expect(getSpace(repo, id, null)).rejects.toThrow(SpaceNotFoundError);
  });

  it('a HUMAN_REVIEW space 404s for an anonymous caller - "HUMAN_REVIEW ... نشت عمومی صفر"', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await updateSpaceDefinition(repo, id, 'user-1', {
      title: 'باغ محله',
      purpose: `${VALID_PURPOSE} با تضمین سود ثابت.`,
      participationMethods: ['حضوری'],
      roles: TWO_PRIMARY_ROLES,
      policyVersion: 1,
    });
    const precheck = await precheckSpace(repo, id, 'user-1');
    expect(precheck.verdict).toBe('HUMAN_REVIEW');

    await expect(getSpace(repo, id, null)).rejects.toThrow(SpaceNotFoundError);
    await expect(getSpace(repo, id, 'stranger')).rejects.toThrow(SpaceNotFoundError);
  });

  it('resolves by slug as well as by id', async () => {
    const { repo } = fakeSpaceRepo();
    const { id, slug } = await createSpace(repo, 'user-1', 'باغ محله');
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
    const { id, slug } = await createSpace(repo, 'user-1', 'باغ محله');

    const { token } = await createSpaceInvite(repo, id, 'user-1');
    const resolved = await resolveSpaceInvite(repo, token);
    expect(resolved).toEqual({ spaceId: id, slug });

    await revokeSpaceInvite(repo, id, token, 'user-1');
    await expect(resolveSpaceInvite(repo, token)).rejects.toThrow(InviteNotFoundError);
  });

  it('rejects an unrelated user creating an invite', async () => {
    const { repo } = fakeSpaceRepo();
    const { id } = await createSpace(repo, 'user-1', 'باغ محله');
    await expect(createSpaceInvite(repo, id, 'stranger')).rejects.toThrow(NotSpaceEditorError);
  });

  it('resolving an unknown token throws InviteNotFoundError', async () => {
    const { repo } = fakeSpaceRepo();
    await expect(resolveSpaceInvite(repo, 'not-a-real-token')).rejects.toThrow(InviteNotFoundError);
  });
});
