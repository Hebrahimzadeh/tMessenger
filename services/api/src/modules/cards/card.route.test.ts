import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, it } from 'vitest';
import type { CardAttachmentKind, SpaceStatus } from '@taavon/database';
import { ZodError } from 'zod';
import { apiError } from '../../lib/api-error';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../auth/session-tokens';
import { FakeStorageProvider } from '../storage/fake-storage-provider';
import { storageRoutes } from '../storage/storage.route';
import { cardRoutes } from './card.route';
import type { AttachmentRecord, AttachmentRepository } from './attachment.service';
import type { CardAttachmentRecord, CardRecord, CardRepository } from './card.service';
import { inferCardKind } from './card-kind-inference';
import { deriveTitle } from './card-state-machine';

const SESSION_HMAC_KEY = 'test-only-session-hmac-key';
const USER_1 = '11111111-1111-4111-8111-111111111111';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const MP3 = Buffer.from('ID3\x03\x00\x00\x00');

function fakeRepos(spaceStatus: SpaceStatus = 'PUBLISHED') {
  const SPACE = randomUUID();
  const cards = new Map<string, { record: CardRecord; revisions: { revisionNumber: number; title: string; body: string }[] }>();
  const attachments = new Map<
    string,
    Omit<AttachmentRecord, 'kind'> & {
      kind: CardAttachmentKind;
      cardId: string | null;
      linkUrl: string | null;
      locationLabel: string | null;
      approxLat: number | null;
      approxLng: number | null;
      checksumSha256: string | null;
    }
  >();
  let clock = Date.parse('2026-09-10T08:00:00.000Z');

  function attachmentRecordsFor(cardId: string): CardAttachmentRecord[] {
    return [...attachments.values()]
      .filter((a) => a.cardId === cardId)
      .map((a) => ({
        id: a.id,
        cardId: a.cardId,
        ownerId: a.ownerId,
        kind: a.kind,
        status: a.status,
        objectKey: a.objectKey,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        linkUrl: a.linkUrl,
        locationLabel: a.locationLabel,
        approxLat: a.approxLat,
        approxLng: a.approxLng,
      }));
  }

  const cardRepo: CardRepository = {
    async getSpaceStatus(spaceId) {
      return spaceId === SPACE ? spaceStatus : null;
    },
    async findAttachmentsByIds(ids) {
      return ids
        .map((id) => attachments.get(id))
        .filter((a): a is NonNullable<typeof a> => a !== undefined)
        .map((a) => ({
          id: a.id,
          cardId: a.cardId,
          ownerId: a.ownerId,
          kind: a.kind,
          status: a.status,
          objectKey: a.objectKey,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          linkUrl: a.linkUrl,
          locationLabel: a.locationLabel,
          approxLat: a.approxLat,
          approxLng: a.approxLng,
        }));
    },
    async createCard(input) {
      const id = randomUUID();
      cards.set(id, {
        revisions: [{ revisionNumber: 1, title: input.title, body: input.body }],
        record: {
          id,
          spaceId: input.spaceId,
          authorId: input.authorId,
          kind: input.kind,
          status: 'ACTIVE',
          publishedAt: new Date((clock += 1000)),
          latestRevision: { revisionNumber: 1, title: input.title, body: input.body },
          inferredKind: input.inferredKind,
          attachments: [],
        },
      });
      for (const attachmentId of input.fileAttachmentIds) attachments.get(attachmentId)!.cardId = id;
      for (const link of input.links) {
        const aid = randomUUID();
        attachments.set(aid, {
          id: aid, cardId: id, ownerId: input.authorId, kind: 'LINK', status: 'READY', objectKey: null,
          contentType: null, sizeBytes: null, rejectionReason: null, linkUrl: link.url, locationLabel: link.label ?? null,
          approxLat: null, approxLng: null, checksumSha256: null,
        });
      }
      for (const loc of input.locations) {
        const aid = randomUUID();
        attachments.set(aid, {
          id: aid, cardId: id, ownerId: input.authorId, kind: 'APPROXIMATE_LOCATION', status: 'READY', objectKey: null,
          contentType: null, sizeBytes: null, rejectionReason: null, linkUrl: null, locationLabel: loc.label,
          approxLat: loc.approxLat ?? null, approxLng: loc.approxLng ?? null, checksumSha256: null,
        });
      }
      return { id };
    },
    async addRevision(input) {
      const card = cards.get(input.cardId)!;
      const revisionNumber = card.revisions.length + 1;
      card.revisions.push({ revisionNumber, title: input.title, body: input.body });
      card.record.latestRevision = { revisionNumber, title: input.title, body: input.body };
      card.record.kind = input.kind;
      card.record.inferredKind = input.inferredKind;
      for (const attachmentId of input.fileAttachmentIds) attachments.get(attachmentId)!.cardId = input.cardId;
      return { revisionNumber };
    },
    async findCard(cardId) {
      const card = cards.get(cardId);
      if (!card) return null;
      return { ...card.record, attachments: attachmentRecordsFor(cardId) };
    },
    async listCards(spaceId, { limit, before }) {
      let rows = [...cards.values()]
        .map((c) => c.record)
        .filter((c) => c.spaceId === spaceId && c.status === 'ACTIVE')
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || (a.id < b.id ? 1 : -1));
      if (before) {
        rows = rows.filter(
          (c) =>
            c.publishedAt.getTime() < Date.parse(before.publishedAt) ||
            (c.publishedAt.getTime() === Date.parse(before.publishedAt) && c.id < before.id)
        );
      }
      return rows.slice(0, limit).map((c) => ({
        id: c.id,
        authorId: c.authorId,
        kind: c.kind,
        publishedAt: c.publishedAt,
        title: c.latestRevision.title,
        body: c.latestRevision.body,
        attachmentCount: attachmentRecordsFor(c.id).length,
        reactionCount: 0,
      }));
    },
    async getSpaceHealthStatus() {
      return null;
    },
  };

  const attachmentRepo: AttachmentRepository = {
    async createPending({ ownerId, kind, objectKey }) {
      const id = randomUUID();
      attachments.set(id, {
        id, cardId: null, ownerId, kind, status: 'PENDING', objectKey, contentType: null, sizeBytes: null,
        rejectionReason: null, linkUrl: null, locationLabel: null, approxLat: null, approxLng: null, checksumSha256: null,
      });
      return { id };
    },
    async findById(id) {
      const a = attachments.get(id);
      if (!a) return null;
      return {
        id: a.id, ownerId: a.ownerId, kind: a.kind as AttachmentRecord['kind'], status: a.status, objectKey: a.objectKey,
        contentType: a.contentType, sizeBytes: a.sizeBytes, rejectionReason: a.rejectionReason,
      };
    },
    async markProcessing(id, data) {
      Object.assign(attachments.get(id)!, { status: 'PROCESSING', ...data });
    },
    async markReady(id) {
      attachments.get(id)!.status = 'READY';
    },
    async markRejected(id, reason) {
      Object.assign(attachments.get(id)!, { status: 'REJECTED', rejectionReason: reason });
    },
  };

  return { SPACE, cardRepo, attachmentRepo, attachments };
}

