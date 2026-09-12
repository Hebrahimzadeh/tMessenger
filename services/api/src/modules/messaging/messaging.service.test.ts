import { describe, expect, it } from 'vitest';
import {
  ConversationNotFoundError,
  createDirectConversation,
  deleteMessage,
  editMessage,
  getOrCreateAssistantConversation,
  internalServiceCredential,
  InvalidMessageCursorError,
  listConversations,
  listMessages,
  markRead,
  MessageNotFoundError,
  NotMessageAuthorError,
  ReceiptMessageMismatchError,
  SelfConversationError,
  sendMessage,
  sendSystemMessage,
  SystemSenderNotAuthorizedError,
  toConversationView,
  toMessageView,
  UnknownCounterpartError,
  type ConversationRecord,
  type MessageRecord,
  type MessagingRepository,
} from './messaging.service';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MALLORY = '33333333-3333-4333-8333-333333333333';
const CONVO = '44444444-4444-4444-8444-444444444444';

function conversation(over: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: CONVO,
    kind: 'DIRECT',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    memberIds: [ALICE, BOB],
    lastMessageAt: null,
    ...over,
  };
}

function message(over: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: 'm1',
    conversationId: CONVO,
    senderId: ALICE,
    senderKind: 'USER',
    status: 'VISIBLE',
    body: 'سلام',
    revisionCount: 1,
    createdAt: new Date('2026-09-01T10:05:00.000Z'),
    updatedAt: new Date('2026-09-01T10:05:00.000Z'),
    ...over,
  };
}

/** A repository whose every method throws unless a test opts into it, so no test passes by accident on an unstubbed call. */
function fakeRepo(over: Partial<MessagingRepository> = {}): MessagingRepository {
  const notStubbed = (name: string) => () => {
    throw new Error(`${name} was not stubbed for this test`);
  };
  return {
    findConversation: notStubbed('findConversation'),
    isMember: notStubbed('isMember'),
    userExists: notStubbed('userExists'),
    getOrCreateDirect: notStubbed('getOrCreateDirect'),
    getOrCreateAssistant: notStubbed('getOrCreateAssistant'),
    listConversationsForUser: notStubbed('listConversationsForUser'),
    countUnread: notStubbed('countUnread'),
    listMessages: notStubbed('listMessages'),
    findMessage: notStubbed('findMessage'),
    insertMessage: notStubbed('insertMessage'),
    addRevision: notStubbed('addRevision'),
    softDelete: notStubbed('softDelete'),
    upsertReceipt: notStubbed('upsertReceipt'),
    ...over,
  } as MessagingRepository;
}

/** A member-aware repo: `members` decides who is inside the conversation. */
function repoWithMembers(members: string[], over: Partial<MessagingRepository> = {}): MessagingRepository {
  return fakeRepo({
    findConversation: async () => conversation({ memberIds: members }),
    isMember: async (_c, userId) => members.includes(userId),
    countUnread: async () => 0,
    ...over,
  });
}

describe('membership is the gate on every read and write', () => {
  it('a non-member listing messages is told the conversation does not exist, not that they are forbidden', async () => {
    const repo = repoWithMembers([ALICE, BOB]);
    await expect(listMessages(repo, CONVO, MALLORY, { limit: 50 })).rejects.toBeInstanceOf(ConversationNotFoundError);
  });

  it('a non-member sending a message is refused the same way', async () => {
    const repo = repoWithMembers([ALICE, BOB], {
      insertMessage: async () => {
        throw new Error('a non-member must never reach insertMessage');
      },
    });
    await expect(sendMessage(repo, CONVO, MALLORY, { body: 'hi' })).rejects.toBeInstanceOf(ConversationNotFoundError);
  });

  it('gives a non-member the identical answer for a conversation that does not exist at all', async () => {
    const missing = fakeRepo({ findConversation: async () => null });
    const present = repoWithMembers([ALICE, BOB]);

    const forMissing = await listMessages(missing, CONVO, MALLORY, { limit: 50 }).catch((e: unknown) => e);
    const forPresent = await listMessages(present, CONVO, MALLORY, { limit: 50 }).catch((e: unknown) => e);

    // Same error type and same message: nothing in the response tells an
    // outsider whether these two people are talking.
    expect(forMissing).toBeInstanceOf(ConversationNotFoundError);
    expect(forPresent).toBeInstanceOf(ConversationNotFoundError);
    expect((forMissing as Error).message).toBe((forPresent as Error).message);
  });

  it('a member reads and writes normally', async () => {
    const repo = repoWithMembers([ALICE, BOB], {
      listMessages: async () => [message()],
      insertMessage: async (input) => message({ body: input.body, senderId: input.senderId }),
    });

    await expect(listMessages(repo, CONVO, ALICE, { limit: 50 })).resolves.toMatchObject({ items: [{ id: 'm1' }] });
    await expect(sendMessage(repo, CONVO, BOB, { body: 'درود' })).resolves.toMatchObject({
      body: 'درود',
      senderId: BOB,
      senderKind: 'USER',
    });
  });
});

