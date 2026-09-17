import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it, vi } from 'vitest';
import { spaceRoutes } from './space.route';
import { spaceSearchRoutes } from './space-search.route';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import type { SpaceSearchRepository } from './space-search.service';
import type { SpaceSimilarityRepository } from './space-similarity.service';
import type { SpaceRepository } from './space.service';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const USER_1 = '11111111-1111-4111-8111-111111111111';

function sessionCookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

function fakeSearchRepo(overrides: Partial<SpaceSearchRepository> = {}): SpaceSearchRepository {
  return {
    search: vi.fn().mockResolvedValue([]),
    followSpace: vi.fn(),
    unfollowSpace: vi.fn(),
    ...overrides,
  };
}

function fakeSimilarityRepo(overrides: Partial<SpaceSimilarityRepository> = {}): SpaceSimilarityRepository {
  return {
    listPublishedForSimilarity: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// A minimal stand-in for Task 10's real SpaceRepository - only used here to
// prove the two route files can be registered under the same prefix
// without one shadowing the other (the actual space.route.ts behavior is
// already covered by its own test file).
function fakeSpaceRepo(): SpaceRepository {
  return {
    slugExists: vi.fn().mockResolvedValue(false),
    createDraft: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    hasSpaceAdminRole: vi.fn().mockResolvedValue(false),
    createNewVersion: vi.fn(),
    createBuiltSpace: vi.fn(),
    publishNewVersion: vi.fn(),
    setGateVerdict: vi.fn(),
    publish: vi.fn(),
    archive: vi.fn(),
    findRoleInSpace: vi.fn().mockResolvedValue(null),
    joinRole: vi.fn(),
    leaveRole: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    resolveInvite: vi.fn().mockResolvedValue(null),
  };
}

function buildApp(searchRepo: SpaceSearchRepository, similarityRepo: SpaceSimilarityRepository, spaceRepo: SpaceRepository) {
  const app = Fastify();
  app.register(cookie);
  app.register(spaceRoutes, { prefix: '/v1/spaces', sessionHmacKey: SESSION_HMAC_KEY, spaceRepository: spaceRepo });
  app.register(spaceSearchRoutes, {
    prefix: '/v1/spaces',
    sessionHmacKey: SESSION_HMAC_KEY,
    spaceSearchRepository: searchRepo,
    spaceSimilarityRepository: similarityRepo,
  });
  return app;
}

describe('GET /v1/spaces (search)', () => {
  it('works for an anonymous caller with scope=all (default)', async () => {
    const app = buildApp(fakeSearchRepo(), fakeSimilarityRepo(), fakeSpaceRepo());
    const response = await app.inject({ method: 'GET', url: '/v1/spaces' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], nextCursor: null });
    await app.close();
  });

  it('requires a session for scope=following', async () => {
    const app = buildApp(fakeSearchRepo(), fakeSimilarityRepo(), fakeSpaceRepo());
    const response = await app.inject({ method: 'GET', url: '/v1/spaces?scope=following' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('allows scope=following with a session', async () => {
    const app = buildApp(fakeSearchRepo(), fakeSimilarityRepo(), fakeSpaceRepo());
    const response = await app.inject({ method: 'GET', url: '/v1/spaces?scope=following', cookies: sessionCookieFor(USER_1) });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 400 INVALID_CURSOR for a malformed cursor', async () => {
    const app = buildApp(fakeSearchRepo(), fakeSimilarityRepo(), fakeSpaceRepo());
    const response = await app.inject({ method: 'GET', url: '/v1/spaces?cursor=not-a-real-cursor-!!!' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_CURSOR');
    await app.close();
  });

  it("does not get shadowed by space.route.ts's GET /:idOrSlug - both route files share the /v1/spaces prefix", async () => {
    // If find-my-way ever regressed on static-vs-parametric priority across
    // two separately-registered plugins at the same prefix, this would
    // instead hit space.route.ts's GET /:idOrSlug handler with idOrSlug=""
    // (empty) or 404 oddly - asserting the search response shape directly
    // proves the *search* handler is the one that actually ran.
    const app = buildApp(fakeSearchRepo(), fakeSimilarityRepo(), fakeSpaceRepo());
    const response = await app.inject({ method: 'GET', url: '/v1/spaces' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('nextCursor');
    await app.close();
  });
});

describe('GET /v1/spaces/similar', () => {
  it("is not shadowed by GET /:idOrSlug (a static 'similar' segment must win over the parametric route)", async () => {
    const similarityRepo = fakeSimilarityRepo({
      listPublishedForSimilarity: vi.fn().mockResolvedValue([
        { spaceId: '22222222-2222-4222-8222-222222222222', slug: 'baagh-mahalle', title: 'باغ محله', purpose: 'نگهداری باغچه محله' },
      ]),
    });
    const app = buildApp(fakeSearchRepo(), similarityRepo, fakeSpaceRepo());

    const response = await app.inject({
      method: 'GET',
      url: `/v1/spaces/similar?title=${encodeURIComponent('باغ محله')}&purpose=${encodeURIComponent('نگهداری باغچه')}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(1);
    await app.close();
  });

  it('requires a title', async () => {
    const app = buildApp(fakeSearchRepo(), fakeSimilarityRepo(), fakeSpaceRepo());
    app.setErrorHandler((err, request, reply) => {
      reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'x', correlationId: String(request.id), details: [] } });
    });
    const response = await app.inject({ method: 'GET', url: '/v1/spaces/similar?purpose=x' });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /v1/spaces/:spaceId/follow and /unfollow', () => {
  it('requires a session', async () => {
    const app = buildApp(fakeSearchRepo(), fakeSimilarityRepo(), fakeSpaceRepo());
    const response = await app.inject({ method: 'POST', url: '/v1/spaces/22222222-2222-4222-8222-222222222222/follow' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('follow and unfollow both call through to the repository with the right ids', async () => {
    const searchRepo = fakeSearchRepo();
    const app = buildApp(searchRepo, fakeSimilarityRepo(), fakeSpaceRepo());
    const spaceId = '22222222-2222-4222-8222-222222222222';

    const follow = await app.inject({ method: 'POST', url: `/v1/spaces/${spaceId}/follow`, cookies: sessionCookieFor(USER_1) });
    expect(follow.statusCode).toBe(200);
    expect(searchRepo.followSpace).toHaveBeenCalledWith(spaceId, USER_1);

    const unfollow = await app.inject({ method: 'POST', url: `/v1/spaces/${spaceId}/unfollow`, cookies: sessionCookieFor(USER_1) });
    expect(unfollow.statusCode).toBe(200);
    expect(searchRepo.unfollowSpace).toHaveBeenCalledWith(spaceId, USER_1);

    await app.close();
  });
});
