import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import { profileRoutes } from './profile.route';
import type { ProfileRecord, ProfileRepository, PublicProfileRecord, PublicProfileRepository } from './profile.service';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const PHONE_ENCRYPTION_KEY = 'test-only-phone-encryption-key';

function fakeProfileRepo(seed: ProfileRecord[] = []): ProfileRepository {
  const records = new Map(seed.map((r) => [r.userId, r]));
  return {
    async findByUserId(userId) {
      return records.get(userId) ?? null;
    },
    async isUsernameTaken(usernameLower, excludingUserId) {
      for (const record of records.values()) {
        if (record.username === usernameLower && record.userId !== excludingUserId) return true;
      }
      return false;
    },
    async save(record) {
      records.set(record.userId, record);
      return record;
    },
  };
}

function fakePublicProfileRepo(record: PublicProfileRecord | null): PublicProfileRepository {
  return { async findPublicByUsername() { return record; } };
}

function buildApp(profileRepo: ProfileRepository, publicRepo: PublicProfileRepository) {
  const app = Fastify();
  app.register(cookie);
  app.register(profileRoutes, {
    prefix: '/v1',
    sessionHmacKey: SESSION_HMAC_KEY,
    phoneEncryptionKey: PHONE_ENCRYPTION_KEY,
    profileRepository: profileRepo,
    publicProfileRepository: publicRepo,
  });
  return app;
}

function sessionCookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

describe('GET /me', () => {
  it('returns 401 without a session', async () => {
    const app = buildApp(fakeProfileRepo(), fakePublicProfileRepo(null));
    const response = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns hasProfile: false for a logged-in user with no profile yet', async () => {
    const app = buildApp(fakeProfileRepo(), fakePublicProfileRepo(null));
    const response = await app.inject({ method: 'GET', url: '/v1/me', cookies: sessionCookieFor('11111111-1111-4111-8111-111111111111') });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ userId: '11111111-1111-4111-8111-111111111111', hasProfile: false });
    await app.close();
  });

  it('returns the existing profile for a logged-in user', async () => {
    const app = buildApp(
      fakeProfileRepo([{ userId: '11111111-1111-4111-8111-111111111111', username: 'ali_2000', displayName: 'علی', bio: null, phoneVisibility: 'PRIVATE' }]),
      fakePublicProfileRepo(null)
    );
    const response = await app.inject({ method: 'GET', url: '/v1/me', cookies: sessionCookieFor('11111111-1111-4111-8111-111111111111') });
    expect(response.json()).toMatchObject({ hasProfile: true, username: 'ali_2000' });
    await app.close();
  });
});

describe('PATCH /me/profile', () => {
  it('returns 401 without a session', async () => {
    const app = buildApp(fakeProfileRepo(), fakePublicProfileRepo(null));
    const response = await app.inject({ method: 'PATCH', url: '/v1/me/profile', payload: {} });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('creates a profile and strips unknown fields (mass assignment protection)', async () => {
    const app = buildApp(fakeProfileRepo(), fakePublicProfileRepo(null));
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me/profile',
      cookies: sessionCookieFor('11111111-1111-4111-8111-111111111111'),
      payload: { username: 'ali_2000', displayName: 'علی', avatarObjectKey: 'evil', userId: 'someone-elses-id' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ userId: '11111111-1111-4111-8111-111111111111', username: 'ali_2000' });
    await app.close();
  });

  it('returns 422 PROFILE_INCOMPLETE when creating without a username', async () => {
    const app = buildApp(fakeProfileRepo(), fakePublicProfileRepo(null));
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me/profile',
      cookies: sessionCookieFor('11111111-1111-4111-8111-111111111111'),
      payload: { displayName: 'علی' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'PROFILE_INCOMPLETE' } });
    await app.close();
  });

  it('returns 422 USERNAME_RESERVED for a reserved username', async () => {
    const app = buildApp(fakeProfileRepo(), fakePublicProfileRepo(null));
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me/profile',
      cookies: sessionCookieFor('11111111-1111-4111-8111-111111111111'),
      payload: { username: 'admin', displayName: 'علی' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'USERNAME_RESERVED' } });
    await app.close();
  });

  it('returns 409 USERNAME_TAKEN for a username already used by someone else', async () => {
    const app = buildApp(
      fakeProfileRepo([{ userId: '22222222-2222-4222-8222-222222222222', username: 'ali_2000', displayName: 'دیگری', bio: null, phoneVisibility: 'PRIVATE' }]),
      fakePublicProfileRepo(null)
    );
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me/profile',
      cookies: sessionCookieFor('11111111-1111-4111-8111-111111111111'),
      payload: { username: 'ali_2000', displayName: 'علی' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'USERNAME_TAKEN' } });
    await app.close();
  });

  it('returns 400 VALIDATION_ERROR for a malformed username (uppercase/too short/invalid chars)', async () => {
    const app = buildApp(fakeProfileRepo(), fakePublicProfileRepo(null));
    app.setErrorHandler((err, request, reply) => {
      reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'x', correlationId: String(request.id), details: [] } });
    });
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/me/profile',
      cookies: sessionCookieFor('11111111-1111-4111-8111-111111111111'),
      payload: { username: 'AB', displayName: 'علی' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /users/:username', () => {
  it('is public - no session required', async () => {
    const app = buildApp(
      fakeProfileRepo(),
      fakePublicProfileRepo({ username: 'ali_2000', displayName: 'علی', bio: null, phoneVisibility: 'PRIVATE', phoneCiphertext: null })
    );
    const response = await app.inject({ method: 'GET', url: '/v1/users/ali_2000' });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 404 PROFILE_NOT_FOUND for an unknown username', async () => {
    const app = buildApp(fakeProfileRepo(), fakePublicProfileRepo(null));
    const response = await app.inject({ method: 'GET', url: '/v1/users/nobody' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'PROFILE_NOT_FOUND' } });
    await app.close();
  });

  it('never returns a phoneE164 field when PRIVATE', async () => {
    const app = buildApp(
      fakeProfileRepo(),
      fakePublicProfileRepo({ username: 'ali_2000', displayName: 'علی', bio: null, phoneVisibility: 'PRIVATE', phoneCiphertext: 'ciphertext' })
    );
    const response = await app.inject({ method: 'GET', url: '/v1/users/ali_2000' });
    expect(response.json().phoneE164).toBeNull();
    await app.close();
  });

  it('is case-insensitive - looking up an uppercase path still finds the lowercase-stored username', async () => {
    let receivedUsername: string | undefined;
    const publicRepo: PublicProfileRepository = {
      async findPublicByUsername(usernameLower) {
        receivedUsername = usernameLower;
        return { username: 'ali_2000', displayName: 'علی', bio: null, phoneVisibility: 'PRIVATE', phoneCiphertext: null };
      },
    };
    const app = buildApp(fakeProfileRepo(), publicRepo);
    await app.inject({ method: 'GET', url: '/v1/users/ALI_2000' });
    expect(receivedUsername).toBe('ali_2000');
    await app.close();
  });
});
