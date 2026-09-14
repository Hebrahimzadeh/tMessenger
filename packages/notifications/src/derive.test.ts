import { describe, expect, it, vi } from 'vitest';
import { deriveNotifications, PREVIEW_MAX_CHARS, toPreview, type AudienceLookup, type OutboxEventInput } from './derive';

const CARD = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const OWNER = '44444444-4444-4444-8444-444444444444';

function audience(over: Partial<AudienceLookup> = {}): AudienceLookup {
  return {
    publicReplyAudience: async () => [OTHER],
    reservationAudience: async () => [OWNER],
    spaceAudience: async () => [OWNER],
    ...over,
  };
}

function event(over: Partial<OutboxEventInput> = {}): OutboxEventInput {
  return {
    id: 'evt-1',
    aggregateType: 'Card',
    aggregateId: CARD,
    eventType: 'card.comment_created',
    payload: { cardId: CARD, commentId: 'comment-1', authorId: AUTHOR },
    ...over,
  };
}

describe('a new public reply', () => {
  it('notifies the thread, keyed on the comment and the recipient', async () => {
    const intents = await deriveNotifications(event(), audience());

    expect(intents).toEqual([
      {
        recipientId: OTHER,
        type: 'NEW_PUBLIC_REPLY',
        dedupKey: `NEW_PUBLIC_REPLY:comment-1:${OTHER}`,
        subjectType: 'CardComment',
        subjectId: 'comment-1',
        deepLink: `/cards/${CARD}`,
      },
    ]);
  });

  it('asks for the audience without the author, so nobody is told about their own comment', async () => {
    const publicReplyAudience = vi.fn(async () => [OTHER]);
    await deriveNotifications(event(), audience({ publicReplyAudience }));
    expect(publicReplyAudience).toHaveBeenCalledWith(CARD, AUTHOR);
  });

  it('produces the same key for a replay and a different one for a different comment', async () => {
    const first = await deriveNotifications(event(), audience());
    const replay = await deriveNotifications(event(), audience());
    const second = await deriveNotifications(
      event({ id: 'evt-2', payload: { cardId: CARD, commentId: 'comment-2', authorId: AUTHOR } }),
      audience()
    );

    expect(replay[0]!.dedupKey).toBe(first[0]!.dedupKey);
    expect(second[0]!.dedupKey).not.toBe(first[0]!.dedupKey);
  });

  it('yields nothing when the payload is missing what it needs', async () => {
    await expect(deriveNotifications(event({ payload: {} }), audience())).resolves.toEqual([]);
    await expect(deriveNotifications(event({ payload: null }), audience())).resolves.toEqual([]);
    await expect(deriveNotifications(event({ payload: 'nonsense' }), audience())).resolves.toEqual([]);
  });

  it('yields one per recipient', async () => {
    const intents = await deriveNotifications(event(), audience({ publicReplyAudience: async () => [OTHER, OWNER] }));
    expect(intents.map((i) => i.recipientId)).toEqual([OTHER, OWNER]);
  });
});

describe('a reservation changing', () => {
  it('tells the people it concerns, and distinguishes each step of the lifecycle', async () => {
    const reserved = await deriveNotifications(
      event({ eventType: 'card.reservation_created', payload: { cardId: CARD, reservationId: 'r1', actorId: OTHER } }),
      audience()
    );
    const closed = await deriveNotifications(
      event({ eventType: 'card.reservation_closed', payload: { cardId: CARD, reservationId: 'r1', actorId: OTHER } }),
      audience()
    );

    expect(reserved[0]).toMatchObject({ type: 'RESERVATION_CHANGED', subjectId: 'r1' });
    // Same reservation, two genuinely different pieces of news: both must arrive.
    expect(closed[0]!.dedupKey).not.toBe(reserved[0]!.dedupKey);
  });

  it('yields nothing without a reservation to point at', async () => {
    const intents = await deriveNotifications(
      event({ eventType: 'card.reservation_created', payload: { cardId: CARD } }),
      audience()
    );
    expect(intents).toEqual([]);
  });
});

describe('moderation and guidance', () => {
  it('tells the person a moderation decision is about, and nobody else', async () => {
    const intents = await deriveNotifications(
      event({ id: 'evt-9', eventType: 'moderation.decided', payload: { subjectUserId: OTHER, subjectType: 'Card', subjectId: CARD } }),
      audience()
    );

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ recipientId: OTHER, type: 'MODERATION_UPDATE', subjectId: CARD });
  });

  it('tells a space\'s own people about guidance', async () => {
    const intents = await deriveNotifications(
      event({ id: 'evt-10', eventType: 'space.guidance_ready', aggregateId: 'space-1', payload: { spaceId: 'space-1' } }),
      audience()
    );
    expect(intents[0]).toMatchObject({ type: 'SPACE_GUIDANCE', subjectId: 'space-1' });
  });
});

describe('events nobody subscribes to', () => {
  // The outbox is a general-purpose log that other consumers also read. A
  // notification consumer that threw on an unfamiliar event would block the
  // queue for everyone, so an unrecognised event is simply not news.
  it.each(['space.created', 'space.published', 'card.created', 'card.revised', 'something.invented.later'])(
    'yields nothing for %s, without throwing',
    async (eventType) => {
      await expect(deriveNotifications(event({ eventType }), audience())).resolves.toEqual([]);
    }
  );

  it('never derives a private message notification - those never reach the outbox', async () => {
    // Task 19's canary asserts a private message writes no outbox row at all;
    // its notification is created alongside the message instead.
    const intents = await deriveNotifications(event({ eventType: 'message.created' }), audience());
    expect(intents).toEqual([]);
  });
});

describe('previews', () => {
  it('leaves short text alone', () => {
    expect(toPreview('سلام')).toBe('سلام');
  });

  it('never exceeds the ceiling', () => {
    const long = 'الف '.repeat(200);
    expect(toPreview(long).length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS + 1); // +1 for the ellipsis
  });

  it('collapses whitespace so a wall of newlines cannot smuggle length past the ceiling', () => {
    expect(toPreview('سلام\n\n\n   دنیا')).toBe('سلام دنیا');
  });

  it('breaks on a word when that keeps most of the budget', () => {
    const text = `${'کلمه '.repeat(20)}`;
    const preview = toPreview(text);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview).not.toContain('  ');
  });

  it('does not collapse to nothing on one unbroken string', () => {
    const preview = toPreview('ا'.repeat(300));
    expect(preview.length).toBeGreaterThan(PREVIEW_MAX_CHARS * 0.9);
  });

  it('is exactly 80 characters by default', () => {
    expect(PREVIEW_MAX_CHARS).toBe(80);
  });
});
