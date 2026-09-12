import type { ConversationKind, MessageSenderKind, MessageStatus } from '@taavon/database';

/**
 * Every "you may not see this" case in this module raises exactly this, and
 * the route turns it into a 404 - "non-member 404". A 403 would confirm
 * that the conversation exists, which is itself a disclosure: it tells an
 * outsider that two particular people are talking. A non-member therefore
 * gets the same answer for a conversation that exists and one that never
 * did.
 */
export class ConversationNotFoundError extends Error {
  constructor() {
    super('Conversation not found.');
    this.name = 'ConversationNotFoundError';
  }
}

export class MessageNotFoundError extends Error {
  constructor() {
    super('Message not found.');
    this.name = 'MessageNotFoundError';
  }
}

export class NotMessageAuthorError extends Error {
  constructor() {
    super('Only the message author may edit or delete it.');
    this.name = 'NotMessageAuthorError';
  }
}

/** A person cannot open a direct conversation with themselves. */
export class SelfConversationError extends Error {
  constructor() {
    super('A direct conversation needs two different people.');
    this.name = 'SelfConversationError';
  }
}

export class UnknownCounterpartError extends Error {
  constructor() {
    super('No such person.');
    this.name = 'UnknownCounterpartError';
  }
}

export class InvalidMessageCursorError extends Error {
  constructor() {
    super('Invalid pagination cursor.');
    this.name = 'InvalidMessageCursorError';
  }
}

/** The named message is not in the conversation being marked read. */
export class ReceiptMessageMismatchError extends Error {
  constructor() {
    super('That message does not belong to this conversation.');
    this.name = 'ReceiptMessageMismatchError';
  }
}

/**
 * Raised when something tries to write an assistant message without the
 * in-process credential below.
 */
export class SystemSenderNotAuthorizedError extends Error {
  constructor() {
    super('A system message requires the internal service credential.');
    this.name = 'SystemSenderNotAuthorizedError';
  }
}

/**
 * The credential that authorizes writing as the assistant, and the whole of
 * "sender سیستمی فقط از service credential داخلی".
 *
 * It is a module-private symbol, so it cannot be produced by parsing a
 * request: no JSON body, query string, header or cookie can ever deserialize
 * into this value, because symbols have no literal form on the wire. The
 * only way to obtain it is to be code inside this process that imports
 * `internalServiceCredential`. No route does, and the HTTP layer has no
 * parameter through which one could be threaded - `sendMessage` below always
 * stamps the sender from the caller's own session and has no argument for
 * anything else.
 */
const SERVICE_CREDENTIAL: unique symbol = Symbol('messaging.internal-service-credential');
export type ServiceCredential = typeof SERVICE_CREDENTIAL;

/** In-process callers (a future assistant worker) obtain the credential here. Reachable only by importing this module, never from a request. */
export function internalServiceCredential(): ServiceCredential {
  return SERVICE_CREDENTIAL;
}

