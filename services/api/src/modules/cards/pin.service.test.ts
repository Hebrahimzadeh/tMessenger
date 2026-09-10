import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CardStatus, SpaceStatus } from '@taavon/database';
import {
  CardNotFoundForPinError,
  CardNotPinnableError,
  listPins,
  MAX_PINS_PER_SPACE,
  NotSpacePinnerError,
  pinCard,
  PinLimitReachedError,
  unpinCard,
  type PinnedCardRecord,
  type PinRepository,
} from './pin.service';

const SPACE = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

function fakePinRepo() {
  const cards = new Map<string, { spaceId: string; cardStatus: CardStatus; spaceStatus: SpaceStatus; title: string }>();
  const pins = new Map<string, PinnedCardRecord>(); // cardId -> record

  function seedCard(cardId: string, over: Partial<{ cardStatus: CardStatus; spaceStatus: SpaceStatus; title: string }> = {}) {
    cards.set(cardId, { spaceId: SPACE, cardStatus: over.cardStatus ?? 'ACTIVE', spaceStatus: over.spaceStatus ?? 'PUBLISHED', title: over.title ?? 'کارت' });
  }

  const repo: PinRepository = {
    async getCardContext(cardId) {
      const c = cards.get(cardId);
      return c ? { spaceId: c.spaceId, cardStatus: c.cardStatus, spaceStatus: c.spaceStatus } : null;
    },
    async isSpaceEditor(userId) {
      return userId === OWNER;
    },
    async countPins(spaceId) {
      return [...pins.values()].filter((p) => cards.get(p.cardId)?.spaceId === spaceId).length;
    },
    async isPinned(cardId) {
      return pins.has(cardId);
    },
    async pin({ cardId, position }) {
      pins.set(cardId, { cardId, position, title: cards.get(cardId)!.title, pinnedAt: new Date() });
    },
    async unpin({ cardId }) {
      return pins.delete(cardId);
    },
    async list(spaceId) {
      return [...pins.values()].filter((p) => cards.get(p.cardId)?.spaceId === spaceId);
    },
  };

  return { repo, seedCard };
}

describe('pinCard', () => {
  it('pins a card and lists it', async () => {
    const { repo, seedCard } = fakePinRepo();
    const cardId = randomUUID();
    seedCard(cardId);
    const result = await pinCard(repo, cardId, OWNER, 'corr-1');
    expect(result.items).toEqual([expect.objectContaining({ cardId, position: 0 })]);
    expect(result.limit).toBe(MAX_PINS_PER_SPACE);
  });

  it('is idempotent - pinning an already-pinned card does not duplicate or move it', async () => {
    const { repo, seedCard } = fakePinRepo();
    const cardId = randomUUID();
    seedCard(cardId);
    await pinCard(repo, cardId, OWNER, 'corr-1');
    const again = await pinCard(repo, cardId, OWNER, 'corr-2');
    expect(again.items).toHaveLength(1);
  });

  it('refuses anyone but the space creator/admin', async () => {
    const { repo, seedCard } = fakePinRepo();
    const cardId = randomUUID();
    seedCard(cardId);
    await expect(pinCard(repo, cardId, STRANGER, 'corr-1')).rejects.toBeInstanceOf(NotSpacePinnerError);
  });

  it('refuses pinning a card in a suspended space', async () => {
    const { repo, seedCard } = fakePinRepo();
    const cardId = randomUUID();
    seedCard(cardId, { spaceStatus: 'TEMPORARILY_SUSPENDED' });
    await expect(pinCard(repo, cardId, OWNER, 'corr-1')).rejects.toBeInstanceOf(CardNotPinnableError);
  });

  it('refuses pinning a removed card', async () => {
    const { repo, seedCard } = fakePinRepo();
    const cardId = randomUUID();
    seedCard(cardId, { cardStatus: 'REMOVED' });
    await expect(pinCard(repo, cardId, OWNER, 'corr-1')).rejects.toBeInstanceOf(CardNotPinnableError);
  });

  it('404s for an unknown card', async () => {
    const { repo } = fakePinRepo();
    await expect(pinCard(repo, randomUUID(), OWNER, 'corr-1')).rejects.toBeInstanceOf(CardNotFoundForPinError);
  });

  it('enforces the per-space pin ceiling', async () => {
    const { repo, seedCard } = fakePinRepo();
    for (let i = 0; i < MAX_PINS_PER_SPACE; i++) {
      const id = randomUUID();
      seedCard(id);
      await pinCard(repo, id, OWNER, `corr-${i}`);
    }
    const overflow = randomUUID();
    seedCard(overflow);
    await expect(pinCard(repo, overflow, OWNER, 'corr-overflow')).rejects.toBeInstanceOf(PinLimitReachedError);
  });
});

describe('unpinCard', () => {
  it('removes a pin and re-lists', async () => {
    const { repo, seedCard } = fakePinRepo();
    const cardId = randomUUID();
    seedCard(cardId);
    await pinCard(repo, cardId, OWNER, 'corr-1');
    const after = await unpinCard(repo, cardId, OWNER, 'corr-2');
    expect(after.items).toEqual([]);
  });

  it('refuses anyone but the space creator/admin', async () => {
    const { repo, seedCard } = fakePinRepo();
    const cardId = randomUUID();
    seedCard(cardId);
    await pinCard(repo, cardId, OWNER, 'corr-1');
    await expect(unpinCard(repo, cardId, STRANGER, 'corr-2')).rejects.toBeInstanceOf(NotSpacePinnerError);
  });
});

describe('listPins', () => {
  it('always reports the fixed limit alongside the current items', async () => {
    const { repo } = fakePinRepo();
    const result = await listPins(repo, SPACE);
    expect(result).toEqual({ items: [], limit: MAX_PINS_PER_SPACE });
  });
});
