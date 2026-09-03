import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@taavon/database';
import { legalRoutes } from './legal-document.route';
import type { LegalDocumentRepository } from './legal-document.service';

function fakeRepo(): LegalDocumentRepository {
  return {
    async findLatestEffective(type) {
      return type === 'TERMS'
        ? { version: 2, publicUrl: '/legal/terms/v2' }
        : { version: 1, publicUrl: '/legal/privacy/v1' };
    },
  };
}

describe('GET /current (legal)', () => {
  it('returns 200 with versions and absolute URLs, with no auth required', async () => {
    const app = Fastify();
    await app.register(legalRoutes, {
      prefix: '/v1/legal',
      appOrigin: 'https://taavon.example',
      repository: fakeRepo(),
    });

    const response = await app.inject({ method: 'GET', url: '/v1/legal/current' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      termsVersion: 2,
      privacyVersion: 1,
      termsUrl: 'https://taavon.example/legal/terms/v2',
      privacyUrl: 'https://taavon.example/legal/privacy/v1',
    });

    await app.close();
  });

  it('resolves app.db lazily, so it still works when the db plugin registers after this route (matches server.ts order)', async () => {
    const app = Fastify();
    // No `repository` override: forces the route to fall back to app.db.
    await app.register(legalRoutes, { prefix: '/v1/legal', appOrigin: 'https://taavon.example' });
    // Decorated *after* legalRoutes was registered, mirroring server.ts
    // (buildApp() registers routes, then databasePlugin/redisPlugin) - would
    // throw "Cannot read properties of undefined" if app.db were captured
    // eagerly at plugin-registration time instead of inside the handler.
    const fakeDb = {
      legalDocumentVersion: {
        findFirst: async ({ where }: { where: { type: string } }) =>
          where.type === 'TERMS' ? { version: 1, publicUrl: '/legal/terms/v1' } : { version: 1, publicUrl: '/legal/privacy/v1' },
      },
    };
    app.decorate('db', fakeDb as unknown as PrismaClient);

    const response = await app.inject({ method: 'GET', url: '/v1/legal/current' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      termsVersion: 1,
      privacyVersion: 1,
      termsUrl: 'https://taavon.example/legal/terms/v1',
      privacyUrl: 'https://taavon.example/legal/privacy/v1',
    });

    await app.close();
  });

  it('never requires an Authorization header', async () => {
    const app = Fastify();
    await app.register(legalRoutes, {
      prefix: '/v1/legal',
      appOrigin: 'https://taavon.example',
      repository: fakeRepo(),
    });

    const response = await app.inject({ method: 'GET', url: '/v1/legal/current' });
    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(403);

    await app.close();
  });
});
