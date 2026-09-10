import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CardCommentStatus, CardStatus, SpaceStatus } from '@taavon/database';
import {
  CardNotFoundForCommentError,
  CommentNotFoundError,
  CommentsNotAcceptedError,
  createComment,
  CrossCardReplyError,
  deleteComment,
  editComment,
  listComments,
  NotCommentEditorError,
  NotCommentModeratorError,
  type CommentRecord,
  type CommentRepository,
} from './public-comment.service';

const CARD = '11111111-1111-4111-8111-111111111111';
const OTHER_CARD = '99999999-9999-4999-8999-999999999999';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const MODERATOR = '44444444-4444-4444-8444-444444444444';
const SPACE = '55555555-5555-4555-8555-555555555555';

function fakeCommentRepo(opts: { cardStatus?: CardStatus; spaceStatus?: SpaceStatus } = {}) {
  const cardStatus: CardStatus = opts.cardStatus ?? 'ACTIVE';
  const spaceStatus: SpaceStatus = opts.spaceStatus ?? 'PUBLISHED';
  const comments = new Map<string, CommentRecord & { revisions: string[] }>();
  let clock = 0;

  const repo: CommentRepository = {
    async getCardContext(cardId) {
      if (cardId !== CARD && cardId !== OTHER_CARD) return null;
      return { cardStatus, spaceStatus, spaceId: SPACE };
    },
    async isSpaceEditor(userId) {
      return userId === MODERATOR;
    },
    async findComment(commentId) {
      const c = comments.get(commentId);
      return c ? { ...c } : null;
    },
    async createComment({ cardId, authorId, parentId, body }) {
      const id = randomUUID();
      const record: CommentRecord & { revisions: string[] } = {
        id,
        cardId,
        authorId,
        parentId,
        status: 'VISIBLE' as CardCommentStatus,
        latestBody: body,
        revisionCount: 1,
        createdAt: new Date((clock += 1000)),
        updatedAt: new Date(clock),
        revisions: [body],
      };
      comments.set(id, record);
      return { ...record };
    },
    async addRevision({ commentId, body }) {
      const c = comments.get(commentId)!;
      c.revisions.push(body);
      c.latestBody = body;
      c.revisionCount = c.revisions.length;
      c.updatedAt = new Date((clock += 1000));
      return { ...c };
    },
    async softDelete({ commentId }) {
      const c = comments.get(commentId)!;
      c.status = 'DELETED';
    },
    async listByCard(cardId, { limit, before }) {
      let rows = [...comments.values()]
        .filter((c) => c.cardId === cardId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
      if (before) {
        rows = rows.filter(
          (c) =>
            c.createdAt.getTime() > Date.parse(before.createdAt) ||
            (c.createdAt.getTime() === Date.parse(before.createdAt) && c.id > before.id)
        );
      }
      return rows.slice(0, limit).map((c) => ({ ...c }));
    },
  };

  return { repo, comments };
}

describe('createComment', () => {
  it('creates a top-level comment', async () => {
    const { repo } = fakeCommentRepo();
    const comment = await createComment(repo, CARD, AUTHOR, { body: 'سلام به همه' });
    expect(comment.body).toBe('سلام به همه');
    expect(comment.parentId).toBeNull();
    expect(comment.edited).toBe(false);
  });

  it('creates a reply to a comment on the same card', async () => {
    const { repo } = fakeCommentRepo();
    const parent = await createComment(repo, CARD, AUTHOR, { body: 'سوال اول' });
    const reply = await createComment(repo, CARD, STRANGER, { body: 'پاسخ من', parentId: parent.id });
    expect(reply.parentId).toBe(parent.id);
  });

  it('rejects a reply that targets a comment on a different card', async () => {
    const { repo } = fakeCommentRepo();
    const parent = await createComment(repo, CARD, AUTHOR, { body: 'سوال اول' });
    await expect(createComment(repo, OTHER_CARD, STRANGER, { body: 'پاسخ اشتباه', parentId: parent.id })).rejects.toBeInstanceOf(
      CrossCardReplyError
    );
  });

  it('rejects a reply to a comment that does not exist', async () => {
    const { repo } = fakeCommentRepo();
    await expect(createComment(repo, CARD, AUTHOR, { body: 'x', parentId: randomUUID() })).rejects.toBeInstanceOf(
      CommentNotFoundError
    );
  });

  it('404s for an unknown card', async () => {
    const { repo } = fakeCommentRepo();
    await expect(createComment(repo, randomUUID(), AUTHOR, { body: 'x' })).rejects.toBeInstanceOf(CardNotFoundForCommentError);
  });

  it('refuses comments on a card in a non-published space', async () => {
    const { repo } = fakeCommentRepo({ spaceStatus: 'TEMPORARILY_SUSPENDED' });
    await expect(createComment(repo, CARD, AUTHOR, { body: 'x' })).rejects.toBeInstanceOf(CommentsNotAcceptedError);
  });
});

describe('editComment', () => {
  it('lets only the author edit, appending a revision', async () => {
    const { repo } = fakeCommentRepo();
    const comment = await createComment(repo, CARD, AUTHOR, { body: 'نسخهٔ اول' });
    const edited = await editComment(repo, comment.id, AUTHOR, { body: 'نسخهٔ دوم' });
    expect(edited.body).toBe('نسخهٔ دوم');
    expect(edited.edited).toBe(true);

    await expect(editComment(repo, comment.id, STRANGER, { body: 'دستکاری' })).rejects.toBeInstanceOf(NotCommentEditorError);
  });
});

describe('deleteComment (soft)', () => {
  it('hides the body but is idempotent and the author may delete their own comment', async () => {
    const { repo } = fakeCommentRepo();
    const comment = await createComment(repo, CARD, AUTHOR, { body: 'حذف‌شدنی' });
    const deleted = await deleteComment(repo, comment.id, AUTHOR, 'corr-1');
    expect(deleted.status).toBe('DELETED');
    expect(deleted.body).toBeNull();

    // idempotent
    const again = await deleteComment(repo, comment.id, AUTHOR, 'corr-2');
    expect(again.status).toBe('DELETED');
  });

  it('lets a space moderator delete someone else\'s comment', async () => {
    const { repo } = fakeCommentRepo();
    const comment = await createComment(repo, CARD, AUTHOR, { body: 'x' });
    const deleted = await deleteComment(repo, comment.id, MODERATOR, 'corr-1');
    expect(deleted.status).toBe('DELETED');
  });

  it('refuses a stranger deleting someone else\'s comment', async () => {
    const { repo } = fakeCommentRepo();
    const comment = await createComment(repo, CARD, AUTHOR, { body: 'x' });
    await expect(deleteComment(repo, comment.id, STRANGER, 'corr-1')).rejects.toBeInstanceOf(NotCommentModeratorError);
  });
});

describe('listComments', () => {
  it('lists in chronological order with a working cursor and keeps deleted comments (body hidden) for reply threading', async () => {
    const { repo } = fakeCommentRepo();
    const c1 = await createComment(repo, CARD, AUTHOR, { body: 'اول' });
    await createComment(repo, CARD, STRANGER, { body: 'دوم' });
    await deleteComment(repo, c1.id, AUTHOR, 'corr');

    const page = await listComments(repo, CARD, { limit: 20 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.body).toBeNull();
    expect(page.items[0]!.status).toBe('DELETED');
    expect(page.items[1]!.body).toBe('دوم');
  });
});
