import { z } from 'zod';

const WEAK_SECRET_PATTERNS: RegExp[] = [
  /changeme/i,
  /change-me/i,
  /placeholder/i,
  /example/i,
  /^secret$/i,
  /^password$/i,
  /^default$/i,
  /^dev-?secret$/i,
  /^test-?secret$/i,
  /^0+$/,
  /^(.)\1+$/, // a single character repeated, e.g. "aaaaaaaa..."
];

function isWeakSecret(value: string): boolean {
  return WEAK_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  S3_ENDPOINT: z.string().min(1, 'S3_ENDPOINT is required'),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET is required'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
  SESSION_HMAC_KEY: z.string().min(16, 'SESSION_HMAC_KEY must be at least 16 characters'),
  PHONE_ENCRYPTION_KEY: z.string().min(16, 'PHONE_ENCRYPTION_KEY must be at least 16 characters'),
  APP_ORIGIN: z.string().url('APP_ORIGIN must be a valid URL'),
  // Optional: only scripts/bootstrap-superadmin.mjs reads this, never the
  // server itself, so it must not block every other boot when unset. Task 05
  // acceptance requires the bootstrap phone number come from here and only
  // here - never hardcoded in source (see bootstrap.ts).
  BOOTSTRAP_SUPERADMIN_PHONE: z.string().optional(),
  // Optional here too: shape validation only. createSmsProvider (Task 06)
  // is what actually enforces "production must not start without a valid
  // provider" - see sms-provider.ts's SmsProviderNotConfiguredError.
  SMS_PROVIDER_WEBHOOK_URL: z.string().url().optional(),
  SMS_PROVIDER_API_KEY: z.string().min(1).optional(),
  /**
   * Lets a production deployment log in with no SMS gateway, by keeping the
   * dev sink (and the `/v1/auth/otp/_dev-sink` route that reads codes back
   * out of it) available.
   *
   * This is a deliberate hole and it is named like one. Anyone who can reach
   * the API can request a code for any phone number and then read it, so it
   * belongs only on a deployment with no real accounts on it. It exists so
   * that enabling test login does not require flipping NODE_ENV, which would
   * quietly also drop `Secure` from every session cookie and skip the
   * secret-strength checks below - a much larger change than the one being
   * asked for.
   */
  ALLOW_TEST_LOGIN_WITHOUT_SMS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Task 23. All optional: with no key the orchestrator runs with no
  // provider and every capability answers from its rule-based fallback,
  // which is a supported way to run rather than a broken one.
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Overrides the provider's default model, for when Google retires one. */
  GEMINI_MODEL: z.string().min(1).optional(),
  AI_DAILY_BUDGET_MICROS: z.coerce.number().int().nonnegative().optional(),
});

export type Env = z.infer<typeof baseSchema>;

const PRODUCTION_MIN_SECRET_LENGTH = 32;
const PRODUCTION_SECRET_FIELDS = ['SESSION_HMAC_KEY', 'PHONE_ENCRYPTION_KEY'] as const;

/**
 * Fails fast when running in production with a secret that is too short or
 * looks like a default/placeholder value. Kept separate from the Zod schema
 * so the *shape* (missing/empty fields) always fails identically across
 * environments, while *strength* is only enforced where it matters.
 */
function assertProductionSecretStrength(env: Env): void {
  if (env.NODE_ENV !== 'production') return;

  for (const field of PRODUCTION_SECRET_FIELDS) {
    const value = env[field];

    if (value.length < PRODUCTION_MIN_SECRET_LENGTH) {
      throw new Error(
        `${field} must be at least ${PRODUCTION_MIN_SECRET_LENGTH} characters in production (got ${value.length}).`
      );
    }

    if (isWeakSecret(value)) {
      throw new Error(`${field} looks like a default/placeholder value and cannot be used in production.`);
    }
  }
}

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = baseSchema.parse(source);
  assertProductionSecretStrength(parsed);
  return parsed;
}

let cachedEnv: Env | null = null;

/** Cached, validated environment. Parses (and fails fast) once per process. */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = parseEnv();
  }
  return cachedEnv;
}

/** Test-only: clears the cache so tests can re-parse with different env values. */
export function resetEnvCacheForTests(): void {
  cachedEnv = null;
}
