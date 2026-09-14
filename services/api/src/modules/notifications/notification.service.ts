import { toPreview } from '@taavon/notifications';
import type { NotificationType } from '@taavon/contracts';

export class InvalidNotificationCursorError extends Error {
  constructor() {
    super('Invalid pagination cursor.');
    this.name = 'InvalidNotificationCursorError';
  }
}

export interface NotificationRecord {
  id: string;
  recipientId: string;
  type: NotificationType;
  subjectType: string;
  subjectId: string;
  deepLink: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPreferencesRecord {
  privateMessagePreview: boolean;
}

export interface NotificationRepository {
  listForRecipient(
    recipientId: string,
    params: { limit: number; before: { createdAt: string; id: string } | null }
  ): Promise<NotificationRecord[]>;
  countUnread(recipientId: string): Promise<number>;
  /** Marks only rows that belong to this recipient. Returns how many changed. */
  markRead(recipientId: string, ids: string[] | 'all'): Promise<number>;
  getPreferences(recipientId: string): Promise<NotificationPreferencesRecord>;
  setPreferences(recipientId: string, prefs: Partial<NotificationPreferencesRecord>): Promise<NotificationPreferencesRecord>;
  /**
   * The current text of the messages behind these notifications, for the
   * recipient. Reads from messaging storage at request time - nothing is ever
   * copied into a notification row.
   */
  resolveMessagePreviews(recipientId: string, messageIds: string[]): Promise<Map<string, string>>;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  subjectType: string;
  subjectId: string;
  deepLink: string;
  preview: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  items: NotificationView[];
  nextCursor: string | null;
  unreadCount: number;
}

/**
 * One page of the recipient's own notifications.
 *
 * Every read is scoped to `recipientId` at the repository, so there is no
 * route through this function to anyone else's notifications - a caller
 * cannot ask for another person's by id, because ids are never the input.
 *
 * Previews are resolved here rather than stored. For a private message that
 * means reading the message itself, for this recipient, at this moment: the
 * text stays in messaging storage, a deleted message stops having a preview
 * the instant it is deleted, and someone with previews switched off simply
 * never triggers the lookup.
 */
export async function listNotifications(
  repo: NotificationRepository,
  recipientId: string,
  params: { limit: number; cursor?: string }
): Promise<NotificationListResult> {
  const before = params.cursor ? decodeCursor(params.cursor) : null;
  const rows = await repo.listForRecipient(recipientId, { limit: params.limit + 1, before });
  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);

  const prefs = await repo.getPreferences(recipientId);
  const messageIds = prefs.privateMessagePreview
    ? page.filter((r) => r.type === 'NEW_PRIVATE_MESSAGE').map((r) => r.subjectId)
    : [];
  const previews = messageIds.length > 0 ? await repo.resolveMessagePreviews(recipientId, messageIds) : new Map();

  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      type: row.type,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      deepLink: row.deepLink,
      preview: previewFor(row, previews),
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    unreadCount: await repo.countUnread(recipientId),
  };
}

function previewFor(row: NotificationRecord, previews: Map<string, string>): string | null {
  if (row.type !== 'NEW_PRIVATE_MESSAGE') return null;
  const text = previews.get(row.subjectId);
  return text ? toPreview(text) : null;
}

export async function markNotificationsRead(
  repo: NotificationRepository,
  recipientId: string,
  target: { ids?: string[]; all?: true }
): Promise<{ updated: number; unreadCount: number }> {
  // Scoped to the recipient inside the repository, so naming someone else's
  // notification id changes nothing and reveals nothing.
  const updated = await repo.markRead(recipientId, target.all ? 'all' : (target.ids ?? []));
  return { updated, unreadCount: await repo.countUnread(recipientId) };
}

export async function getNotificationPreferences(
  repo: NotificationRepository,
  recipientId: string
): Promise<NotificationPreferencesRecord> {
  return repo.getPreferences(recipientId);
}

export async function updateNotificationPreferences(
  repo: NotificationRepository,
  recipientId: string,
  prefs: Partial<NotificationPreferencesRecord>
): Promise<NotificationPreferencesRecord> {
  return repo.setPreferences(recipientId, prefs);
}

function encodeCursor(value: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
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
    throw new InvalidNotificationCursorError();
  }
}
