// Clears the two pieces of leftover state that make `admin.spec.ts`
// un-runnable twice in a row: the bootstrap superadmin's TOTP enrollment,
// and its OTP request rate-limit counter.
//
// This exists because the spec is not idempotent without it, and the failure
// is a nasty one: an interrupted run leaves a PENDING enrollment behind, and
// every later run then gets "برای بازنشانی احراز دومرحله‌ای، ابتدا آن را
// تأیید کنید" instead of a fresh secret - permanently, until somebody clears
// the row by hand. That cost time on three separate tasks before this was
// written. Same remedy `space-search.repository.test.ts` got in Task 19:
// clean up in `beforeAll`, not only in `afterEach`, so an interrupted run
// cannot poison the next one.
//
// The rate limit is the second half of the same problem and a real product
// rule, not a bug: three OTP requests per ten minutes per phone. This spec
// logs in twice as the one bootstrap number, so two consecutive runs exceed
// it and the second fails at the login screen with no code field. Clearing
// that one counter is the same kind of fixture reset as deleting the
// enrollment row - it restores the starting state, it does not weaken the
// rule for anybody else.
//
// Deliberately narrow. It resolves exactly one user - the one
// BOOTSTRAP_SUPERADMIN_PHONE names - and touches nothing else, so it cannot
// be pointed at a real account by accident. It lives under tests/ rather
// than scripts/ for the same reason: it is test scaffolding, not an
// operational tool.
//
// Usage: npx tsx tests/e2e/helpers/reset-superadmin-mfa.mjs
import '../../../services/api/src/config/load-dotenv.ts';
import { getPrisma } from '@taavon/database';
import { getEnv } from '../../../services/api/src/config/env.ts';
import { normalizePhone } from '../../../services/api/src/modules/auth/phone.ts';
import { hashPhone } from '../../../services/api/src/modules/auth/phone-crypto.ts';
import Redis from 'ioredis';

async function main() {
  const env = getEnv();
  if (!env.BOOTSTRAP_SUPERADMIN_PHONE) {
    console.error('BOOTSTRAP_SUPERADMIN_PHONE is not set. Nothing to reset.');
    process.exitCode = 1;
    return;
  }

  const prisma = getPrisma();
  const phoneE164 = normalizePhone(env.BOOTSTRAP_SUPERADMIN_PHONE, 'IR');
  const phoneHash = hashPhone(phoneE164, env.PHONE_ENCRYPTION_KEY);

  // Exactly the key auth.service.ts builds for this one number.
  const redis = new Redis(env.REDIS_URL);
  await redis.del(`ratelimit:phone:${phoneHash}`);
  await redis.quit();

  const identity = await prisma.phoneIdentity.findUnique({
    where: { phoneHash },
    select: { userId: true },
  });

  if (!identity) {
    // Nothing bootstrapped yet, which is a perfectly normal state.
    console.log('No superadmin identity found; nothing to reset.');
    return;
  }

  const enrollment = await prisma.mfaEnrollment.findUnique({
    where: { userId: identity.userId },
    select: { id: true },
  });
  if (!enrollment) {
    console.log('No MFA enrollment to reset.');
    return;
  }

  // Recovery codes first - the FK is onDelete: Restrict.
  await prisma.mfaRecoveryCode.deleteMany({ where: { enrollmentId: enrollment.id } });
  await prisma.mfaEnrollment.delete({ where: { id: enrollment.id } });
  console.log(`Reset MFA enrollment for user ${identity.userId}.`);
}

await main();
process.exit(0);
