import { describe, expect, it } from 'vitest';
import { encryptPhone } from '../auth/phone-crypto';
import {
  getMyProfile,
  getPublicProfile,
  ProfileIncompleteError,
  UsernameReservedError,
  UsernameTakenError,
  updateMyProfile,
  type ProfileRecord,
  type ProfileRepository,
  type PublicProfileRecord,
  type PublicProfileRepository,
} from './profile.service';

const PHONE_ENCRYPTION_KEY = 'test-only-phone-encryption-key';

function fakeProfileRepo(seed: ProfileRecord[] = []): ProfileRepository & { records: Map<string, ProfileRecord> } {
  const records = new Map(seed.map((r) => [r.userId, r]));
  return {
    records,
    async findByUserId(userId) {
      return records.get(userId) ?? null;
    },
    async isUsernameTaken(usernameLower, excludingUserId) {
      for (const record of records.values()) {
        if (record.username === usernameLower && record.userId !== excludingUserId) return true;
      }
      return false;
    },
    async save(record) {
      records.set(record.userId, record);
      return record;
    },
  };
}

describe('getMyProfile', () => {
  it('reports hasProfile: false with all-null fields when no profile exists yet', async () => {
    const repo = fakeProfileRepo();
    const result = await getMyProfile(repo, 'user-1');
    expect(result).toEqual({
      userId: 'user-1',
      hasProfile: false,
      username: null,
      displayName: null,
      bio: null,
      phoneVisibility: 'PRIVATE',
    });
  });

  it('returns the existing profile fields when one exists', async () => {
    const repo = fakeProfileRepo([
      { userId: 'user-1', username: 'ali_2000', displayName: 'علی', bio: 'سلام', phoneVisibility: 'PUBLIC' },
    ]);
    const result = await getMyProfile(repo, 'user-1');
    expect(result).toEqual({
      userId: 'user-1',
      hasProfile: true,
      username: 'ali_2000',
      displayName: 'علی',
      bio: 'سلام',
      phoneVisibility: 'PUBLIC',
    });
  });
});

describe('updateMyProfile', () => {
  it('creates a new profile when both username and displayName are provided', async () => {
    const repo = fakeProfileRepo();
    const result = await updateMyProfile(repo, 'user-1', { username: 'ali_2000', displayName: 'علی' });
    expect(result).toMatchObject({ hasProfile: true, username: 'ali_2000', displayName: 'علی', phoneVisibility: 'PRIVATE' });
  });

  it('normalizes the username to lowercase before storing', async () => {
    const repo = fakeProfileRepo();
    await updateMyProfile(repo, 'user-1', { username: 'Ali_2000', displayName: 'علی' });
    expect(repo.records.get('user-1')?.username).toBe('ali_2000');
  });

  it('throws ProfileIncompleteError when creating for the first time without a username', async () => {
    const repo = fakeProfileRepo();
    await expect(updateMyProfile(repo, 'user-1', { displayName: 'علی' })).rejects.toThrow(ProfileIncompleteError);
  });

  it('throws ProfileIncompleteError when creating for the first time without a displayName', async () => {
    const repo = fakeProfileRepo();
    await expect(updateMyProfile(repo, 'user-1', { username: 'ali_2000' })).rejects.toThrow(ProfileIncompleteError);
  });

  it('allows a partial update (bio only) once a profile already exists', async () => {
    const repo = fakeProfileRepo([
      { userId: 'user-1', username: 'ali_2000', displayName: 'علی', bio: null, phoneVisibility: 'PRIVATE' },
    ]);
    const result = await updateMyProfile(repo, 'user-1', { bio: 'بیوگرافی جدید' });
    expect(result).toMatchObject({ username: 'ali_2000', displayName: 'علی', bio: 'بیوگرافی جدید' });
  });

  it('rejects a reserved username', async () => {
    const repo = fakeProfileRepo();
    await expect(updateMyProfile(repo, 'user-1', { username: 'admin', displayName: 'علی' })).rejects.toThrow(
      UsernameReservedError
    );
  });

  it('rejects a username already taken by a different user', async () => {
    const repo = fakeProfileRepo([
      { userId: 'user-2', username: 'ali_2000', displayName: 'علی دو', bio: null, phoneVisibility: 'PRIVATE' },
    ]);
    await expect(updateMyProfile(repo, 'user-1', { username: 'ali_2000', displayName: 'علی' })).rejects.toThrow(
      UsernameTakenError
    );
  });

  it('allows re-saving your own unchanged username without a false conflict', async () => {
    const repo = fakeProfileRepo([
      { userId: 'user-1', username: 'ali_2000', displayName: 'علی', bio: null, phoneVisibility: 'PRIVATE' },
    ]);
    await expect(updateMyProfile(repo, 'user-1', { username: 'ali_2000', bio: 'به‌روزرسانی' })).resolves.toMatchObject({
      username: 'ali_2000',
      bio: 'به‌روزرسانی',
    });
  });

  it('stores an XSS-shaped bio/displayName as plain text, verbatim - escaping is the renderer\'s job, not storage\'s', async () => {
    const repo = fakeProfileRepo();
    const payload = '<script>alert(1)</script>';
    const result = await updateMyProfile(repo, 'user-1', { username: 'ali_2000', displayName: payload, bio: payload });
    expect(result.displayName).toBe(payload);
    expect(result.bio).toBe(payload);
  });
});

