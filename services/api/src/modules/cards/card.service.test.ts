import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CardAttachmentKind, CardAttachmentStatus, SpaceStatus } from '@taavon/database';
import {
  createCard,
  getCard,
  InvalidAttachmentReferenceError,
  listCards,
  NotCardEditorError,
  SpaceNotAcceptingCardsError,
  SpaceNotFoundForCardError,
  updateCard,
  type CardAttachmentRecord,
  type CardRecord,
  type CardRepository,
} from './card.service';

const SPACE = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

interface FakeCard {
  id: string;
  spaceId: string;
  authorId: string;
  kind: CardRecord['kind'];
  status: CardRecord['status'];
  publishedAt: Date;
  revisions: { revisionNumber: number; title: string; body: string }[];
  inferredKind: CardRecord['kind'];
}

function fakeCardRepo(opts: { spaceStatus?: SpaceStatus } = {}) {
  const spaceStatus: SpaceStatus = opts.spaceStatus ?? 'PUBLISHED';
  const cards = new Map<string, FakeCard>();
  const attachments = new Map<string, CardAttachmentRecord>();
  let clock = Date.parse('2026-09-10T08:00:00.000Z');

  function seedAttachment(over: Partial<CardAttachmentRecord> = {}): CardAttachmentRecord {
    const record: CardAttachmentRecord = {
      id: randomUUID(),
      cardId: null,
      ownerId: AUTHOR,
      kind: 'IMAGE' as CardAttachmentKind,
      status: 'READY' as CardAttachmentStatus,
      objectKey: `users/${AUTHOR}/card-uploads/${randomUUID()}`,
      contentType: 'image/png',
      sizeBytes: 1024,
      linkUrl: null,
      locationLabel: null,
      approxLat: null,
      approxLng: null,
      ...over,
    };
    attachments.set(record.id, record);
    return record;
  }

  function assemble(card: FakeCard): CardRecord {
    const revision = card.revisions[card.revisions.length - 1]!;
    return {
      id: card.id,
      spaceId: card.spaceId,
      authorId: card.authorId,
      kind: card.kind,
      status: card.status,
      publishedAt: card.publishedAt,
      latestRevision: revision,
      inferredKind: card.inferredKind,
      attachments: [...attachments.values()].filter((a) => a.cardId === card.id),
    };
  }

  const repo: CardRepository = {
    async getSpaceStatus(spaceId) {
      return spaceId === SPACE ? spaceStatus : null;
    },
    async findAttachmentsByIds(ids) {
      return ids.map((id) => attachments.get(id)).filter((a): a is CardAttachmentRecord => a !== undefined);
    },
    async createCard(input) {
      const id = randomUUID();
      cards.set(id, {
        id,
        spaceId: input.spaceId,
        authorId: input.authorId,
        kind: input.kind,
        status: 'ACTIVE',
        publishedAt: new Date((clock += 1000)),
        revisions: [{ revisionNumber: 1, title: input.title, body: input.body }],
        inferredKind: input.inferredKind,
      });
      for (const attachmentId of input.fileAttachmentIds) {
        attachments.get(attachmentId)!.cardId = id;
      }
      for (const link of input.links) {
        seedAttachment({ cardId: id, kind: 'LINK', status: 'READY', objectKey: null, contentType: null, sizeBytes: null, linkUrl: link.url, locationLabel: link.label ?? null });
      }
      for (const location of input.locations) {
        seedAttachment({
          cardId: id,
          kind: 'APPROXIMATE_LOCATION',
          status: 'READY',
          objectKey: null,
          contentType: null,
          sizeBytes: null,
          locationLabel: location.label,
          approxLat: location.approxLat ?? null,
          approxLng: location.approxLng ?? null,
        });
      }
      return { id };
    },
    async addRevision(input) {
      const card = cards.get(input.cardId)!;
      const revisionNumber = card.revisions.length + 1;
      card.revisions.push({ revisionNumber, title: input.title, body: input.body });
      card.kind = input.kind;
      card.inferredKind = input.inferredKind;
      for (const attachmentId of input.fileAttachmentIds) attachments.get(attachmentId)!.cardId = card.id;
      return { revisionNumber };
    },
    async findCard(cardId) {
      const card = cards.get(cardId);
      return card ? assemble(card) : null;
    },
    async listCards(spaceId, { limit, before }) {
      let rows = [...cards.values()]
        .filter((c) => c.spaceId === spaceId && c.status === 'ACTIVE')
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || (a.id < b.id ? 1 : -1));
      if (before) {
        rows = rows.filter(
          (c) =>
            c.publishedAt.getTime() < Date.parse(before.publishedAt) ||
            (c.publishedAt.getTime() === Date.parse(before.publishedAt) && c.id < before.id)
        );
      }
      return rows.slice(0, limit).map((c) => {
        const revision = c.revisions[c.revisions.length - 1]!;
        return {
          id: c.id,
          authorId: c.authorId,
          kind: c.kind,
          publishedAt: c.publishedAt,
          title: revision.title,
          body: revision.body,
          attachmentCount: [...attachments.values()].filter((a) => a.cardId === c.id).length,
        };
      });
    },
  };

  return { repo, seedAttachment, cards };
}

