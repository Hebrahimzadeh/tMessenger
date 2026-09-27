import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  bookmarkStateSchema,
  cardListResponseSchema,
  commentListResponseSchema,
  commentViewSchema,
  createCommentBodySchema,
  editCommentBodySchema,
  pinnedCardListResponseSchema,
  reactionSummarySchema,
  toggleReactionBodySchema,
} from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import type { StorageProvider } from '../storage/storage-provider';
import { getOptionalSession, requireSession } from '../auth/session-guard';
import { createFakeRateLimiter, type RateLimiter } from '../auth/rate-limiter';
import { createPrismaCommentRepository } from './public-comment.repository';
import {
  createPrismaBookmarkRepository,
  createPrismaReactionRepository,
  createPrismaPinRepository,
} from './card-engagement.repository';
import { toCardListItem } from './card.route';
import {
  BookmarksNotAcceptedError,
  CardNotFoundForBookmarkError,
  getBookmarkState,
  InvalidBookmarkCursorError,
  listBookmarkedCards,
  toggleBookmark,
  type BookmarkRepository,
} from './bookmark.service';
import {
  CardNotFoundForCommentError,
  CommentsNotAcceptedError,
  CommentNotFoundError,
  createComment,
  CrossCardReplyError,
  deleteComment,
  editComment,
  InvalidCommentCursorError,
  listComments,
  NotCommentEditorError,
  NotCommentModeratorError,
  type CommentRepository,
} from './public-comment.service';
import {
  CardNotFoundForReactionError,
  getReactionSummary,
  ReactionRateLimitedError,
  ReactionsNotAcceptedError,
  toggleReaction,
  type ReactionRepository,
} from './reaction.service';
import {
  CardNotFoundForPinError,
  CardNotPinnableError,
  listPins,
  NotSpacePinnerError,
  pinCard,
  PinLimitReachedError,
  unpinCard,
  type PinRepository,
} from './pin.service';

const LIST_PAGE_SIZE = 50;
/** A generous but real ceiling - reactions are cheap clicks, not a form submit; this only blocks abusive rapid-fire toggling. */
export const REACTION_RATE_LIMIT = 30;
export const REACTION_RATE_WINDOW_SECONDS = 60;

export interface PublicCommentRouteOptions {
  sessionHmacKey: string;
  /** Needed only to sign the image on a bookmarked card's row; every other route here is text. */
  storageProvider: StorageProvider;
  commentRepository?: CommentRepository;
  reactionRepository?: ReactionRepository;
  bookmarkRepository?: BookmarkRepository;
  pinRepository?: PinRepository;
  reactionRateLimiter?: RateLimiter;
}

