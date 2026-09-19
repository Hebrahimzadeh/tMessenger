import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import type { SpaceStatus } from '@taavon/database';
import { ZodError } from 'zod';
import { apiError } from '../../lib/api-error';
import { spaceRoutes } from './space.route';
import { fixtureGate, fixturePolicySource, noopOrchestratorRepository } from '../ai/capabilities/policy.fixtures';
import { AiOrchestrator } from '../ai/orchestrator';
import { buildSpace } from '../ai/capabilities/space-builder';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import type { SpaceRepository, SpaceRoleRecord, SpaceVersionRecord } from './space.service';
import type { SpaceHealthRepository } from '@taavon/space-health';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';

interface FakeSpace {
  id: string;
  slug: string;
  status: SpaceStatus;
  creatorId: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

function fakeSpaceRepo(): SpaceRepository {
  const spaces = new Map<string, FakeSpace>();
  const versionsBySpace = new Map<string, SpaceVersionRecord[]>();
  const rolesBySpace = new Map<string, SpaceRoleRecord[]>();
  /** spaceId -> the users following it. The fake has no follow endpoint; the tests that care seed it directly. */
  const followersBySpace = new Map<string, Set<string>>();
  const invites = new Map<string, { spaceId: string; revokedAt: Date | null }>();
  const builtAudit: Parameters<SpaceRepository['createBuiltSpace']>[0][] = [];
  const newId = (_prefix: string) => randomUUID();

  function record(id: string) {
    const space = spaces.get(id);
    if (!space) return null;
    const versions = versionsBySpace.get(id) ?? [];
    return { ...space, latestVersion: versions[versions.length - 1]!, roles: rolesBySpace.get(id) ?? [] };
  }

  return {
    async slugExists(slug) {
      return [...spaces.values()].some((s) => s.slug === slug);
    },
    async createDraft({ title, slug, policyVersion, creatorId }) {
      const id = randomUUID();
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
    async followState(spaceId, userId) {
      const followers = followersBySpace.get(spaceId) ?? new Set<string>();
      return { followerCount: followers.size, isFollowing: userId !== null && followers.has(userId) };
    },

    async listByCreator(creatorId, limit) {
      // Insertion order reversed stands in for "newest first" - the fake has
      // no clock, and nothing here depends on the exact timestamps.
      return [...spaces.values()]
        .filter((s) => s.creatorId === creatorId && s.status !== 'ARCHIVED' && s.status !== 'REMOVED')
        .reverse()
        .slice(0, limit)
        .map((s) => {
          const versions = versionsBySpace.get(s.id) ?? [];
          const latest = versions[versions.length - 1];
          return {
            id: s.id,
            slug: s.slug,
            title: latest?.title ?? s.slug,
            purpose: latest?.purpose ?? '',
            status: s.status,
            createdAt: new Date('2026-09-19T00:00:00.000Z'),
          };
        });
    },

    async findBySlug(slug) {
      const found = [...spaces.values()].find((s) => s.slug === slug);
      return found ? record(found.id) : null;
    },
    async hasSpaceAdminRole() {
      return false;
    },
    async createNewVersion({ spaceId, roles, ...rest }) {
      const roleRecords: SpaceRoleRecord[] = roles.map((r) => ({
        id: randomUUID(),
        key: r.key,
        title: r.title,
        description: r.description ?? null,
        isPrimary: r.isPrimary,
      }));
      rolesBySpace.set(spaceId, roleRecords);
      const versions = versionsBySpace.get(spaceId) ?? [];
      const versionNumber = versions.length + 1;
      versions.push({
        ...rest,
        audience: rest.audience ?? null,
        cardHints: rest.cardHints ?? null,
        versionNumber,
        gateVerdict: null,
        gateReason: null,
        primaryRoleIds: roleRecords.filter((r) => r.isPrimary).map((r) => r.id),
        supplementaryRoleIds: roleRecords.filter((r) => !r.isPrimary).map((r) => r.id),
      });
      versionsBySpace.set(spaceId, versions);
      spaces.get(spaceId)!.status = 'DRAFT';
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

    async setGateVerdict({ spaceId, versionNumber, verdict, reason, newStatus }) {
      const version = versionsBySpace.get(spaceId)!.find((v) => v.versionNumber === versionNumber)!;
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
    async joinRole() {},
    async leaveRole() {},
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
}

function fakeHealthRepo(overrides: Partial<SpaceHealthRepository> = {}): SpaceHealthRepository {
  return {
    gatherSignals: async () => ({
      publishedAt: new Date(),
      lastActivityAt: null,
      contributorCount: 0,
      totalRoleCount: 0,
      activeRoleCount: 0,
      cardCount: 0,
    }),
    upsertSnapshot: async () => {},
    getSnapshot: async () => null,
    listPublishedSpaceIds: async () => [],
    ...overrides,
  };
}

function buildApp(repo: SpaceRepository, healthRepo?: SpaceHealthRepository) {
  const app = Fastify();
  app.register(cookie);
  // The same mapping buildApp installs, so a malformed body is the 400 it is in production.
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(apiError(request, 'VALIDATION_ERROR', 'داده ارسالی معتبر نیست.', err.issues));
      return;
    }
    reply.send(err);
  });
  app.register(spaceRoutes, {
    prefix: '/v1/spaces',
    sessionHmacKey: SESSION_HMAC_KEY,
    spaceRepository: repo,
    spaceHealthRepository: healthRepo ?? fakeHealthRepo(),
    // The real gate over the seeded baseline. The route's own fallback would
    // reach for `app.db`, which these tests deliberately do not have.
    spaceCreationGate: fixtureGate(),
    // The real builder over the seeded baseline with no model: complete,
    // rule-built spaces, decided exactly as production decides them.
    spaceBuilder: {
      build: (prompt, requesterId) =>
        buildSpace(
          {
            orchestrator: new AiOrchestrator({ provider: null, repository: noopOrchestratorRepository(), dailyBudgetMicros: null }),
            policy: fixturePolicySource,
          },
          prompt,
          requesterId
        ),
    },
  });
  return app;
}

function sessionCookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

// spaceResponseSchema validates creatorId as a real UUID, so session user
// ids in these tests must be UUID-shaped too (a plain 'user-1' literal
// fails that check with a 500, not the 200/403/etc. the test expects).
const USER_1 = '11111111-1111-4111-8111-111111111111';
const USER_2 = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

const TWO_PRIMARY_ROLES = [
  { key: 'organizer', title: 'سازمان‌دهنده', isPrimary: true },
  { key: 'contributor', title: 'همکار', isPrimary: true },
];
const VALID_PURPOSE = 'این بستر برای هماهنگی داوطلبانه‌ی نگهداری باغچه‌ی محله تشکیل شده است.';

describe('POST /v1/spaces', () => {
  it('requires a session', async () => {
    const app = buildApp(fakeSpaceRepo());
    const response = await app.inject({ method: 'POST', url: '/v1/spaces', payload: { title: 'x' } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('creates a draft and returns its full view to the creator', async () => {
    const app = buildApp(fakeSpaceRepo());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/spaces',
      cookies: sessionCookieFor(USER_1),
      payload: { title: 'باغ محله' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('DRAFT');
    expect(body.slug).toBe('باغ-محله');
    expect(body.gate).toEqual({ verdict: null, reason: null });
    await app.close();
  });

  it('refuses a title that matches an explicit rule, and creates nothing', async () => {
    const app = buildApp(fakeSpaceRepo());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/spaces',
      cookies: sessionCookieFor(USER_1),
      payload: { title: 'باشگاه قمار محله' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('SPACE_BLOCKED');

    // No slug was claimed, so the same title is not permanently spoiled for
    // someone who rewrites it.
    const retry = await app.inject({
      method: 'POST',
      url: '/v1/spaces',
      cookies: sessionCookieFor(USER_1),
      payload: { title: 'باشگاه بازی محله' },
    });
    expect(retry.statusCode).toBe(200);
    await app.close();
  });
});

describe('the full create -> update -> precheck -> publish -> get(anonymous) flow', () => {
  it('works end to end through real HTTP requests', async () => {
    const app = buildApp(fakeSpaceRepo());

    const created = await app.inject({
      method: 'POST',
      url: '/v1/spaces',
      cookies: sessionCookieFor(USER_1),
      payload: { title: 'باغ محله' },
    });
    const spaceId = created.json().id as string;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/v1/spaces/${spaceId}`,
      cookies: sessionCookieFor(USER_1),
      payload: {
        title: 'باغ محله',
        purpose: VALID_PURPOSE,
        participationMethods: ['حضوری'],
        roles: TWO_PRIMARY_ROLES,
        policyVersion: 1,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().definition.versionNumber).toBe(2);

    const precheck = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${spaceId}/precheck`,
      cookies: sessionCookieFor(USER_1),
    });
    expect(precheck.statusCode).toBe(200);
    expect(precheck.json()).toMatchObject({
      verdict: 'ALLOW',
      status: 'DRAFT',
      policyVersionRef: 'baseline:v1:8rules',
      matchedPolicyRules: [],
    });
    // The creative half travels with the verdict, so the composer has
    // something to show without a second round trip.
    expect(precheck.json().guidance.participationRoles.length).toBeGreaterThan(0);

    const published = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${spaceId}/publish`,
      cookies: sessionCookieFor(USER_1),
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe('PUBLISHED');

    const publicView = await app.inject({ method: 'GET', url: `/v1/spaces/${spaceId}` });
    expect(publicView.statusCode).toBe(200);
    expect(publicView.json().status).toBe('PUBLISHED');
    expect(publicView.json().gate).toBeUndefined();

    await app.close();
  });
});

describe('GET /v1/spaces/:idOrSlug', () => {
  it('404s for a DRAFT space when the caller is anonymous', async () => {
    const app = buildApp(fakeSpaceRepo());
    const created = await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'x' } });
    const response = await app.inject({ method: 'GET', url: `/v1/spaces/${created.json().id}` });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('404s for an unknown id', async () => {
    const app = buildApp(fakeSpaceRepo());
    const response = await app.inject({ method: 'GET', url: `/v1/spaces/${randomUUID()}` });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('publish without precheck', () => {
  it('returns 422 GATE_NOT_ALLOWED', async () => {
    const app = buildApp(fakeSpaceRepo());
    const created = await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'x' } });
    const response = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${created.json().id}/publish`,
      cookies: sessionCookieFor(USER_1),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('GATE_NOT_ALLOWED');
    await app.close();
  });
});

describe('editing by an unrelated user', () => {
  it('returns 403 FORBIDDEN', async () => {
    const app = buildApp(fakeSpaceRepo());
    const created = await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'x' } });
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/spaces/${created.json().id}`,
      cookies: sessionCookieFor(STRANGER),
      payload: { title: 'x', purpose: VALID_PURPOSE, participationMethods: ['حضوری'], roles: TWO_PRIMARY_ROLES, policyVersion: 1 },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });
});

describe('space invites', () => {
  it('creates, resolves, and revokes an invite over real HTTP', async () => {
    const app = buildApp(fakeSpaceRepo());
    const created = await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'x' } });
    const spaceId = created.json().id as string;

    const invite = await app.inject({ method: 'POST', url: `/v1/spaces/${spaceId}/invites`, cookies: sessionCookieFor(USER_1) });
    expect(invite.statusCode).toBe(200);
    const token = invite.json().token as string;

    const resolved = await app.inject({ method: 'GET', url: `/v1/spaces/invites/${token}` });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toEqual({ spaceId, slug: created.json().slug });

    await app.inject({ method: 'POST', url: `/v1/spaces/${spaceId}/invites/${token}/revoke`, cookies: sessionCookieFor(USER_1) });
    const afterRevoke = await app.inject({ method: 'GET', url: `/v1/spaces/invites/${token}` });
    expect(afterRevoke.statusCode).toBe(404);

    await app.close();
  });
});

describe('space role join/leave', () => {
  it('joins and leaves a role that belongs to the space', async () => {
    const app = buildApp(fakeSpaceRepo());
    const created = await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'x' } });
    const spaceId = created.json().id as string;
    await app.inject({
      method: 'PATCH',
      url: `/v1/spaces/${spaceId}`,
      cookies: sessionCookieFor(USER_1),
      payload: { title: 'x', purpose: VALID_PURPOSE, participationMethods: ['حضوری'], roles: TWO_PRIMARY_ROLES, policyVersion: 1 },
    });
    const space = await app.inject({ method: 'GET', url: `/v1/spaces/${spaceId}`, cookies: sessionCookieFor(USER_1) });
    const roleId = space.json().definition.roles[0].id as string;

    const join = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${spaceId}/roles/${roleId}/join`,
      cookies: sessionCookieFor(USER_2),
    });
    expect(join.statusCode).toBe(200);

    const badRole = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${spaceId}/roles/${randomUUID()}/join`,
      cookies: sessionCookieFor(USER_2),
    });
    expect(badRole.statusCode).toBe(404);

    await app.close();
  });
});

describe('cardHints validation ("template کارت نمونه فقط با isExample=true و برچسب ثابت")', () => {
  it('rejects a cardHints entry missing isExample/the fixed label - the schema itself, not application logic, enforces this', async () => {
    const app = buildApp(fakeSpaceRepo());
    app.setErrorHandler((err, request, reply) => {
      reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'x', correlationId: String(request.id), details: [] } });
    });
    const created = await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'x' } });

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/spaces/${created.json().id}`,
      cookies: sessionCookieFor(USER_1),
      payload: {
        title: 'x',
        purpose: VALID_PURPOSE,
        participationMethods: ['حضوری'],
        roles: TWO_PRIMARY_ROLES,
        policyVersion: 1,
        cardHints: [{ isExample: false, label: 'چیز دیگر', title: 'یک کارت جعلی' }],
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('accepts a correctly-shaped example card hint', async () => {
    const app = buildApp(fakeSpaceRepo());
    const created = await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'x' } });

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/spaces/${created.json().id}`,
      cookies: sessionCookieFor(USER_1),
      payload: {
        title: 'x',
        purpose: VALID_PURPOSE,
        participationMethods: ['حضوری'],
        roles: TWO_PRIMARY_ROLES,
        policyVersion: 1,
        cardHints: [{ isExample: true, label: 'نمونه', title: 'یک کارت نمونه' }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().definition.cardHints).toEqual([{ isExample: true, label: 'نمونه', title: 'یک کارت نمونه' }]);
    await app.close();
  });
});

describe('GET /v1/spaces/:spaceId/health', () => {
  it('requires a session', async () => {
    const app = buildApp(fakeSpaceRepo());
    const response = await app.inject({ method: 'GET', url: `/v1/spaces/${randomUUID()}/health` });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 403 for a caller who is neither creator nor space admin', async () => {
    const spaceRepo = fakeSpaceRepo();
    const app = buildApp(spaceRepo);
    const created = await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'x' } });
    const spaceId = created.json().id as string;

    const response = await app.inject({ method: 'GET', url: `/v1/spaces/${spaceId}/health`, cookies: sessionCookieFor(STRANGER) });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("returns the creator's own snapshot with no combined score field anywhere in the response", async () => {
    const spaceRepo = fakeSpaceRepo();
    const healthRepo = fakeHealthRepo({
      getSnapshot: async () => ({
        status: 'ACTIVE',
        cardCount: 0,
        contributorCount: 2,
        meaningfulViewCount: 0,
        firstUseLatencySeconds: null,
        roleActivity: { totalRoleCount: 2, activeRoleCount: 2 },
        crossRoleCardRate: 0,
        appliedRate: 0,
        reservationClosedRate: 0,
        reportQuality: null,
        lastActivityAt: null,
        suggestions: [{ code: 'CREATE_FIRST_CARD' }],
        computedAt: new Date('2026-09-09T00:00:00.000Z'),
      }),
    });
    const app = buildApp(spaceRepo, healthRepo);
    const created = await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'x' } });
    const spaceId = created.json().id as string;

    const response = await app.inject({ method: 'GET', url: `/v1/spaces/${spaceId}/health`, cookies: sessionCookieFor(USER_1) });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ACTIVE');
    expect(body.suggestions).toEqual([{ code: 'CREATE_FIRST_CARD' }]);
    expect(Object.keys(body)).not.toContain('score');
    expect(Object.keys(body)).not.toContain('overallScore');
    await app.close();
  });
});


describe('POST /v1/spaces/build - one prompt, a whole space', () => {
  it('requires a session', async () => {
    const app = buildApp(fakeSpaceRepo());
    const res = await app.inject({ method: 'POST', url: '/v1/spaces/build', payload: { prompt: 'امانت ابزار' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('builds and publishes from nothing but the prompt', async () => {
    const app = buildApp(fakeSpaceRepo());

    const res = await app.inject({
      method: 'POST',
      url: '/v1/spaces/build',
      cookies: sessionCookieFor(USER_1),
      payload: { prompt: 'یه کار خوب برای محله' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ outcome: 'PUBLISHED', policyVersionRef: 'baseline:v1:8rules', creativityApplied: false });

    // Public straight away, and the person who wrote the prompt manages it.
    const anonymous = await app.inject({ method: 'GET', url: `/v1/spaces/${body.space.slug}` });
    expect(anonymous.statusCode).toBe(200);
    const asCreator = await app.inject({ method: 'GET', url: `/v1/spaces/${body.space.id}`, cookies: sessionCookieFor(USER_1) });
    expect(asCreator.json().canManage).toBe(true);
    await app.close();
  });

  it('accepts no fields other than the prompt', async () => {
    const app = buildApp(fakeSpaceRepo());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/spaces/build',
      cookies: sessionCookieFor(USER_1),
      payload: { prompt: 'امانت ابزار محله', title: 'عنوانی که نباید اثر کند', status: 'PUBLISHED' },
    });

    expect(res.statusCode).toBe(200);
    const space = await app.inject({ method: 'GET', url: `/v1/spaces/${res.json().space.id}` });
    expect(space.json().definition.title).not.toBe('عنوانی که نباید اثر کند');
    await app.close();
  });

  it('answers a forbidden prompt with the rule, and creates nothing', async () => {
    const app = buildApp(fakeSpaceRepo());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/spaces/build',
      cookies: sessionCookieFor(USER_1),
      payload: { prompt: 'بستری برای شرط‌بندی روی بازی‌ها' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: 'BLOCKED', space: null });
    expect(res.json().matchedPolicyRules[0]).toContain('gambling@v1');
    await app.close();
  });

  it('rejects an empty prompt', async () => {
    const app = buildApp(fakeSpaceRepo());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/spaces/build',
      cookies: sessionCookieFor(USER_1),
      payload: { prompt: '   ' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('PATCH /v1/spaces/:id after publication', () => {
  async function built(app: ReturnType<typeof buildApp>) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/spaces/build',
      cookies: sessionCookieFor(USER_1),
      payload: { prompt: 'امانت ابزار محله' },
    });
    const { id } = res.json().space;
    const view = (await app.inject({ method: 'GET', url: `/v1/spaces/${id}`, cookies: sessionCookieFor(USER_1) })).json();
    const body = {
      title: view.definition.title,
      purpose: view.definition.purpose,
      participationMethods: view.definition.participationMethods,
      roles: view.definition.roles.map((r: { key: string; title: string; description: string | null; isPrimary: boolean }) => ({
        key: r.key,
        title: r.title,
        ...(r.description ? { description: r.description } : {}),
        isPrimary: r.isPrimary,
      })),
      policyVersion: 1,
    };
    return { id, body };
  }

  it('applies the edit and keeps the space public', async () => {
    const app = buildApp(fakeSpaceRepo());
    const { id, body } = await built(app);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/spaces/${id}`,
      cookies: sessionCookieFor(USER_1),
      payload: { ...body, title: 'امانت ابزار کوچه' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'PUBLISHED', definition: { title: 'امانت ابزار کوچه' } });
    await app.close();
  });

  it('refuses a forbidden edit with 422 and the rule, leaving the public version as it was', async () => {
    const app = buildApp(fakeSpaceRepo());
    const { id, body } = await built(app);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/spaces/${id}`,
      cookies: sessionCookieFor(USER_1),
      payload: { ...body, purpose: `${body.purpose} با قمار.` },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('SPACE_EDIT_REFUSED');
    expect(res.json().error.details[0]).toContain('gambling@v1');
    const publicView = await app.inject({ method: 'GET', url: `/v1/spaces/${id}` });
    expect(publicView.json().definition.purpose).toBe(body.purpose);
    await app.close();
  });

  it('forbids a stranger', async () => {
    const app = buildApp(fakeSpaceRepo());
    const { id, body } = await built(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/spaces/${id}`,
      cookies: sessionCookieFor(STRANGER),
      payload: { ...body, title: 'تصاحب' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /v1/spaces/mine', () => {
  it('lists the caller own spaces, including one still waiting for a person', async () => {
    const app = buildApp(fakeSpaceRepo());
    await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'باغ محله' } });

    const response = await app.inject({ method: 'GET', url: '/v1/spaces/mine', cookies: sessionCookieFor(USER_1) });

    expect(response.statusCode).toBe(200);
    // A DRAFT: before this route existed such a space appeared in no list at
    // all, because the search index is PUBLISHED-only by design.
    expect(response.json().items).toMatchObject([{ title: 'باغ محله', status: 'DRAFT' }]);
    await app.close();
  });

  it('never shows one person spaces to another', async () => {
    const app = buildApp(fakeSpaceRepo());
    await app.inject({ method: 'POST', url: '/v1/spaces', cookies: sessionCookieFor(USER_1), payload: { title: 'باغ محله' } });

    const response = await app.inject({ method: 'GET', url: '/v1/spaces/mine', cookies: sessionCookieFor(USER_2) });

    expect(response.json().items).toEqual([]);
    await app.close();
  });

  it('asks an anonymous visitor to sign in rather than answering with somebody list', async () => {
    const app = buildApp(fakeSpaceRepo());
    const response = await app.inject({ method: 'GET', url: '/v1/spaces/mine' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('is not mistaken for a slug - a space called "mine" does not shadow it', async () => {
    const app = buildApp(fakeSpaceRepo());
    const response = await app.inject({ method: 'GET', url: '/v1/spaces/mine', cookies: sessionCookieFor(USER_1) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('items');
    await app.close();
  });
});
