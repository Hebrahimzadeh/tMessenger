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
