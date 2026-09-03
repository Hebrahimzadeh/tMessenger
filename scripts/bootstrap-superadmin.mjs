// Idempotently bootstraps the platform's first SUPERADMIN account. Reads the
// target phone number ONLY from BOOTSTRAP_SUPERADMIN_PHONE (Task 05
// acceptance: the number must never be hardcoded in source) and never logs
// it in plaintext - only the resulting userId.
//
// Usage: npm run bootstrap:superadmin
// (runs via tsx - this file imports .ts sources directly, see package.json)
import '../services/api/src/config/load-dotenv.ts';
import { getPrisma } from '@taavon/database';
import { getEnv } from '../services/api/src/config/env.ts';
import { normalizePhone } from '../services/api/src/modules/auth/phone.ts';
import { bootstrapSuperadmin } from '../services/api/src/modules/auth/bootstrap.ts';

async function main() {
  const env = getEnv();

  if (!env.BOOTSTRAP_SUPERADMIN_PHONE) {
    console.error('BOOTSTRAP_SUPERADMIN_PHONE is not set. Refusing to bootstrap.');
    process.exitCode = 1;
    return;
  }

  // 'IR' is only the fallback default country for a number given without a
  // '+' prefix (e.g. '09191953219') - it has no effect on an
  // already-international number, and is not the phone number itself.
  const phoneE164 = normalizePhone(env.BOOTSTRAP_SUPERADMIN_PHONE, 'IR');
  const prisma = getPrisma();

  const result = await bootstrapSuperadmin(prisma, phoneE164, env.PHONE_ENCRYPTION_KEY);

  console.log(
    result.created ? `Created superadmin user ${result.userId}.` : `Superadmin user ${result.userId} already existed.`
  );
  console.log(result.roleAssigned ? 'SUPERADMIN role assigned.' : 'SUPERADMIN role was already assigned.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
