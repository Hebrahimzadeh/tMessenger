import './config/load-dotenv';
import { getPrisma } from '@taavon/database';
import { getEnv } from './config/env';
import { buildApp } from './app';
import databasePlugin from './plugins/database';
import redisPlugin from './plugins/redis';
import { S3StorageProvider } from './modules/storage/s3-storage-provider';

async function main() {
  // Fails fast (before any plugin registration or listen) on missing env or,
  // in production, a default/short secret.
  const env = getEnv();

  const storage = new S3StorageProvider({
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  });

  // `app` is referenced inside checkRedis's closure before this statement
  // finishes - safe, because the closure body only runs later (on an actual
  // /v1/health/ready request), well after `app` and the redis plugin below
  // are both fully set up. getPrisma() is a module-level singleton, so
  // checkDatabase and the database plugin share the exact same client
  // without needing that same forward-reference.
  const app = buildApp({
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