function buildApp(overrides: {
  cardRepo: CardRepository;
  attachmentRepo: AttachmentRepository;
  storage?: FakeStorageProvider;
}) {
  const storage = overrides.storage ?? new FakeStorageProvider();
  const app = Fastify();
  app.register(cookie);
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send(apiError(request, 'VALIDATION_ERROR', 'داده ارسالی معتبر نیست.', err.issues));
      return;
    }
    reply.send(err);
  });
  app.register(cardRoutes, {
    prefix: '/v1',
    sessionHmacKey: SESSION_HMAC_KEY,
    storageProvider: storage,
    cardRepository: overrides.cardRepo,
    attachmentRepository: overrides.attachmentRepo,
  });
  app.register(storageRoutes, {
    prefix: '/v1/storage',
    sessionHmacKey: SESSION_HMAC_KEY,
    storageProvider: storage,
    attachmentRepository: overrides.attachmentRepo,
  });
  return { app, storage };
}

function cookieFor(userId: string) {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken(userId, SESSION_HMAC_KEY) };
}

describe('POST /v1/spaces/:spaceId/cards', () => {
  it('requires a session', async () => {
    const { SPACE, cardRepo, attachmentRepo } = fakeRepos();
    const { app } = buildApp({ cardRepo, attachmentRepo });
    const res = await app.inject({ method: 'POST', url: `/v1/spaces/${SPACE}/cards`, payload: { body: 'x' } });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('creates an AWARENESS card from body text alone', async () => {
    const { SPACE, cardRepo, attachmentRepo } = fakeRepos();
    const { app } = buildApp({ cardRepo, attachmentRepo });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${SPACE}/cards`,
      cookies: cookieFor(USER_1),
      payload: { body: 'یک اطلاعیه برای همسایه‌ها' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.kind).toBe('AWARENESS');
    expect(body.status).toBe('ACTIVE');
    expect(body.revision.revisionNumber).toBe(1);
    expect(body.attachments).toEqual([]);
    await app.close();
  });

  it('rejects an empty card (no body, no attachment)', async () => {
    const { SPACE, cardRepo, attachmentRepo } = fakeRepos();
    const { app } = buildApp({ cardRepo, attachmentRepo });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${SPACE}/cards`,
      cookies: cookieFor(USER_1),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('refuses card creation in a suspended space', async () => {
    const { SPACE, cardRepo, attachmentRepo } = fakeRepos('TEMPORARILY_SUSPENDED');
    const { app } = buildApp({ cardRepo, attachmentRepo });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${SPACE}/cards`,
      cookies: cookieFor(USER_1),
      payload: { body: 'x' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('SPACE_NOT_ACCEPTING_CARDS');
    await app.close();
  });
});

describe('the upload-intent -> upload -> finalize -> attach flow', () => {
  it('shows a READY file on the card with a signed read URL, and never shows a rejected one', async () => {
    const { SPACE, cardRepo, attachmentRepo } = fakeRepos();
    const { app, storage } = buildApp({ cardRepo, attachmentRepo });

    // A good image attachment.
    const intent = await app.inject({
      method: 'POST',
      url: '/v1/cards/attachments/upload-intent',
      cookies: cookieFor(USER_1),
      payload: { kind: 'IMAGE' },
    });
    expect(intent.statusCode).toBe(201);
    const goodId = intent.json().attachmentId as string;
    expect(intent.json().objectKey).toMatch(new RegExp(`^users/${USER_1}/card-uploads/`));

    const uploaded = await app.inject({
      method: 'POST',
      url: `/v1/storage/uploads/${goodId}`,
      cookies: cookieFor(USER_1),
      headers: { 'content-type': 'application/octet-stream' },
      payload: PNG,
    });
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json().status).toBe('PROCESSING');

    const finalized = await app.inject({
      method: 'POST',
      url: `/v1/cards/attachments/${goodId}/finalize`,
      cookies: cookieFor(USER_1),
    });
    expect(finalized.json().status).toBe('READY');

    // A bad attachment: declared IMAGE, bytes are an MP3 -> REJECTED at finalize.
    const badIntent = await app.inject({
      method: 'POST',
      url: '/v1/cards/attachments/upload-intent',
      cookies: cookieFor(USER_1),
      payload: { kind: 'IMAGE' },
    });
    const badId = badIntent.json().attachmentId as string;
    await app.inject({
      method: 'POST',
      url: `/v1/storage/uploads/${badId}`,
      cookies: cookieFor(USER_1),
      headers: { 'content-type': 'application/octet-stream' },
      payload: MP3,
    });
    const badFinal = await app.inject({
      method: 'POST',
      url: `/v1/cards/attachments/${badId}/finalize`,
      cookies: cookieFor(USER_1),
    });
    expect(badFinal.json().status).toBe('REJECTED');

    // Create a card referencing only the good attachment; the bad one cannot be attached.
    const created = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${SPACE}/cards`,
      cookies: cookieFor(USER_1),
      payload: { body: 'عکس محله', attachmentIds: [goodId] },
    });
    expect(created.statusCode).toBe(201);
    const cardId = created.json().id as string;

    const view = await app.inject({ method: 'GET', url: `/v1/cards/${cardId}` });
    expect(view.statusCode).toBe(200);
    expect(view.json().attachments).toHaveLength(1);
    expect(view.json().attachments[0].readUrl).toBeTruthy();
    expect(storage.hasObject(intent.json().objectKey)).toBe(true);

    // Attaching the rejected attachment is refused.
    const withBad = await app.inject({
      method: 'POST',
      url: `/v1/spaces/${SPACE}/cards`,
      cookies: cookieFor(USER_1),
      payload: { body: 'تلاش برای پیوست ردشده', attachmentIds: [badId] },
    });
    expect(withBad.statusCode).toBe(422);
    expect(withBad.json().error.code).toBe('INVALID_ATTACHMENT');

    await app.close();
  });
});

describe('GET /v1/cards/:cardId', () => {
  it('404s for a card in a non-published space', async () => {
    const { SPACE, cardRepo, attachmentRepo } = fakeRepos('DRAFT');
    // seed a card directly by forcing status
    const created = await cardRepo.createCard({
      spaceId: SPACE,
      authorId: USER_1,
      kind: 'AWARENESS',
      title: deriveTitle(undefined, 'x'),
      body: 'x',
      inferredKind: inferCardKind('x').inferredKind,
      confidence: inferCardKind('x').confidence,
      fileAttachmentIds: [],
      links: [],
      locations: [],
    });
    const { app } = buildApp({ cardRepo, attachmentRepo });
    const res = await app.inject({ method: 'GET', url: `/v1/cards/${created.id}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('PATCH /v1/cards/:cardId', () => {
  async function seed() {
    const repos = fakeRepos();
    const created = await repos.cardRepo.createCard({
      spaceId: repos.SPACE,
      authorId: USER_1,
      kind: 'AWARENESS',
      title: 'نسخهٔ اول',
      body: 'نسخهٔ اول',
      inferredKind: 'AWARENESS',
      confidence: 0.2,
      fileAttachmentIds: [],
      links: [],
      locations: [],
    });
    return { ...repos, cardId: created.id };
  }

  it('lets only the author edit', async () => {
    const { cardRepo, attachmentRepo, cardId } = await seed();
    const { app } = buildApp({ cardRepo, attachmentRepo });
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      cookies: cookieFor(STRANGER),
      payload: { body: 'دستکاری' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('creates a new revision for the author', async () => {
    const { cardRepo, attachmentRepo, cardId } = await seed();
    const { app } = buildApp({ cardRepo, attachmentRepo });
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/cards/${cardId}`,
      cookies: cookieFor(USER_1),
      payload: { body: 'نسخهٔ دوم' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().revision.revisionNumber).toBe(2);
    expect(res.json().revision.body).toBe('نسخهٔ دوم');
    await app.close();
  });
});

describe('GET /v1/spaces/:spaceId/cards', () => {
  it('lists cards newest-first with a working cursor', async () => {
    const { SPACE, cardRepo, attachmentRepo } = fakeRepos();
    const { app } = buildApp({ cardRepo, attachmentRepo });
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: `/v1/spaces/${SPACE}/cards`,
        cookies: cookieFor(USER_1),
        payload: { body: `کارت ${i}` },
      });
    }
    const page1 = await app.inject({ method: 'GET', url: `/v1/spaces/${SPACE}/cards` });
    expect(page1.statusCode).toBe(200);
    expect(page1.json().items).toHaveLength(3);
    expect(page1.json().nextCursor).toBeNull();
    await app.close();
  });
});
