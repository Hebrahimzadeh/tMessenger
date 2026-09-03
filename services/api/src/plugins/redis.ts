import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

async function redisPlugin(app: FastifyInstance): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is required to create a Redis client.');
  }

  // Not lazyConnect: ioredis starts connecting immediately in the
  // background and retries on its own (retryStrategy below), the same
  // "don't block server boot on a dependency being slow to come up"
  // reasoning as plugins/database.ts. Real connectivity is what
  // /v1/health/ready reports, not server startup.
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });

  redis.on('error', (err) => {
    app.log.warn({ err }, 'redis connection error');
  });

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await redis.quit();
  });
}

export default fp(redisPlugin, { name: 'redis' });
