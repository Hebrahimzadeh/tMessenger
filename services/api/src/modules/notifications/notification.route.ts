import type { FastifyInstance } from 'fastify';
import {
  markNotificationsReadBodySchema,
  notificationListResponseSchema,
  notificationPreferencesSchema,
  updateNotificationPreferencesBodySchema,
} from '@taavon/contracts';
import { apiError } from '../../lib/api-error';
import { requireSession } from '../auth/session-guard';
import { createPrismaNotificationRepository } from './notification.repository';
import {
  getNotificationPreferences,
  InvalidNotificationCursorError,
  listNotifications,
  markNotificationsRead,
  updateNotificationPreferences,
  type NotificationRepository,
} from './notification.service';

const PAGE_SIZE = 20;

export interface NotificationRouteOptions {
  sessionHmacKey: string;
  notificationRepository?: NotificationRepository;
}

export async function notificationRoutes(app: FastifyInstance, opts: NotificationRouteOptions) {
  function repo(): NotificationRepository {
    return opts.notificationRepository ?? createPrismaNotificationRepository(app.db);
  }

  /**
   * The caller's own notifications, newest first. There is deliberately no
   * route that takes a recipient id: the only person whose notifications this
   * can return is whoever holds the session.
   */
  app.get('/me/notifications', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const query = request.query as { cursor?: string };

    try {
      const result = await listNotifications(repo(), user.userId, { limit: PAGE_SIZE, cursor: query.cursor });
      return notificationListResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof InvalidNotificationCursorError) {
        return reply.code(400).send(apiError(request, 'INVALID_CURSOR', 'نشانگر صفحه‌بندی معتبر نیست.'));
      }
      throw err;
    }
  });

  app.post('/me/notifications/read', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = markNotificationsReadBodySchema.parse(request.body);

    const result = await markNotificationsRead(repo(), user.userId, body);
    return { updated: result.updated, unreadCount: result.unreadCount };
  });

  app.get('/me/notification-preferences', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    return notificationPreferencesSchema.parse(await getNotificationPreferences(repo(), user.userId));
  });

  app.patch('/me/notification-preferences', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;
    const body = updateNotificationPreferencesBodySchema.parse(request.body);
    return notificationPreferencesSchema.parse(await updateNotificationPreferences(repo(), user.userId, body));
  });
}