describe('createCard', () => {
  it('creates a card from body text alone, defaulting kind to AWARENESS', async () => {
    const { repo } = fakeCardRepo();
    const { id } = await createCard(repo, {
      spaceId: SPACE,
      authorId: AUTHOR,
      body: 'یک اطلاعیه برای همسایه‌ها',
      attachmentIds: [],
      links: [],
      locations: [],
    });
    const card = await repo.findCard(id);
    expect(card?.kind).toBe('AWARENESS');
    expect(card?.status).toBe('ACTIVE');
    expect(card?.latestRevision.revisionNumber).toBe(1);
  });

  it('creates a card from a single meaningful attachment with no body', async () => {
    const { repo, seedAttachment } = fakeCardRepo();
    const attachment = seedAttachment();
    const { id } = await createCard(repo, {
      spaceId: SPACE,
      authorId: AUTHOR,
      body: '',
      attachmentIds: [attachment.id],
      links: [],
      locations: [],
    });
    const card = await repo.findCard(id);
    expect(card?.attachments).toHaveLength(1);
    expect(card?.latestRevision.title).toBe('کارت بدون عنوان');
  });

  it('creates a card from a link alone (stored verbatim, no server-side fetch)', async () => {
    const { repo } = fakeCardRepo();
    const { id } = await createCard(repo, {
      spaceId: SPACE,
      authorId: AUTHOR,
      body: '',
      attachmentIds: [],
      links: [{ url: 'https://example.org/doc' }],
      locations: [],
    });
    const card = await repo.findCard(id);
    expect(card?.attachments[0]).toMatchObject({ kind: 'LINK', linkUrl: 'https://example.org/doc' });
  });

  it('derives the title from the first line of the body when none is given', async () => {
    const { repo } = fakeCardRepo();
    const { id } = await createCard(repo, {
      spaceId: SPACE,
      authorId: AUTHOR,
      body: 'جمع‌آوری کمک‌های نقدی\nجزئیات در ادامه...',
      attachmentIds: [],
      links: [],
      locations: [],
    });
    expect((await repo.findCard(id))?.latestRevision.title).toBe('جمع‌آوری کمک‌های نقدی');
  });

  it('rejects a card with no body and no attachment', async () => {
    const { repo } = fakeCardRepo();
    await expect(
      createCard(repo, { spaceId: SPACE, authorId: AUTHOR, body: '   ', attachmentIds: [], links: [], locations: [] })
    ).rejects.toBeInstanceOf(InvalidAttachmentReferenceError);
  });

  it('rejects an attachment that is not the author\'s', async () => {
    const { repo, seedAttachment } = fakeCardRepo();
    const foreign = seedAttachment({ ownerId: STRANGER });
    await expect(
      createCard(repo, { spaceId: SPACE, authorId: AUTHOR, body: 'x', attachmentIds: [foreign.id], links: [], locations: [] })
    ).rejects.toBeInstanceOf(InvalidAttachmentReferenceError);
  });

  it('rejects an attachment that is not READY', async () => {
    const { repo, seedAttachment } = fakeCardRepo();
    const pending = seedAttachment({ status: 'PROCESSING' });
    await expect(
      createCard(repo, { spaceId: SPACE, authorId: AUTHOR, body: 'x', attachmentIds: [pending.id], links: [], locations: [] })
    ).rejects.toBeInstanceOf(InvalidAttachmentReferenceError);
  });

  it('rejects card creation in a non-published (e.g. suspended) space', async () => {
    const { repo } = fakeCardRepo({ spaceStatus: 'TEMPORARILY_SUSPENDED' });
    await expect(
      createCard(repo, { spaceId: SPACE, authorId: AUTHOR, body: 'x', attachmentIds: [], links: [], locations: [] })
    ).rejects.toBeInstanceOf(SpaceNotAcceptingCardsError);
  });

  it('404s (SpaceNotFound) for an unknown space', async () => {
    const { repo } = fakeCardRepo();
    await expect(
      createCard(repo, { spaceId: randomUUID(), authorId: AUTHOR, body: 'x', attachmentIds: [], links: [], locations: [] })
    ).rejects.toBeInstanceOf(SpaceNotFoundForCardError);
  });
});

