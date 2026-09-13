import type { PrismaClient } from '@taavon/database';
import type { ProfileRecord, ProfileRepository, PublicProfileRecord, PublicProfileRepository } from './profile.service';

export function createPrismaProfileRepository(prisma: PrismaClient): ProfileRepository {
  return {
    async findByUserId(userId) {
      const profile = await prisma.userProfile.findUnique({
        where: { userId },
        select: { username: true, displayName: true, bio: true, phoneVisibility: true },
      });
      return profile ? { userId, ...profile } : null;
    },

    async isUsernameTaken(usernameLower, excludingUserId) {
      // Usernames are always stored lowercase (see profile.service.ts), so
      // a plain equality match is correct and can use a regular index -
      // no need for Prisma's `mode: 'insensitive'` (a separate ILIKE-style
      // query) here.
      const existing = await prisma.userProfile.findFirst({
        where: { username: usernameLower, userId: { not: excludingUserId } },
        select: { userId: true },
      });
      return existing !== null;
    },

    async save(record: ProfileRecord) {
      await prisma.userProfile.upsert({
        where: { userId: record.userId },
        create: {
          userId: record.userId,
          username: record.username,
          displayName: record.displayName,
          bio: record.bio,
          phoneVisibility: record.phoneVisibility,
        },
        update: {
          username: record.username,
          displayName: record.displayName,
          bio: record.bio,
          phoneVisibility: record.phoneVisibility,
        },
      });
      return record;
    },
  };
}

export function createPrismaPublicProfileRepository(prisma: PrismaClient): PublicProfileRepository {
  return {
    async findPublicByUsername(usernameLower): Promise<PublicProfileRecord | null> {
      const profile = await prisma.userProfile.findFirst({
        where: { username: usernameLower },
        select: {
          userId: true,
          username: true,
          displayName: true,
          bio: true,
          phoneVisibility: true,
          user: { select: { phoneIdentity: { select: { phoneCiphertext: true } } } },
        },
      });
      if (!profile) return null;

      return {
        userId: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        phoneVisibility: profile.phoneVisibility,
        phoneCiphertext: profile.user.phoneIdentity?.phoneCiphertext ?? null,
      };
    },
  };
}