describe('opening a direct conversation', () => {
  it('reuses Task 16\'s create-or-get, so asking twice yields the same conversation', async () => {
    const calls: string[][] = [];
    const repo = fakeRepo({
      userExists: async () => true,
      countUnread: async () => 0,
      getOrCreateDirect: async (a, b) => {
        calls.push([a, b]);
        return conversation();
      },
    });

    const first = await createDirectConversation(repo, ALICE, BOB);
    const second = await createDirectConversation(repo, ALICE, BOB);

    expect(first.id).toBe(second.id);
    expect(calls).toEqual([
      [ALICE, BOB],
      [ALICE, BOB],
    ]);
  });

  it('refuses a conversation with oneself', async () => {
    await expect(createDirectConversation(fakeRepo(), ALICE, ALICE)).rejects.toBeInstanceOf(SelfConversationError);
  });

  it('refuses an unknown counterpart', async () => {
    const repo = fakeRepo({ userExists: async () => false });
    await expect(createDirectConversation(repo, ALICE, BOB)).rejects.toBeInstanceOf(UnknownCounterpartError);
  });
});

describe('the assistant thread', () => {
  it('is one per person and is created idempotently', async () => {
    let created = 0;
    const assistant = conversation({ kind: 'SYSTEM_ASSISTANT', memberIds: [ALICE] });
    const repo = fakeRepo({
      countUnread: async () => 0,
      getOrCreateAssistant: async () => {
        created += 1;
        return assistant;
      },
    });

    const a = await getOrCreateAssistantConversation(repo, ALICE);
    const b = await getOrCreateAssistantConversation(repo, ALICE);

    expect(a.id).toBe(b.id);
    expect(a.kind).toBe('SYSTEM_ASSISTANT');
    expect(created).toBe(2); // asked twice, and the repository resolved to one row both times
  });

  it('has only its owner as a member - the assistant itself is not one, so there is no account to join or impersonate', async () => {
    const repo = fakeRepo({
      countUnread: async () => 0,
      getOrCreateAssistant: async () => conversation({ kind: 'SYSTEM_ASSISTANT', memberIds: [ALICE] }),
    });

    const view = await getOrCreateAssistantConversation(repo, ALICE);
    expect(view.members).toEqual([{ userId: ALICE }]);
  });

  it('refuses to write a system message without the internal credential', async () => {
    const repo = fakeRepo({
      findConversation: async () => conversation({ kind: 'SYSTEM_ASSISTANT', memberIds: [ALICE] }),
      insertMessage: async () => {
        throw new Error('must never be reached without the credential');
      },
    });

    // Anything a request could possibly carry - a string, a number, an
    // object - is rejected. The real credential is a symbol, which has no
    // form that survives JSON, so no body or header can produce it.
    for (const forged of ['service', '', 0, 1, null, undefined, {}, Symbol('messaging.internal-service-credential')]) {
      await expect(
        sendSystemMessage(repo, forged as never, CONVO, { body: 'x' })
      ).rejects.toBeInstanceOf(SystemSenderNotAuthorizedError);
    }
  });

  it('writes a system message with a null sender when the credential is genuine', async () => {
    const repo = fakeRepo({
      findConversation: async () => conversation({ kind: 'SYSTEM_ASSISTANT', memberIds: [ALICE] }),
      insertMessage: async (input) =>
        message({ senderId: input.senderId, senderKind: input.senderKind, body: input.body }),
    });

    const view = await sendSystemMessage(repo, internalServiceCredential(), CONVO, { body: 'راهنما' });
    expect(view).toMatchObject({ senderId: null, senderKind: 'SYSTEM_ASSISTANT', body: 'راهنما' });
  });

  it('will not let the assistant speak into a DIRECT conversation between two people', async () => {
    const repo = fakeRepo({
      findConversation: async () => conversation({ kind: 'DIRECT' }),
      insertMessage: async () => {
        throw new Error('must never be reached for a DIRECT conversation');
      },
    });

    await expect(
      sendSystemMessage(repo, internalServiceCredential(), CONVO, { body: 'x' })
    ).rejects.toBeInstanceOf(SystemSenderNotAuthorizedError);
  });
});

