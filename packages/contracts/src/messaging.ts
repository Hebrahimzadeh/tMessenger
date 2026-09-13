import { z } from 'zod';

/** "message ۱ تا ۸۰۰۰ نویسه". */
export const MESSAGE_BODY_MIN = 1;
export const MESSAGE_BODY_MAX = 8000;

export const messageBodySchema = z.string().trim().min(MESSAGE_BODY_MIN).max(MESSAGE_BODY_MAX);

export const conversationKindSchema = z.enum(['DIRECT', 'SYSTEM_ASSISTANT']);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

export const messageSenderKindSchema = z.enum(['USER', 'SYSTEM_ASSISTANT']);
export type MessageSenderKind = z.infer<typeof messageSenderKindSchema>;

export const messageStatusSchema = z.enum(['VISIBLE', 'DELETED']);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

/**
 * A conversation member as anyone on the other side of the wire may see
 * them: an id and nothing more.
 *
 * This shape is the contract-level half of "serialization هرگز phone،
 * identity claim یا member خصوصی را ضمیمه نکند". There is no field here for
 * a phone number, an identity claim, a display name or an avatar, so a
 * serializer cannot leak one by accident - it would have to change this
 * schema first, which is a reviewable act rather than an oversight. A
 * client that wants to show a name fetches the public profile by id through
 * the profile endpoints, which apply that person's own privacy settings.
 */
export const conversationMemberViewSchema = z.object({
  userId: z.string().uuid(),
});
export type ConversationMemberView = z.infer<typeof conversationMemberViewSchema>;

export const conversationViewSchema = z.object({
  id: z.string().uuid(),
  kind: conversationKindSchema,
  /** Everyone in the thread. For SYSTEM_ASSISTANT this is the one owner; the assistant itself is not a member and has no id. */
  members: z.array(conversationMemberViewSchema),
  createdAt: z.string().datetime(),
  /** Null until someone sends something. Only ever a timestamp - never a preview of the text. */
  lastMessageAt: z.string().datetime().nullable(),
  /** Messages the caller has not read yet. Counted for the caller alone; it never reveals the other side's reading. */
  unreadCount: z.number().int().nonnegative(),
  /** The caller's own preferences. One person muting a thread never affects the other side. */
  muted: z.boolean(),
  hidden: z.boolean(),
});
export type ConversationView = z.infer<typeof conversationViewSchema>;

export const conversationListResponseSchema = z.object({
  items: z.array(conversationViewSchema),
  nextCursor: z.string().nullable(),
});
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;

export const proposalStateSchema = z.enum(['NONE', 'PENDING', 'CONFIRMED', 'REJECTED']);
export type ProposalState = z.infer<typeof proposalStateSchema>;

/**
 * A suggestion from the assistant, shown to the person as a preview they can
 * edit, confirm or reject. It is data describing something that has *not*
 * happened: nothing anywhere treats a proposal as authority to act, and the
 * only transition out of PENDING comes from the person it was shown to.
 */
export const assistantProposalSchema = z.object({
  kind: z.literal('CARD_DRAFT'),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  /** Where it would go if confirmed. Shown in the preview so the person can see the destination before deciding. */
  spaceId: z.string().uuid().nullable(),
});
export type AssistantProposal = z.infer<typeof assistantProposalSchema>;

export const proposalDecisionBodySchema = z.object({
  decision: z.enum(['CONFIRM', 'REJECT']),
});
export type ProposalDecisionBody = z.infer<typeof proposalDecisionBodySchema>;

export const conversationPreferencesBodySchema = z
  .object({
    muted: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .refine((v) => v.muted !== undefined || v.hidden !== undefined, {
    message: 'At least one preference must be given.',
  });
export type ConversationPreferencesBody = z.infer<typeof conversationPreferencesBodySchema>;

export const messageViewSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  /** Null only for an assistant message - there is no user behind the assistant. */
  senderId: z.string().uuid().nullable(),
  senderKind: messageSenderKindSchema,
  status: messageStatusSchema,
  /** Null once soft-deleted: the text leaves the view while its revisions stay for the M6 report path. */
  body: z.string().nullable(),
  revisionCount: z.number().int().nonnegative(),
  edited: z.boolean(),
  /** Echoed back so a sender can match this against the message it drew optimistically. Null for a message sent over REST. */
  clientMessageId: z.string().nullable(),
  /** Set only on an assistant message that is suggesting something. Null on every message from a person. */
  proposedAction: assistantProposalSchema.nullable(),
  proposalState: proposalStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MessageView = z.infer<typeof messageViewSchema>;

export const messageListResponseSchema = z.object({
  items: z.array(messageViewSchema),
  nextCursor: z.string().nullable(),
});
export type MessageListResponse = z.infer<typeof messageListResponseSchema>;

export const sendMessageBodySchema = z.object({
  body: messageBodySchema,
});
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

export const editMessageBodySchema = z.object({
  body: messageBodySchema,
});
export type EditMessageBody = z.infer<typeof editMessageBodySchema>;

/**
 * Opening a direct conversation names the other person and nobody else.
 * The caller is always themselves, taken from their session rather than the
 * body, so this cannot be used to create a conversation between two other
 * people.
 */
export const createDirectConversationBodySchema = z.object({
  withUserId: z.string().uuid(),
});
export type CreateDirectConversationBody = z.infer<typeof createDirectConversationBodySchema>;

export const markReadBodySchema = z.object({
  /** The newest message the caller has seen. Must belong to the conversation being marked. */
  lastReadMessageId: z.string().uuid(),
});
export type MarkReadBody = z.infer<typeof markReadBodySchema>;

export const readReceiptViewSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  lastReadMessageId: z.string().uuid().nullable(),
  lastReadAt: z.string().datetime(),
});
export type ReadReceiptView = z.infer<typeof readReceiptViewSchema>;

/** Bounds the client-generated id so it cannot be used as a smuggled payload. */
export const clientMessageIdSchema = z.string().trim().min(1).max(64);

/**
 * `message:send` over the socket. `clientMessageId` is what makes a resend
 * after a dropped connection safe: the server stores it and returns the
 * original message rather than writing a second one.
 */
export const socketSendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: messageBodySchema,
  clientMessageId: clientMessageIdSchema,
});
export type SocketSendMessage = z.infer<typeof socketSendMessageSchema>;

export const socketJoinSchema = z.object({
  conversationId: z.string().uuid(),
});
export type SocketJoin = z.infer<typeof socketJoinSchema>;

export const socketReceiptReadSchema = z.object({
  conversationId: z.string().uuid(),
  lastReadMessageId: z.string().uuid(),
});
export type SocketReceiptRead = z.infer<typeof socketReceiptReadSchema>;

export const socketTypingSchema = z.object({
  conversationId: z.string().uuid(),
});
export type SocketTyping = z.infer<typeof socketTypingSchema>;

/** What a peer sees when someone is typing. Carries no text, and is never stored. */
export const typingNoticeSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  typing: z.boolean(),
});
export type TypingNotice = z.infer<typeof typingNoticeSchema>;

/** The socket event names, in one place so server and client cannot drift apart. */
export const REALTIME_EVENTS = {
  join: 'conversation:join',
  messageSend: 'message:send',
  messageCreated: 'message:created',
  receiptRead: 'receipt:read',
  typingStart: 'typing:start',
  typingStop: 'typing:stop',
  typing: 'typing',
  error: 'realtime:error',
} as const;
