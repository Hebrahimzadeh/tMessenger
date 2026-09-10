import type { CardCommentStatus, CardStatus, SpaceStatus } from '@taavon/database';

export class CommentNotFoundError extends Error {
  constructor() {
    super('Comment not found.');
    this.name = 'CommentNotFoundError';
  }
}

export class CardNotFoundForCommentError extends Error {
  constructor() {
    super('Card not found.');
    this.name = 'CardNotFoundForCommentError';
  }
}

/** The card's space is not PUBLISHED, or the card itself is not ACTIVE - no new public discussion there. */
export class CommentsNotAcceptedError extends Error {
  constructor() {
    super('This card is not open for public comments.');
    this.name = 'CommentsNotAcceptedError';
  }
}

export class NotCommentEditorError extends Error {
  constructor() {
    super('Only the comment author may edit it.');
    this.name = 'NotCommentEditorError';
  }
}

export class NotCommentModeratorError extends Error {
  constructor() {
    super('Only the comment author or a space moderator may remove it.');
    this.name = 'NotCommentModeratorError';
  }
}

/** "reply فقط به comment همان card" - a reply must target a comment on the same card. */
export class CrossCardReplyError extends Error {
  constructor() {
    super('A reply must target a comment on the same card.');
    this.name = 'CrossCardReplyError';
  }
}

export class InvalidCommentCursorError extends Error {
  constructor() {
    super('Invalid pagination cursor.');
    this.name = 'InvalidCommentCursorError';
  }
}

export interface CommentRecord {
  id: string;
  cardId: string;
  authorId: string;
  parentId: string | null;
  status: CardCommentStatus;
  latestBody: string;
  revisionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentRepository {
  getCardContext(cardId: string): Promise<{ cardStatus: CardStatus; spaceStatus: SpaceStatus; spaceId: string } | null>;
  isSpaceEditor(userId: string, spaceId: string): Promise<boolean>;
  findComment(commentId: string): Promise<CommentRecord | null>;
  createComment(input: { cardId: string; authorId: string; parentId: string | null; body: string }): Promise<CommentRecord>;
  addRevision(input: { commentId: string; editorId: string; body: string }): Promise<CommentRecord>;
  softDelete(input: { commentId: string; actorId: string; correlationId: string }): Promise<void>;
  listByCard(cardId: string, params: { limit: number; before: { createdAt: string; id: string } | null }): Promise<CommentRecord[]>;
}

export interface CommentView {
  id: string;
  cardId: string;
  authorId: string;
  parentId: string | null;
  status: CardCommentStatus;
  body: string | null;
  revisionCount: number;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toCommentView(record: CommentRecord): CommentView {
  return {
    id: record.id,
    cardId: record.cardId,
    authorId: record.authorId,
    parentId: record.parentId,
    status: record.status,
    // "حذف متن را پنهان ولی audit را حفظ" - the body disappears from the
    // view the moment it is soft-deleted; the revision rows behind it stay.
    body: record.status === 'DELETED' ? null : record.latestBody,
    revisionCount: record.revisionCount,
    edited: record.revisionCount > 1,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function requireCommentableCard(repo: CommentRepository, cardId: string): Promise<{ spaceId: string }> {
  const context = await repo.getCardContext(cardId);
  if (!context) throw new CardNotFoundForCommentError();
  if (context.spaceStatus !== 'PUBLISHED' || context.cardStatus !== 'ACTIVE') throw new CommentsNotAcceptedError();
  return { spaceId: context.spaceId };
}

export async function createComment(
  repo: CommentRepository,
  cardId: string,
  authorId: string,
  input: { body: string; parentId?: string }
): Promise<CommentView> {
  await requireCommentableCard(repo, cardId);

  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await repo.findComment(input.parentId);
    if (!parent || parent.status === 'DELETED') throw new CommentNotFoundError();
    if (parent.cardId !== cardId) throw new CrossCardReplyError();
    parentId = parent.id;
  }

  const record = await repo.createComment({ cardId, authorId, parentId, body: input.body });
  return toCommentView(record);
}

export async function editComment(
  repo: CommentRepository,
  commentId: string,
  editorId: string,
  input: { body: string }
): Promise<CommentView> {
  const comment = await repo.findComment(commentId);
  if (!comment || comment.status === 'DELETED') throw new CommentNotFoundError();
  if (comment.authorId !== editorId) throw new NotCommentEditorError();

  const updated = await repo.addRevision({ commentId, editorId, body: input.body });
  return toCommentView(updated);
}

/**
 * A soft delete - "حذف متن را پنهان ولی audit را حفظ". The author, or a
 * space moderator (creator / SPACE_ADMIN), may remove a comment; the row,
 * its revisions and an audit event all remain. Idempotent: deleting an
 * already-deleted comment is a no-op.
 */
export async function deleteComment(
  repo: CommentRepository,
  commentId: string,
  actorId: string,
  correlationId: string
): Promise<CommentView> {
  const comment = await repo.findComment(commentId);
  if (!comment) throw new CommentNotFoundError();
  if (comment.status === 'DELETED') return toCommentView(comment);

  if (comment.authorId !== actorId) {
    const context = await repo.getCardContext(comment.cardId);
    const isModerator = context ? await repo.isSpaceEditor(actorId, context.spaceId) : false;
    if (!isModerator) throw new NotCommentModeratorError();
  }

  await repo.softDelete({ commentId, actorId, correlationId });
  const after = await repo.findComment(commentId);
  return toCommentView(after ?? { ...comment, status: 'DELETED' });
}

export interface CommentListResult {
  items: CommentView[];
  nextCursor: string | null;
}

export async function listComments(
  repo: CommentRepository,
  cardId: string,
  params: { limit: number; cursor?: string }
): Promise<CommentListResult> {
  await requireCommentableCard(repo, cardId);

  const before = params.cursor ? decodeCursor(params.cursor) : null;
  const rows = await repo.listByCard(cardId, { limit: params.limit + 1, before });
  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];

  return {
    items: page.map(toCommentView),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
  };
}

function encodeCursor(c: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { createdAt: string; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { createdAt: unknown }).createdAt === 'string' &&
      typeof (parsed as { id: unknown }).id === 'string'
    ) {
      return parsed as { createdAt: string; id: string };
    }
    throw new Error('shape');
  } catch {
    throw new InvalidCommentCursorError();
  }
}