describe('editing and deleting one\'s own messages', () => {
  it('lets the author edit', async () => {
    const repo = repoWithMembers([ALICE, BOB], {
      findMessage: async () => message({ senderId: ALICE }),
      addRevision: async ({ body }) => message({ body, revisionCount: 2 }),
    });

    await expect(editMessage(repo, 'm1', ALICE, { body: 'اصلاح' })).resolves.toMatchObject({
      body: 'اصلاح',
      edited: true,
      revisionCount: 2,
    });
  });

  it('refuses to let a member edit someone else\'s message', async () => {
    const repo = repoWithMembers([ALICE, BOB], { findMessage: async () => message({ senderId: ALICE }) });
    await expect(editMessage(repo, 'm1', BOB, { body: 'x' })).rejects.toBeInstanceOf(NotMessageAuthorError);
  });

  it('refuses to let anyone edit an assistant message - it has no author to be', async () => {
    const repo = repoWithMembers([ALICE], {
      findMessage: async () => message({ senderId: null, senderKind: 'SYSTEM_ASSISTANT' }),
    });
    await expect(editMessage(repo, 'm1', ALICE, { body: 'x' })).rejects.toBeInstanceOf(NotMessageAuthorError);
  });

  it('tells a non-member the message does not exist rather than that they may not touch it', async () => {
    const repo = repoWithMembers([ALICE, BOB], { findMessage: async () => message() });
    await expect(editMessage(repo, 'm1', MALLORY, { body: 'x' })).rejects.toBeInstanceOf(ConversationNotFoundError);
  });

  it('hides the text on delete while keeping the row', async () => {
    const repo = repoWithMembers([ALICE, BOB], {
      findMessage: async () => message({ senderId: ALICE }),
      softDelete: async () => message({ senderId: ALICE, status: 'DELETED', body: null }),
    });

    const view = await deleteMessage(repo, 'm1', ALICE, 'corr-1');
    expect(view).toMatchObject({ status: 'DELETED', body: null, id: 'm1' });
  });

  it('is idempotent - deleting twice does not fail and does not write again', async () => {
    const repo = repoWithMembers([ALICE, BOB], {
      findMessage: async () => message({ senderId: ALICE, status: 'DELETED', body: null }),
      softDelete: async () => {
        throw new Error('an already-deleted message must not be written again');
      },
    });

    await expect(deleteMessage(repo, 'm1', ALICE, 'corr-1')).resolves.toMatchObject({ status: 'DELETED', body: null });
  });

  it('reports a missing message as missing', async () => {
    const repo = fakeRepo({ findMessage: async () => null });
    await expect(deleteMessage(repo, 'nope', ALICE, 'c')).rejects.toBeInstanceOf(MessageNotFoundError);
  });
});

describe('read receipts', () => {
  it('records how far a member has read', async () => {
    const repo = repoWithMembers([ALICE, BOB], {
      findMessage: async () => message(),
      upsertReceipt: async ({ conversationId, userId, lastReadMessageId }) => ({
        conversationId,
        userId,
        lastReadMessageId,
        lastReadAt: new Date('2026-09-01T11:00:00.000Z'),
      }),
    });

    await expect(markRead(repo, CONVO, BOB, 'm1')).resolves.toMatchObject({ userId: BOB, lastReadMessageId: 'm1' });
  });

  it('refuses a message from a different conversation', async () => {
    const repo = repoWithMembers([ALICE, BOB], {
      findMessage: async () => message({ conversationId: 'some-other-conversation' }),
    });
    await expect(markRead(repo, CONVO, BOB, 'm1')).rejects.toBeInstanceOf(ReceiptMessageMismatchError);
  });

  it('refuses a non-member outright', async () => {
    const repo = repoWithMembers([ALICE, BOB]);
    await expect(markRead(repo, CONVO, MALLORY, 'm1')).rejects.toBeInstanceOf(ConversationNotFoundError);
  });
});

