import { describe, expect, it } from 'vitest';
import {
  challengeMfa,
  confirmMfa,
  enrollMfa,
  InvalidTotpCodeError,
  MfaNotActiveError,
  NoPendingEnrollmentError,
  type MfaRepository,
} from './mfa.service';
import { computeTotpCode } from './totp';

const ENCRYPTION_KEY = 'test-only-mfa-encryption-key';

interface FakeEnrollment {
  id: string;
  status: 'PENDING' | 'ACTIVE';
  secretCiphertext: string;
}

function fakeMfaRepo() {
  const enrollments = new Map<string, FakeEnrollment>();
  const recoveryCodes = new Map<string, { enrollmentId: string; codeHash: string; usedAt: Date | null }>();
  let nextId = 1;

  const repo: MfaRepository = {
    async findEnrollment(userId) {
      const e = enrollments.get(userId);
      return e ? { status: e.status, secretCiphertext: e.secretCiphertext } : null;
    },
    async upsertPendingEnrollment(userId, secretCiphertext) {
      const existing = enrollments.get(userId);
      const id = existing?.id ?? `enrollment-${nextId++}`;
      if (existing) {
        for (const [key, rc] of recoveryCodes) {
          if (rc.enrollmentId === existing.id) recoveryCodes.delete(key);
        }
      }
      enrollments.set(userId, { id, status: 'PENDING', secretCiphertext });
    },
    async activateEnrollment(userId, recoveryCodeHashes) {
      const e = enrollments.get(userId)!;
      e.status = 'ACTIVE';
      for (const codeHash of recoveryCodeHashes) {
        recoveryCodes.set(`${e.id}:${codeHash}`, { enrollmentId: e.id, codeHash, usedAt: null });
      }
    },
    async findUnusedRecoveryCodeByHash(userId, codeHash) {
      const e = enrollments.get(userId);
      if (!e) return null;
      const key = `${e.id}:${codeHash}`;
      const record = recoveryCodes.get(key);
      return record && !record.usedAt ? { id: key } : null;
    },
    async markRecoveryCodeUsed(id) {
      const record = recoveryCodes.get(id);
      if (record) record.usedAt = new Date();
    },
  };

  return repo;
}

describe('enrollMfa', () => {
  it('generates a secret and returns an otpauth URI, storing only the encrypted secret', async () => {
    const repo = fakeMfaRepo();
    const result = await enrollMfa(repo, ENCRYPTION_KEY, 'user-1');

    expect(result.secretBase32).toMatch(/^[A-Z2-7]+$/);
    expect(result.otpauthUri).toContain('otpauth://totp/');

    const stored = await repo.findEnrollment('user-1');
    expect(stored?.status).toBe('PENDING');
    expect(stored?.secretCiphertext).not.toContain(result.secretBase32);
  });

  it('re-enrolling replaces the secret (a fresh PENDING enrollment)', async () => {
    const repo = fakeMfaRepo();
    const first = await enrollMfa(repo, ENCRYPTION_KEY, 'user-1');
    const second = await enrollMfa(repo, ENCRYPTION_KEY, 'user-1');

    expect(second.secretBase32).not.toBe(first.secretBase32);
    const stored = await repo.findEnrollment('user-1');
    expect(stored?.status).toBe('PENDING');
  });
});

describe('confirmMfa', () => {
  it('activates the enrollment and returns 10 recovery codes for a correct code', async () => {
    const repo = fakeMfaRepo();
    const { secretBase32 } = await enrollMfa(repo, ENCRYPTION_KEY, 'user-1');
    const code = computeTotpCode(secretBase32);

    const result = await confirmMfa(repo, ENCRYPTION_KEY, 'user-1', code);

    expect(result.recoveryCodes).toHaveLength(10);
    const stored = await repo.findEnrollment('user-1');
    expect(stored?.status).toBe('ACTIVE');
  });

  it('throws NoPendingEnrollmentError when there is nothing to confirm', async () => {
    const repo = fakeMfaRepo();
    await expect(confirmMfa(repo, ENCRYPTION_KEY, 'user-1', '123456')).rejects.toThrow(NoPendingEnrollmentError);
  });

  it('throws InvalidTotpCodeError for a wrong code, and does not activate', async () => {
    const repo = fakeMfaRepo();
    await enrollMfa(repo, ENCRYPTION_KEY, 'user-1');
    await expect(confirmMfa(repo, ENCRYPTION_KEY, 'user-1', '000000')).rejects.toThrow(InvalidTotpCodeError);

    const stored = await repo.findEnrollment('user-1');
    expect(stored?.status).toBe('PENDING');
  });

  it('an already-ACTIVE enrollment cannot be re-confirmed via this path (must re-enroll first)', async () => {
    const repo = fakeMfaRepo();
    const { secretBase32 } = await enrollMfa(repo, ENCRYPTION_KEY, 'user-1');
    await confirmMfa(repo, ENCRYPTION_KEY, 'user-1', computeTotpCode(secretBase32));

    await expect(confirmMfa(repo, ENCRYPTION_KEY, 'user-1', computeTotpCode(secretBase32))).rejects.toThrow(
      NoPendingEnrollmentError
    );
  });
});

describe('challengeMfa', () => {
  async function activatedUser(repo: MfaRepository, userId: string) {
    const { secretBase32 } = await enrollMfa(repo, ENCRYPTION_KEY, userId);
    const { recoveryCodes } = await confirmMfa(repo, ENCRYPTION_KEY, userId, computeTotpCode(secretBase32));
    return { secretBase32, recoveryCodes };
  }

  it('accepts a correct live TOTP code', async () => {
    const repo = fakeMfaRepo();
    const { secretBase32 } = await activatedUser(repo, 'user-1');
    await expect(challengeMfa(repo, ENCRYPTION_KEY, 'user-1', computeTotpCode(secretBase32))).resolves.toBe(true);
  });

  it('rejects an incorrect code', async () => {
    const repo = fakeMfaRepo();
    await activatedUser(repo, 'user-1');
    await expect(challengeMfa(repo, ENCRYPTION_KEY, 'user-1', '000000')).resolves.toBe(false);
  });

  it('accepts a valid, unused recovery code, then rejects it on reuse (single-use)', async () => {
    const repo = fakeMfaRepo();
    const { recoveryCodes } = await activatedUser(repo, 'user-1');
    const code = recoveryCodes[0]!;

    await expect(challengeMfa(repo, ENCRYPTION_KEY, 'user-1', code)).resolves.toBe(true);
    await expect(challengeMfa(repo, ENCRYPTION_KEY, 'user-1', code)).resolves.toBe(false);
  });

  it('throws MfaNotActiveError when there is no active enrollment (incomplete enrollment must not grant access)', async () => {
    const repo = fakeMfaRepo();
    await enrollMfa(repo, ENCRYPTION_KEY, 'user-1'); // PENDING only, never confirmed
    await expect(challengeMfa(repo, ENCRYPTION_KEY, 'user-1', '123456')).rejects.toThrow(MfaNotActiveError);
  });

  it('throws MfaNotActiveError for a user who never enrolled at all', async () => {
    const repo = fakeMfaRepo();
    await expect(challengeMfa(repo, ENCRYPTION_KEY, 'never-enrolled', '123456')).rejects.toThrow(MfaNotActiveError);
  });
});