export interface ConversationRecord {
  id: string;
  kind: ConversationKind;
  createdAt: Date;
  memberIds: string[];
  lastMessageAt: Date | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderKind: MessageSenderKind;
  status: MessageStatus;
  body: string | null;
  revisionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReceiptRecord {
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: Date;
}

export interface MessagingRepository {
  findConversation(conversationId: string): Promise<ConversationRecord | null>;
  isMember(conversationId: string, userId: string): Promise<boolean>;
  userExists(userId: string): Promise<boolean>;
  getOrCreateDirect(userAId: string, userBId: string): Promise<ConversationRecord>;
  getOrCreateAssistant(userId: string): Promise<ConversationRecord>;
  listConversationsForUser(
    userId: string,
    params: { limit: number; before: { lastActivityAt: string; id: string } | null }
  ): Promise<ConversationRecord[]>;
  countUnread(conversationId: string, userId: string): Promise<number>;
  listMessages(
    conversationId: string,
    params: { limit: number; before: { createdAt: string; id: string } | null }
  ): Promise<MessageRecord[]>;
  findMessage(messageId: string): Promise<MessageRecord | null>;
  insertMessage(input: {
    conversationId: string;
    senderId: string | null;
    senderKind: MessageSenderKind;
    body: string;
  }): Promise<MessageRecord>;
  addRevision(input: { messageId: string; editorId: string; body: string }): Promise<MessageRecord>;
  softDelete(input: { messageId: string; actorId: string; correlationId: string }): Promise<MessageRecord>;
  upsertReceipt(input: { conversationId: string; userId: string; lastReadMessageId: string }): Promise<ReceiptRecord>;
}

export interface ConversationMemberView {
  userId: string;
}

export interface ConversationView {
  id: string;
  kind: ConversationKind;
  members: ConversationMemberView[];
  createdAt: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderKind: MessageSenderKind;
  status: MessageStatus;
  body: string | null;
  revisionCount: number;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Projects a conversation for the wire. Members become bare ids and nothing
 * else - "serialization هرگز phone، identity claim یا member خصوصی را ضمیمه
 * نکند". This function never receives a phone number or identity claim in
 * the first place, because ConversationRecord has no field for one; the
 * repository selects ids only. The privacy property is therefore a shape
 * guarantee rather than a filtering step that could be forgotten.
 */
export function toConversationView(record: ConversationRecord, unreadCount: number): ConversationView {
  return {
    id: record.id,
    kind: record.kind,
    members: record.memberIds.map((userId) => ({ userId })),
    createdAt: record.createdAt.toISOString(),
    lastMessageAt: record.lastMessageAt?.toISOString() ?? null,
    unreadCount,
  };
}

export function toMessageView(record: MessageRecord): MessageView {
  return {
    id: record.id,
    conversationId: record.conversationId,
    senderId: record.senderId,
    senderKind: record.senderKind,
    status: record.status,
    // A soft delete takes the text out of every view immediately; the
    // revision rows behind it stay, which is the only place the original
    // survives for M6's report path.
    body: record.status === 'DELETED' ? null : record.body,
    revisionCount: record.revisionCount,
    edited: record.revisionCount > 1,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * The single gate every read and write goes through. Returns the
 * conversation only to a member; everyone else gets the not-found error,
 * whether or not the row exists.
 */
async function requireMembership(
  repo: MessagingRepository,
  conversationId: string,
  userId: string
): Promise<ConversationRecord> {
  const conversation = await repo.findConversation(conversationId);
  if (!conversation) throw new ConversationNotFoundError();
  if (!(await repo.isMember(conversationId, userId))) throw new ConversationNotFoundError();
  return conversation;
}

export async function createDirectConversation(
  repo: MessagingRepository,
  callerId: string,
  withUserId: string
): Promise<ConversationView> {
  if (callerId === withUserId) throw new SelfConversationError();
  if (!(await repo.userExists(withUserId))) throw new UnknownCounterpartError();

  // Task 16's getOrCreateDirectConversation is reused unchanged, through
  // the repository - "create-or-get را تغییر امضا نده". Calling this twice
  // for the same pair returns the same conversation, so there is nothing to
  // guard against a double-tap on the client.
  const conversation = await repo.getOrCreateDirect(callerId, withUserId);
  return toConversationView(conversation, await repo.countUnread(conversation.id, callerId));
}

/**
 * The "همیار تعاون" thread: exactly one per person, created on first
 * request and returned unchanged afterwards. Idempotency comes from the
 * unique `pairKey` in the database, not from a check-then-create here, so
 * two concurrent first requests still end up with one conversation.
 *
 * The assistant is not a member and has no user row, so nobody can be added
 * to someone else's helper thread and no credential can authenticate as the
 * assistant - "حساب `taavon-helper` قابل جعل/عضوگیری نیست".
 */
export async function getOrCreateAssistantConversation(
  repo: MessagingRepository,
  userId: string
): Promise<ConversationView> {
  const conversation = await repo.getOrCreateAssistant(userId);
  return toConversationView(conversation, await repo.countUnread(conversation.id, userId));
}

export interface ConversationListResult {
  items: ConversationView[];
  nextCursor: string | null;
}

export async function listConversations(
  repo: MessagingRepository,
  userId: string,
  params: { limit: number; cursor?: string }
): Promise<ConversationListResult> {
  const before = params.cursor ? decodeConversationCursor(params.cursor) : null;
  const rows = await repo.listConversationsForUser(userId, { limit: params.limit + 1, before });
  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);

  const items = await Promise.all(
    page.map(async (row) => toConversationView(row, await repo.countUnread(row.id, userId)))
  );

  const last = page[page.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            lastActivityAt: (last.lastMessageAt ?? last.createdAt).toISOString(),
            id: last.id,
          })
        : null,
  };
}

export interface MessageListResult {
  items: MessageView[];
  nextCursor: string | null;
}

export async function listMessages(
  repo: MessagingRepository,
  conversationId: string,
  userId: string,
  params: { limit: number; cursor?: string }
): Promise<MessageListResult> {
  await requireMembership(repo, conversationId, userId);

  const before = params.cursor ? decodeMessageCursor(params.cursor) : null;
  const rows = await repo.listMessages(conversationId, { limit: params.limit + 1, before });
  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];

