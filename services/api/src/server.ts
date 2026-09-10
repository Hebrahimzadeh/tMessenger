import './config/load-dotenv';
import { getPrisma } from '@taavon/database';
import { getEnv } from './config/env';
import { buildApp } from './app';
import databasePlugin from './plugins/database';
import redisPlugin from './plugins/redis';
import { S3StorageProvider } from './modules/storage/s3-storage-provider';
import { createSmsProvider } from './modules/auth/sms-provider';
import { createRedisRateLimiter, type RateLimiter } from './modules/auth/rate-limiter';
import { REACTION_RATE_LIMIT, REACTION_RATE_WINDOW_SECONDS } from './modules/cards/public-comment.route';

async function main() {
  // Fails fast (before any plugin registration or listen) on missing env or,
  // in production, a default/short secret.
  const env = getEnv();
  const isProduction = env.NODE_ENV === 'production';

  const storage = new S3StorageProvider({
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  });

  // Fails fast in production without a real provider configured (Task 06
  // acceptance: "production بدون provider معتبر start نشود").
  const smsProvider = createSmsProvider(env);

  // Same forward-reference trick as checkRedis below: `.consume` is a
  // closure body that only runs at request time, well after `app` and the
  // redis plugin are both fully set up, so referencing `app.redis` here
  // (before `app` itself is assigned) is safe.
  const reactionRateLimiter: RateLimiter = {
    consume: (key) => createRedisRateLimiter(app.redis, REACTION_RATE_LIMIT, REACTION_RATE_WINDOW_SECONDS).consume(key),
  };

  // `app` is referenced inside checkRedis's closure before this statement
  // finishes - safe, because the closure body only runs later (on an actual
  // /v1/health/ready request), well after `app` and the redis plugin below
  // are both fully set up. getPrisma() is a module-level singleton, so
  // checkDatabase and the database plugin share the exact same client
  // without needing that same forward-reference.
  const app = buildApp({
    appOrigin: env.APP_ORIGIN,
    storageProvider: storage,
    auth: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
      phoneEncryptionKey: env.PHONE_ENCRYPTION_KEY,
      smsProvider,
      isProduction,
    },
    profile: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
      phoneEncryptionKey: env.PHONE_ENCRYPTION_KEY,
    },
    mfa: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
      phoneEncryptionKey: env.PHONE_ENCRYPTION_KEY,
      isProduction,
    },
    identityClaim: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
      phoneEncryptionKey: env.PHONE_ENCRYPTION_KEY,
    },
    admin: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
      phoneEncryptionKey: env.PHONE_ENCRYPTION_KEY,
    },
    spaces: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
    },
    spaceSearch: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
    },
    cards: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
    },
    publicComments: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
      reactionRateLimiter,
    },
    storage: {
      sessionHmacKey: env.SESSION_HMAC_KEY,
    },
    health: {
      checkDatabase: async () => {
        await getPrisma().$queryRaw`SELECT 1`;
        return true;
      },
      checkRedis: async () => (await app.redis.ping()) === 'PONG',
      checkStorage: async () => {
        const objectKey = `__healthcheck__/${Date.now()}`;
        await storage.putPrivate({ objectKey, body: Buffer.from('ok'), contentType: 'text/plain' });
        await storage.delete(objectKey);
        return true;
      },
    },
  });

  await app.register(databasePlugin);
  await app.register(redisPlugin);

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