export async function publicCommentRoutes(app: FastifyInstance, opts: PublicCommentRouteOptions) {
  function commentRepo(): CommentRepository {
    return opts.commentRepository ?? createPrismaCommentRepository(app.db);
  }
  function reactionRepo(): ReactionRepository {
    return opts.reactionRepository ?? createPrismaReactionRepository(app.db);
  }
  function bookmarkRepo(): BookmarkRepository {
    return opts.bookmarkRepository ?? createPrismaBookmarkRepository(app.db);
  }
  function pinRepo(): PinRepository {
    return opts.pinRepository ?? createPrismaPinRepository(app.db);
  }
  const reactionRateLimiter = opts.reactionRateLimiter ?? createFakeRateLimiter(REACTION_RATE_LIMIT, REACTION_RATE_WINDOW_SECONDS);

  // --- comments -----------------------------------------------------

  app.get('/cards/:cardId/comments', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const query = request.query as { cursor?: string };

    try {
      const result = await listComments(commentRepo(), cardId, { limit: LIST_PAGE_SIZE, cursor: query.cursor });
      return commentListResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof CardNotFoundForCommentError) {
        return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
      }
      if (err instanceof CommentsNotAcceptedError) {
        return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
      }
      if (err instanceof InvalidCommentCursorError) {
        return reply.code(400).send(apiError(request, 'INVALID_CURSOR', 'نشانگر صفحه‌بندی معتبر نیست.'));
      }
      throw err;
    }
  });

  app.post('/cards/:cardId/comments', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { cardId } = request.params as { cardId: string };
    const body = createCommentBodySchema.parse(request.body);

    try {
      const comment = await createComment(commentRepo(), cardId, user.userId, body);
      return reply.code(201).send(commentViewSchema.parse(comment));
    } catch (err) {
      if (err instanceof CardNotFoundForCommentError) {
        return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
      }
      if (err instanceof CommentsNotAcceptedError) {
        return reply.code(422).send(apiError(request, 'COMMENTS_NOT_ACCEPTED', 'این کارت پذیرای گفت‌وگوی عمومی نیست.'));
      }
      if (err instanceof CommentNotFoundError) {
        return reply.code(404).send(apiError(request, 'PARENT_COMMENT_NOT_FOUND', 'نظری که پاسخ می‌دهید یافت نشد.'));
      }
      if (err instanceof CrossCardReplyError) {
        return reply.code(422).send(apiError(request, 'CROSS_CARD_REPLY', 'پاسخ فقط می‌تواند به نظر همین کارت باشد.'));
      }
      throw err;
    }
  });

  app.patch('/comments/:commentId', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { commentId } = request.params as { commentId: string };
    const body = editCommentBodySchema.parse(request.body);

    try {
      const comment = await editComment(commentRepo(), commentId, user.userId, body);
      return commentViewSchema.parse(comment);
    } catch (err) {
      if (err instanceof CommentNotFoundError) {
        return reply.code(404).send(apiError(request, 'COMMENT_NOT_FOUND', 'این نظر یافت نشد.'));
      }
      if (err instanceof NotCommentEditorError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط نویسندهٔ نظر می‌تواند آن را ویرایش کند.'));
      }
      throw err;
    }
  });

  app.delete('/comments/:commentId', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { commentId } = request.params as { commentId: string };

    try {
      const comment = await deleteComment(commentRepo(), commentId, user.userId, String(request.id));
      return commentViewSchema.parse(comment);
    } catch (err) {
      if (err instanceof CommentNotFoundError) {
        return reply.code(404).send(apiError(request, 'COMMENT_NOT_FOUND', 'این نظر یافت نشد.'));
      }
      if (err instanceof NotCommentModeratorError) {
        return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط نویسنده یا مدیر بستر می‌تواند این نظر را حذف کند.'));
      }
      throw err;
    }
  });

  // --- reactions ------------------------------------------------------

  app.get('/cards/:cardId/reactions', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const user = getOptionalSession(request, opts.sessionHmacKey);

    try {
      const summary = await getReactionSummary(reactionRepo(), cardId, user?.userId ?? null);
      return reactionSummarySchema.parse(summary);
    } catch (err) {
      if (err instanceof CardNotFoundForReactionError) {
        return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
      }
      throw err;
    }
  });

  app.post('/cards/:cardId/reactions', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { cardId } = request.params as { cardId: string };
    const body = toggleReactionBodySchema.parse(request.body);

    try {
      const { summary } = await toggleReaction(reactionRepo(), reactionRateLimiter, cardId, user.userId, body.type);
      return reactionSummarySchema.parse(summary);
    } catch (err) {
      if (err instanceof CardNotFoundForReactionError) {
        return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
      }
      if (err instanceof ReactionsNotAcceptedError) {
        return reply.code(422).send(apiError(request, 'REACTIONS_NOT_ACCEPTED', 'این کارت پذیرای واکنش نیست.'));
      }
      if (err instanceof ReactionRateLimitedError) {
        return reply.code(429).send(apiError(request, 'RATE_LIMITED', 'واکنش‌های شما بیش از حد سریع است؛ کمی صبر کنید.'));
      }
      throw err;
    }
  });

  // --- bookmarks ---------------------------------------------------------
  //
  // Every one of these needs a session, including the read: a bookmark is
  // the caller's own and there is no such thing as somebody else's view of
  // it. Nothing here returns a count, so no route can turn a private "keep
  // this" into a public number.

  app.get('/cards/:cardId/bookmark', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { cardId } = request.params as { cardId: string };

    try {
      return bookmarkStateSchema.parse(await getBookmarkState(bookmarkRepo(), cardId, user.userId));
    } catch (err) {
      return handleBookmarkError(err, request, reply);
    }
  });

  app.post('/cards/:cardId/bookmark', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { cardId } = request.params as { cardId: string };

    try {
      return bookmarkStateSchema.parse(await toggleBookmark(bookmarkRepo(), cardId, user.userId));
    } catch (err) {
      return handleBookmarkError(err, request, reply);
    }
  });

  /** "نشان‌شده‌ها" - the caller's own shelf, in the order they saved things. */
  app.get('/me/bookmarks', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const query = request.query as { cursor?: string };

    try {
      const result = await listBookmarkedCards(bookmarkRepo(), user.userId, {
        limit: LIST_PAGE_SIZE,
        cursor: query.cursor,
      });
      return cardListResponseSchema.parse({
        items: await Promise.all(result.items.map((item) => toCardListItem(item, opts.storageProvider))),
        nextCursor: result.nextCursor,
      });
    } catch (err) {
      return handleBookmarkError(err, request, reply);
    }
  });

  // --- pins -------------------------------------------------------------

  app.post('/cards/:cardId/pin', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { cardId } = request.params as { cardId: string };

    try {
      return pinnedCardListResponseSchema.parse(await pinCard(pinRepo(), cardId, user.userId, String(request.id)));
    } catch (err) {
      return handlePinError(err, request, reply);
    }
  });

  app.delete('/cards/:cardId/pin', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { cardId } = request.params as { cardId: string };

    try {
      return pinnedCardListResponseSchema.parse(await unpinCard(pinRepo(), cardId, user.userId, String(request.id)));
    } catch (err) {
      return handlePinError(err, request, reply);
    }
  });

  app.get('/spaces/:spaceId/pins', async (request) => {
    const { spaceId } = request.params as { spaceId: string };
    return pinnedCardListResponseSchema.parse(await listPins(pinRepo(), spaceId));
  });
}

function handleBookmarkError(err: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (err instanceof CardNotFoundForBookmarkError) {
    return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
  }
  if (err instanceof BookmarksNotAcceptedError) {
    return reply.code(422).send(apiError(request, 'BOOKMARKS_NOT_ACCEPTED', 'این کارت قابل نشان‌کردن نیست.'));
  }
  if (err instanceof InvalidBookmarkCursorError) {
    return reply.code(400).send(apiError(request, 'INVALID_CURSOR', 'نشانگر صفحه‌بندی معتبر نیست.'));
  }
  throw err;
}

function handlePinError(err: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (err instanceof CardNotFoundForPinError) {
    return reply.code(404).send(apiError(request, 'CARD_NOT_FOUND', 'این کارت یافت نشد.'));
  }
  if (err instanceof NotSpacePinnerError) {
    return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط سازنده یا مدیر بستر می‌تواند کارت را سنجاق کند.'));
  }
  if (err instanceof CardNotPinnableError) {
    return reply.code(422).send(apiError(request, 'CARD_NOT_PINNABLE', 'این کارت در وضعیت فعلی قابل سنجاق‌شدن نیست.'));
  }
  if (err instanceof PinLimitReachedError) {
    return reply.code(422).send(apiError(request, 'PIN_LIMIT_REACHED', 'ظرفیت سنجاق‌های این بستر پر شده است.'));
  }
  throw err;
}