  return {
    items: page.map(toMessageView),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
  };
}

/**
 * Sends as the caller, always. There is no parameter for a sender, so a
 * request cannot claim to be someone else or to be the assistant; the id
 * comes from the verified session the route already resolved.
 */
export async function sendMessage(
  repo: MessagingRepository,
  conversationId: string,
  senderId: string,
  input: { body: string }
): Promise<MessageView> {
  await requireMembership(repo, conversationId, senderId);
  const record = await repo.insertMessage({
    conversationId,
    senderId,
    senderKind: 'USER',
    body: input.body,
  });
  return toMessageView(record);
}

/**
 * The only way an assistant message is ever written. The credential
 * argument is a module-private symbol (see SERVICE_CREDENTIAL), so this is
 * callable from in-process code and unreachable from a request.
 */
export async function sendSystemMessage(
  repo: MessagingRepository,
  credential: ServiceCredential,
  conversationId: string,
  input: { body: string }
): Promise<MessageView> {
  if (credential !== SERVICE_CREDENTIAL) throw new SystemSenderNotAuthorizedError();

  const conversation = await repo.findConversation(conversationId);
  if (!conversation) throw new ConversationNotFoundError();
  // The assistant speaks only in its own kind of thread; it can never post
  // into a DIRECT conversation between two people.
  if (conversation.kind !== 'SYSTEM_ASSISTANT') throw new SystemSenderNotAuthorizedError();

  const record = await repo.insertMessage({
    conversationId,
    senderId: null,
    senderKind: 'SYSTEM_ASSISTANT',
    body: input.body,
  });
  return toMessageView(record);
}

export async function editMessage(
  repo: MessagingRepository,
  messageId: string,
  editorId: string,
  input: { body: string }
): Promise<MessageView> {
  const message = await repo.findMessage(messageId);
  if (!message || message.status === 'DELETED') throw new MessageNotFoundError();
  // Membership first: a non-member must not be able to tell an existing
  // message from a missing one, so they get not-found rather than forbidden.
  await requireMembership(repo, message.conversationId, editorId);
  // "edit-own" - a member may edit only what they themselves wrote, which
  // also means nobody can edit an assistant message.
  if (message.senderId !== editorId) throw new NotMessageAuthorError();

  return toMessageView(await repo.addRevision({ messageId, editorId, body: input.body }));
}

/**
 * A soft delete: the text leaves every view, the row and its revisions stay.
 * Idempotent - deleting an already-deleted message returns the same view
 * rather than failing.
 */
export async function deleteMessage(
  repo: MessagingRepository,
  messageId: string,
  actorId: string,
  correlationId: string
): Promise<MessageView> {
  const message = await repo.findMessage(messageId);
  if (!message) throw new MessageNotFoundError();
  await requireMembership(repo, message.conversationId, actorId);
  if (message.senderId !== actorId) throw new NotMessageAuthorError();
  if (message.status === 'DELETED') return toMessageView(message);

  return toMessageView(await repo.softDelete({ messageId, actorId, correlationId }));
}

export async function markRead(
  repo: MessagingRepository,
  conversationId: string,
  userId: string,
  lastReadMessageId: string
): Promise<ReceiptRecord> {
  await requireMembership(repo, conversationId, userId);

  const message = await repo.findMessage(lastReadMessageId);
  if (!message) throw new MessageNotFoundError();
  if (message.conversationId !== conversationId) throw new ReceiptMessageMismatchError();

  return repo.upsertReceipt({ conversationId, userId, lastReadMessageId });
}

function encodeCursor(value: Record<string, string>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursorFields<T extends Record<string, string>>(raw: string, fields: (keyof T)[]): T {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) throw new Error('shape');
    for (const field of fields) {
      if (typeof (parsed as Record<string, unknown>)[field as string] !== 'string') throw new Error('shape');
    }
    return parsed as T;
  } catch {
    throw new InvalidMessageCursorError();
  }
}

function decodeMessageCursor(raw: string): { createdAt: string; id: string } {
  return decodeCursorFields(raw, ['createdAt', 'id']);
}

function decodeConversationCursor(raw: string): { lastActivityAt: string; id: string } {
  return decodeCursorFields(raw, ['lastActivityAt', 'id']);
}
