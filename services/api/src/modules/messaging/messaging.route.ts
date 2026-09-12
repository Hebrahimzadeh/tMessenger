import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  conversationListResponseSchema,
  conversationViewSchema,
  createDirectConversationBodySchema,
  editMessageBodySchema,
  markReadBodySchema,
  messageListResponseSchema,
  messageViewSchema,
  readReceiptViewSchema,
  sendMessageBodySchema,
} from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { requireSession } from '../auth/session-guard';
import { createPrismaMessagingRepository } from './messaging.repository';
import {
  ConversationNotFoundError,
  createDirectConversation,
  deleteMessage,
  editMessage,
  getOrCreateAssistantConversation,
  InvalidMessageCursorError,
  listConversations,
  listMessages,
  markRead,
  MessageNotFoundError,
  NotMessageAuthorError,
  ReceiptMessageMismatchError,
  SelfConversationError,
  sendMessage,
  UnknownCounterpartError,
  type MessagingRepository,
} from './messaging.service';

const CONVERSATION_PAGE_SIZE = 20;
const MESSAGE_PAGE_SIZE = 50;

export interface MessagingRouteOptions {
  sessionHmacKey: string;
  messagingRepository?: MessagingRepository;
}

export async function messagingRoutes(app: FastifyInstance, opts: MessagingRouteOptions) {
  function repo(): MessagingRepository {
    return opts.messagingRepository ?? createPrismaMessagingRepository(app.db);
  }

  app.get('/conversations', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const query = request.query as { cursor?: string };

    try {
      const result = await listConversations(repo(), user.userId, {
        limit: CONVERSATION_PAGE_SIZE,
        cursor: query.cursor,
      });
      return conversationListResponseSchema.parse(result);
    } catch (err) {
      return handleMessagingError(err, request, reply);
    }
  });

  app.post('/conversations', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = createDirectConversationBodySchema.parse(request.body);

    try {
      // Idempotent by construction (Task 16's pair key), so a retried or
      // double-tapped request returns the same conversation rather than a
      // second one. 200, not 201, for that reason: the caller cannot tell
      // which request created it, and does not need to.
      const conversation = await createDirectConversation(repo(), user.userId, body.withUserId);
      return conversationViewSchema.parse(conversation);
    } catch (err) {
      return handleMessagingError(err, request, reply);
    }
  });

  /**
   * The caller's own helper thread. Created on first call and returned
   * unchanged after that, so the client never needs to know whether it
   * already existed. There is no route that opens someone else's.
   */
  app.get('/conversations/assistant', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;

    try {
      return conversationViewSchema.parse(await getOrCreateAssistantConversation(repo(), user.userId));
    } catch (err) {
      return handleMessagingError(err, request, reply);
    }
  });

  app.get('/conversations/:conversationId/messages', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { conversationId } = request.params as { conversationId: string };
    const query = request.query as { cursor?: string };

    try {
      const result = await listMessages(repo(), conversationId, user.userId, {
        limit: MESSAGE_PAGE_SIZE,
        cursor: query.cursor,
      });
      return messageListResponseSchema.parse(result);
    } catch (err) {
      return handleMessagingError(err, request, reply);
    }
  });

  app.post('/conversations/:conversationId/messages', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { conversationId } = request.params as { conversationId: string };
    const body = sendMessageBodySchema.parse(request.body);

    try {
      // The sender is the session's user and there is no parameter for
      // anything else, so no request can post as another person or as the
      // assistant.
      const message = await sendMessage(repo(), conversationId, user.userId, body);
      return reply.code(201).send(messageViewSchema.parse(message));
    } catch (err) {
      return handleMessagingError(err, request, reply);
    }
  });

  app.patch('/messages/:messageId', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { messageId } = request.params as { messageId: string };
    const body = editMessageBodySchema.parse(request.body);

    try {
      return messageViewSchema.parse(await editMessage(repo(), messageId, user.userId, body));
    } catch (err) {
      return handleMessagingError(err, request, reply);
    }
  });

  app.delete('/messages/:messageId', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { messageId } = request.params as { messageId: string };

    try {
      return messageViewSchema.parse(await deleteMessage(repo(), messageId, user.userId, String(request.id)));
    } catch (err) {
      return handleMessagingError(err, request, reply);
    }
  });

  app.post('/conversations/:conversationId/read', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const { conversationId } = request.params as { conversationId: string };
    const body = markReadBodySchema.parse(request.body);

    try {
      const receipt = await markRead(repo(), conversationId, user.userId, body.lastReadMessageId);
      return readReceiptViewSchema.parse({
        conversationId: receipt.conversationId,
        userId: receipt.userId,
        lastReadMessageId: receipt.lastReadMessageId,
        lastReadAt: receipt.lastReadAt.toISOString(),
      });
    } catch (err) {
      return handleMessagingError(err, request, reply);
    }
  });
}

function handleMessagingError(err: unknown, request: FastifyRequest, reply: FastifyReply) {
  // A non-member gets exactly what someone asking after a conversation that
  // never existed gets. Anything else would confirm that two particular
  // people are talking.
  if (err instanceof ConversationNotFoundError) {
    return reply.code(404).send(apiError(request, 'CONVERSATION_NOT_FOUND', 'این گفت‌وگو یافت نشد.'));
  }
  if (err instanceof MessageNotFoundError) {
    return reply.code(404).send(apiError(request, 'MESSAGE_NOT_FOUND', 'این پیام یافت نشد.'));
  }
  if (err instanceof NotMessageAuthorError) {
    return reply.code(403).send(apiError(request, 'FORBIDDEN', 'فقط نویسندهٔ پیام می‌تواند آن را ویرایش یا حذف کند.'));
  }
  if (err instanceof SelfConversationError) {
    return reply.code(422).send(apiError(request, 'SELF_CONVERSATION', 'گفت‌وگوی خصوصی با خودتان ممکن نیست.'));
  }
  if (err instanceof UnknownCounterpartError) {
    return reply.code(404).send(apiError(request, 'USER_NOT_FOUND', 'این کاربر یافت نشد.'));
  }
  if (err instanceof ReceiptMessageMismatchError) {
    return reply.code(422).send(apiError(request, 'RECEIPT_MESSAGE_MISMATCH', 'این پیام متعلق به این گفت‌وگو نیست.'));
  }
  if (err instanceof InvalidMessageCursorError) {
    return reply.code(400).send(apiError(request, 'INVALID_CURSOR', 'نشانگر صفحه‌بندی معتبر نیست.'));
  }
  throw err;
}
