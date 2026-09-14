import { z } from 'zod';

export const notificationTypeSchema = z.enum([
  'NEW_PUBLIC_REPLY',
  'RESERVATION_CHANGED',
  'NEW_PRIVATE_MESSAGE',
  'MODERATION_UPDATE',
  'SPACE_GUIDANCE',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** MVP ships one channel, deliberately - see the schema's own note. */
export const notificationChannelSchema = z.enum(['IN_APP']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** The preview ceiling, shared so the client and the server cannot disagree about it. */
export const PREVIEW_MAX_CHARS = 80;

export const notificationViewSchema = z.object({
  id: z.string().uuid(),
  type: notificationTypeSchema,
  subjectType: z.string(),
  subjectId: z.string().uuid(),
  /** Where pressing it goes. A path, never content. */
  deepLink: z.string(),
  /**
   * Resolved from the subject at request time, never stored, and at most
   * PREVIEW_MAX_CHARS. Null whenever the type has no preview or the
   * recipient has previews switched off.
   */
  preview: z.string().max(PREVIEW_MAX_CHARS + 1).nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type NotificationView = z.infer<typeof notificationViewSchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationViewSchema),
  nextCursor: z.string().nullable(),
  /** The badge's number: unread across everything, not just this page. */
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const markNotificationsReadBodySchema = z
  .object({
    /** Specific notifications, or everything when `all` is true. */
    ids: z.array(z.string().uuid()).min(1).max(200).optional(),
    all: z.literal(true).optional(),
  })
  .refine((v) => Boolean(v.ids) !== Boolean(v.all), {
    message: 'Give either ids or all, not both and not neither.',
  });
export type MarkNotificationsReadBody = z.infer<typeof markNotificationsReadBodySchema>;

export const notificationPreferencesSchema = z.object({
  /** When false, a private-message notification still arrives but carries no excerpt. */
  privateMessagePreview: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const updateNotificationPreferencesBodySchema = notificationPreferencesSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'At least one preference must be given.' }
);
export type UpdateNotificationPreferencesBody = z.infer<typeof updateNotificationPreferencesBodySchema>;