describe('getPublicProfile', () => {
  function fakePublicRepo(record: PublicProfileRecord | null): PublicProfileRepository {
    return { async findPublicByUsername() { return record; } };
  }

  it('returns null when no profile exists for that username', async () => {
    const repo = fakePublicRepo(null);
    await expect(getPublicProfile(repo, PHONE_ENCRYPTION_KEY, 'nobody')).resolves.toBeNull();
  });

  it('omits phoneE164 (null) when phoneVisibility is PRIVATE, even though a phone identity exists', async () => {
    const repo = fakePublicRepo({
      username: 'ali_2000',
      displayName: 'علی',
      bio: null,
      phoneVisibility: 'PRIVATE',
      phoneCiphertext: encryptPhone('+989121234567', PHONE_ENCRYPTION_KEY),
    });
    const result = await getPublicProfile(repo, PHONE_ENCRYPTION_KEY, 'ali_2000');
    expect(result?.phoneE164).toBeNull();
  });

  it('includes the decrypted phoneE164 when phoneVisibility is PUBLIC', async () => {
    const repo = fakePublicRepo({
      username: 'ali_2000',
      displayName: 'علی',
      bio: 'سلام',
      phoneVisibility: 'PUBLIC',
      phoneCiphertext: encryptPhone('+989121234567', PHONE_ENCRYPTION_KEY),
    });
    const result = await getPublicProfile(repo, PHONE_ENCRYPTION_KEY, 'ali_2000');
    expect(result).toEqual({ username: 'ali_2000', displayName: 'علی', bio: 'سلام', phoneE164: '+989121234567' });
  });

  it('never includes a phoneHash, correlationId, or any official-claim-shaped field, even implicitly', async () => {
    const repo = fakePublicRepo({
      username: 'ali_2000',
      displayName: 'علی',
      bio: null,
      phoneVisibility: 'PUBLIC',
      phoneCiphertext: encryptPhone('+989121234567', PHONE_ENCRYPTION_KEY),
    });
    const result = await getPublicProfile(repo, PHONE_ENCRYPTION_KEY, 'ali_2000');
    expect(Object.keys(result!).sort()).toEqual(['bio', 'displayName', 'phoneE164', 'username'].sort());
  });

  it('returns null phoneE164 (not a crash) when PUBLIC but no phone identity exists at all', async () => {
    const repo = fakePublicRepo({
      username: 'ali_2000',
      displayName: 'علی',
      bio: null,
      phoneVisibility: 'PUBLIC',
      phoneCiphertext: null,
    });
    const result = await getPublicProfile(repo, PHONE_ENCRYPTION_KEY, 'ali_2000');
    expect(result?.phoneE164).toBeNull();
  });
});