describe('updateCard', () => {
  async function seededCard() {
    const fake = fakeCardRepo();
    const { id } = await createCard(fake.repo, {
      spaceId: SPACE,
      authorId: AUTHOR,
      body: 'نسخهٔ اول',
      attachmentIds: [],
      links: [],
      locations: [],
    });
    return { ...fake, id };
  }

  it('appends an immutable revision on edit', async () => {
    const { repo, id } = await seededCard();
    const { revisionNumber } = await updateCard(repo, id, AUTHOR, {
      body: 'نسخهٔ دوم',
      attachmentIds: [],
      links: [],
      locations: [],
    });
    expect(revisionNumber).toBe(2);
    const card = await repo.findCard(id);
    expect(card?.latestRevision.body).toBe('نسخهٔ دوم');
  });

  it('lets only the author edit', async () => {
    const { repo, id } = await seededCard();
    await expect(
      updateCard(repo, id, STRANGER, { body: 'دستکاری', attachmentIds: [], links: [], locations: [] })
    ).rejects.toBeInstanceOf(NotCardEditorError);
  });

  it('adds attachments without removing existing ones', async () => {
    const { repo, seedAttachment, id } = await seededCard();
    const extra = seedAttachment();
    await updateCard(repo, id, AUTHOR, { body: 'نسخهٔ دوم', attachmentIds: [extra.id], links: [], locations: [] });
    expect((await repo.findCard(id))?.attachments).toHaveLength(1);
  });
});

describe('getCard / listCards visibility', () => {
  it('getCard 404s when the space is not published', async () => {
    const fake = fakeCardRepo();
    const { id } = await createCard(fake.repo, {
      spaceId: SPACE,
      authorId: AUTHOR,
      body: 'x',
      attachmentIds: [],
      links: [],
      locations: [],
    });
    // flip the space out of PUBLISHED
    const suspended = fakeCardRepo({ spaceStatus: 'TEMPORARILY_SUSPENDED' });
    suspended.cards.set(id, fake.cards.get(id)!);
    await expect(getCard(suspended.repo, id)).rejects.toThrow();
  });

  it('listCards paginates by (publishedAt desc, id desc) with a stable cursor', async () => {
    const { repo } = fakeCardRepo();
    for (let i = 0; i < 3; i++) {
      await createCard(repo, {
        spaceId: SPACE,
        authorId: AUTHOR,
        body: `کارت ${i}`,
        attachmentIds: [],
        links: [],
        locations: [],
      });
    }
    const firstPage = await listCards(repo, SPACE, { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listCards(repo, SPACE, { limit: 2, cursor: firstPage.nextCursor! });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();

    const ids = [...firstPage.items, ...secondPage.items].map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('listCards 404s for a non-published space', async () => {
    const { repo } = fakeCardRepo({ spaceStatus: 'DRAFT' });
    await expect(listCards(repo, SPACE, { limit: 20 })).rejects.toBeInstanceOf(SpaceNotFoundForCardError);
  });
});
