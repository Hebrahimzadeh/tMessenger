import type { FastifyInstance } from 'fastify';
import { myProfileResponseSchema, publicProfileResponseSchema, updateMyProfileBodySchema } from '@taavon/contracts';
import { requireSession } from '../auth/session-guard';
import { apiError } from '../../lib/api-error';
import { createPrismaProfileRepository, createPrismaPublicProfileRepository } from './profile.repository';
import {
  getMyProfile,
  getPublicProfile,
  ProfileIncompleteError,
  updateMyProfile,
  UsernameReservedError,
  UsernameTakenError,
  type ProfileRepository,
  type PublicProfileRepository,
} from './profile.service';

export interface ProfileRouteOptions {
  sessionHmacKey: string;
  phoneEncryptionKey: string;
  /** Test seams - default to the real Prisma-backed repositories via app.db. */
  profileRepository?: ProfileRepository;
  publicProfileRepository?: PublicProfileRepository;
}

export async function profileRoutes(app: FastifyInstance, opts: ProfileRouteOptions) {
  // Resolved per-request, not at plugin-registration time - same reason as
  // legal-document.route.ts's Task 05 fix: app.db isn't decorated yet when
  // this plugin registers.
  function profileRepo(): ProfileRepository {
    return opts.profileRepository ?? createPrismaProfileRepository(app.db);
  }
  function publicProfileRepo(): PublicProfileRepository {
    return opts.publicProfileRepository ?? createPrismaPublicProfileRepository(app.db);
  }

  app.get('/me', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;

    const result = await getMyProfile(profileRepo(), user.userId);
    return myProfileResponseSchema.parse(result);
  });

  app.patch('/me/profile', async (request, reply) => {
    const user = requireSession(request, reply, opts.sessionHmacKey);
    if (!user) return;

    const body = updateMyProfileBodySchema.parse(request.body);

    try {
      const result = await updateMyProfile(profileRepo(), user.userId, body);
      return myProfileResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof ProfileIncompleteError) {
        return reply
          .code(422)
          .send(apiError(request, 'PROFILE_INCOMPLETE', 'برای ساخت پروفایل، نام کاربری و نام نمایشی هر دو لازم است.'));
      }
      if (err instanceof UsernameReservedError) {
        return reply.code(422).send(apiError(request, 'USERNAME_RESERVED', 'این نام کاربری قابل استفاده نیست.'));
      }
      if (err instanceof UsernameTakenError) {
        return reply.code(409).send(apiError(request, 'USERNAME_TAKEN', 'این نام کاربری قبلاً گرفته شده است.'));
      }
      throw err;
    }
  });

  // Public - no requireSession call. Matches the MVP endpoint table's own
  // authorization column ("user/public profile" for GET/PATCH /me vs
  // GET /users/:username).
  app.get<{ Params: { username: string } }>('/users/:username', async (request, reply) => {
    const usernameLower = request.params.username.toLowerCase();
    const result = await getPublicProfile(publicProfileRepo(), opts.phoneEncryptionKey, usernameLower);

    if (!result) {
      return reply.code(404).send(apiError(request, 'PROFILE_NOT_FOUND', 'پروفایل یافت نشد.'));
    }

    return publicProfileResponseSchema.parse(result);
  });
}
