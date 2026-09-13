import { z } from 'zod';

/** Latin lowercase/digit/underscore, 3-30 chars (Task 08: "لاتین کوچک/عدد/underscore با طول ۳ تا ۳۰"). Always normalized to lowercase before validation/storage - see profile.service.ts. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export const usernameSchema = z
  .string()
  .regex(USERNAME_PATTERN, 'نام کاربری باید فقط شامل حروف کوچک لاتین، عدد و زیرخط باشد و طول آن بین ۳ تا ۳۰ نویسه باشد.');

export const displayNameSchema = z.string().trim().min(1, 'نام نمایشی نمی‌تواند خالی باشد.').max(50);

export const bioSchema = z.string().max(320, 'بیوگرافی نمی‌تواند بیش از ۳۲۰ نویسه باشد.');

export const phoneVisibilitySchema = z.enum(['PRIVATE', 'PUBLIC']);
export type PhoneVisibility = z.infer<typeof phoneVisibilitySchema>;

/**
 * PATCH /v1/me/profile body - an explicit allow-list of exactly these four
 * fields (Task 08 acceptance: "mass assignment ممنوع"). Zod strips unknown
 * keys by default, so a client sending e.g. `avatarObjectKey` or `userId`
 * has those silently dropped before the request body is ever looked at
 * again - not just documented as forbidden, structurally impossible to pass
 * through.
 */
export const updateMyProfileBodySchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    bio: bioSchema,
    phoneVisibility: phoneVisibilitySchema,
  })
  .partial();
export type UpdateMyProfileBody = z.infer<typeof updateMyProfileBodySchema>;

export const myProfileResponseSchema = z.object({
  userId: z.string().uuid(),
  hasProfile: z.boolean(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  phoneVisibility: phoneVisibilitySchema,
});
export type MyProfileResponse = z.infer<typeof myProfileResponseSchema>;

/** GET /v1/users/:username - public. `phoneE164` is present only when phoneVisibility is PUBLIC; phoneHash/any official-identity-claim state is never part of this shape. */
export const publicProfileResponseSchema = z.object({
  /**
   * Needed to open a private conversation from a profile (Task 21). An
   * opaque id, already visible wherever people appear together - a
   * conversation's members, a card's author - and it discloses nothing on
   * its own. The phone number below stays governed by its owner's own
   * visibility setting, unchanged.
   */
  userId: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  phoneE164: z.string().nullable(),
});
export type PublicProfileResponse = z.infer<typeof publicProfileResponseSchema>;
