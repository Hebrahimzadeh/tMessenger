import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import type { SpaceStatus } from '@taavon/database';
import { spaceRoutes } from './space.route';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import type { SpaceRepository, SpaceRoleRecord, SpaceVersionRecord } from './space.service';

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
  const invites = new Map<string, { spaceId: string; revokedAt: Date | null }>();

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
    async setGateVerdict(spaceId, versionNumber, verdict, reason, newStatus) {
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

function buildApp(repo: SpaceRepository) {
  const app = Fastify();
  app.register(cookie);
  app.register(spaceRoutes, { prefix: '/v1/spaces', sessionHmacKey: SESSION_HMAC_KEY, spaceRepository: repo });
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
    expect(precheck.json()).toMatchObject({ verdict: 'ALLOW', status: 'DRAFT' });

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
