import type { MyProfileResponse, PhoneVisibility, PublicProfileResponse, UpdateMyProfileBody } from '@taavon/contracts';
import { decryptPhone } from '../auth/phone-crypto';

/**
 * Usernames reserved for official/system use - never claimable by a
 * regular signup, so nobody can register as e.g. "admin" or "support" and
 * pass themselves off as platform staff. Not exhaustive; extend as needed.
 */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'superadmin',
  'support',
  'help',
  'moderator',
  'system',
  'official',
  'taavon',
  'taavonafarini',
  'api',
  'security',
  'staff',
  'team',
  'about',
  'contact',
  'terms',
  'privacy',
  'login',
  'logout',
  'signup',
  'settings',
  'null',
  'undefined',
  'me',
]);

export class UsernameReservedError extends Error {
  constructor(public readonly username: string) {
    super(`Username "${username}" is reserved.`);
    this.name = 'UsernameReservedError';
  }
}

export class UsernameTakenError extends Error {
  constructor(public readonly username: string) {
    super(`Username "${username}" is already taken.`);
    this.name = 'UsernameTakenError';
  }
}

export class ProfileIncompleteError extends Error {
  constructor() {
    super('A username and display name are both required to create a profile.');
    this.name = 'ProfileIncompleteError';
  }
}

export interface ProfileRecord {
  userId: string;
  username: string;
  displayName: string;
  bio: string | null;
  phoneVisibility: PhoneVisibility;
}

export interface ProfileRepository {
  findByUserId(userId: string): Promise<ProfileRecord | null>;
  /** `usernameLower` is already normalized - compare with a plain equality check, not a case-insensitive one. */
  isUsernameTaken(usernameLower: string, excludingUserId: string): Promise<boolean>;
  save(record: ProfileRecord): Promise<ProfileRecord>;
}

export async function getMyProfile(repo: ProfileRepository, userId: string): Promise<MyProfileResponse> {
  const profile = await repo.findByUserId(userId);
  if (!profile) {
    return { userId, hasProfile: false, username: null, displayName: null, bio: null, phoneVisibility: 'PRIVATE' };
  }
  return {
    userId,
    hasProfile: true,
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    phoneVisibility: profile.phoneVisibility,
  };
}

/**
 * Upserts the caller's own profile from an already-schema-validated partial
 * body (packages/contracts/src/profile.ts's updateMyProfileBodySchema is
 * the allow-list - only these four fields ever reach here). Missing fields
 * fall back to the existing profile's current value; on a genuinely new
 * profile (no existing row), username and displayName are both required -
 * there is nothing to fall back to, and the database column isn't
 * nullable.
 */
export async function updateMyProfile(
  repo: ProfileRepository,
  userId: string,
  input: UpdateMyProfileBody
): Promise<MyProfileResponse> {
  const existing = await repo.findByUserId(userId);

  const username = input.username !== undefined ? input.username.toLowerCase() : existing?.username;
  const displayName = input.displayName !== undefined ? input.displayName : existing?.displayName;
  const bio = input.bio !== undefined ? input.bio : (existing?.bio ?? null);
  const phoneVisibility = input.phoneVisibility !== undefined ? input.phoneVisibility : (existing?.phoneVisibility ?? 'PRIVATE');

  if (!username || !displayName) {
    throw new ProfileIncompleteError();
  }

  if (RESERVED_USERNAMES.has(username)) {
    throw new UsernameReservedError(username);
  }

  if (username !== existing?.username) {
    const taken = await repo.isUsernameTaken(username, userId);
    if (taken) throw new UsernameTakenError(username);
  }

  const saved = await repo.save({ userId, username, displayName, bio, phoneVisibility });

  return {
    userId,
    hasProfile: true,
    username: saved.username,
    displayName: saved.displayName,
    bio: saved.bio,
    phoneVisibility: saved.phoneVisibility,
  };
}

export interface PublicProfileRecord {
  username: string;
  displayName: string;
  bio: string | null;
  phoneVisibility: PhoneVisibility;
  /** null if the user somehow has no verified phone identity - defensive, should not normally happen post-Task-06. */
  phoneCiphertext: string | null;
}

export interface PublicProfileRepository {
  findPublicByUsername(usernameLower: string): Promise<PublicProfileRecord | null>;
}

/**
 * Public, unauthenticated profile lookup. The returned shape is an
 * explicit, hand-built object literal - never a spread of the repository
 * record - so a phoneHash, correlationId, or any future
 * official-identity-claim field added to ProfileRecord later can never
 * leak here just by being present on the underlying row.
 */
export async function getPublicProfile(
  repo: PublicProfileRepository,
  phoneEncryptionKey: string,
  usernameLower: string
): Promise<PublicProfileResponse | null> {
  const record = await repo.findPublicByUsername(usernameLower);
  if (!record) return null;

  const phoneE164 =
    record.phoneVisibility === 'PUBLIC' && record.phoneCiphertext
      ? decryptPhone(record.phoneCiphertext, phoneEncryptionKey)
      : null;

  return {
    username: record.username,
    displayName: record.displayName,
    bio: record.bio,
    phoneE164,
  };
}