describe('pagination', () => {
  function pageOf(n: number): MessageRecord[] {
    return Array.from({ length: n }, (_, i) =>
      message({ id: `m${i}`, createdAt: new Date(Date.UTC(2026, 8, 1, 10, 0, n - i)) })
    );
  }

  it('returns a cursor only when more remain, and none on the last page', async () => {
    const full = repoWithMembers([ALICE, BOB], { listMessages: async () => pageOf(4) });
    const partial = repoWithMembers([ALICE, BOB], { listMessages: async () => pageOf(2) });

    const withMore = await listMessages(full, CONVO, ALICE, { limit: 3 });
    expect(withMore.items).toHaveLength(3);
    expect(withMore.nextCursor).not.toBeNull();

    const lastPage = await listMessages(partial, CONVO, ALICE, { limit: 3 });
    expect(lastPage.items).toHaveLength(2);
    expect(lastPage.nextCursor).toBeNull();
  });

  it('asks for one more row than the page size, so "is there more" never needs a second count query', async () => {
    let asked = 0;
    const repo = repoWithMembers([ALICE, BOB], {
      listMessages: async (_c, params) => {
        asked = params.limit;
        return pageOf(1);
      },
    });

    await listMessages(repo, CONVO, ALICE, { limit: 50 });
    expect(asked).toBe(51);
  });

  it('round-trips its own cursor back into the keyset it encodes', async () => {
    let seen: { createdAt: string; id: string } | null = null;
    const repo = repoWithMembers([ALICE, BOB], {
      listMessages: async (_c, params) => {
        seen = params.before;
        return pageOf(4);
      },
    });

    const first = await listMessages(repo, CONVO, ALICE, { limit: 3 });
    await listMessages(repo, CONVO, ALICE, { limit: 3, cursor: first.nextCursor! });

    const last = first.items[2]!;
    expect(seen).toEqual({ createdAt: last.createdAt, id: last.id });
  });

  it('rejects a cursor that is not one of ours rather than silently starting over', async () => {
    const repo = repoWithMembers([ALICE, BOB], { listMessages: async () => [] });
    for (const bad of ['not-base64', Buffer.from('{}').toString('base64url'), Buffer.from('[]').toString('base64url')]) {
      await expect(listMessages(repo, CONVO, ALICE, { limit: 3, cursor: bad })).rejects.toBeInstanceOf(
        InvalidMessageCursorError
      );
    }
  });

  it('paginates the conversation list the same way', async () => {
    const rows = [
      conversation({ id: 'c1', lastMessageAt: new Date('2026-09-03T10:00:00.000Z') }),
      conversation({ id: 'c2', lastMessageAt: new Date('2026-09-02T10:00:00.000Z') }),
      conversation({ id: 'c3', lastMessageAt: new Date('2026-09-01T10:00:00.000Z') }),
    ];
    const repo = fakeRepo({ countUnread: async () => 0, listConversationsForUser: async () => rows });

    const page = await listConversations(repo, ALICE, { limit: 2 });
    expect(page.items.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(page.nextCursor).not.toBeNull();
  });
});

describe('what a conversation and a message look like on the wire', () => {
  it('reduces every member to a bare id - there is no field for a phone, identity claim or profile', () => {
    const view = toConversationView(conversation(), 3);

    expect(view.members).toEqual([{ userId: ALICE }, { userId: BOB }]);
    // Asserting the exact key set, not just the absence of one name: a
    // later addition of any member field fails here rather than shipping.
    for (const member of view.members) {
      expect(Object.keys(member)).toEqual(['userId']);
    }
    expect(Object.keys(view).sort()).toEqual(
      ['createdAt', 'id', 'kind', 'lastMessageAt', 'members', 'unreadCount'].sort()
    );
  });

  it('carries a timestamp for the last message, never a preview of its text', () => {
    const view = toConversationView(conversation({ lastMessageAt: new Date('2026-09-02T09:00:00.000Z') }), 0);
    expect(view.lastMessageAt).toBe('2026-09-02T09:00:00.000Z');
    expect(JSON.stringify(view)).not.toContain('سلام');
  });

  it('drops a deleted message\'s text from the view entirely', () => {
    const view = toMessageView(message({ status: 'DELETED', body: 'این نباید دیده شود' }));
    expect(view.body).toBeNull();
    expect(JSON.stringify(view)).not.toContain('این نباید دیده شود');
  });

  it('marks a message edited only once it has more than its first revision', () => {
    expect(toMessageView(message({ revisionCount: 1 })).edited).toBe(false);
    expect(toMessageView(message({ revisionCount: 2 })).edited).toBe(true);
  });
});
