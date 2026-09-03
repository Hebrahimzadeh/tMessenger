import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { getPrisma, type PrismaClient } from '@taavon/database';

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient;
  }
}

async function databasePlugin(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  // Deliberately does not await $connect() here: Prisma connects lazily on
  // first query either way, and a synchronous connect at registration would
  // make the whole server fail to boot on a database that is merely slow to
  // become ready (a real risk with orchestrated startup ordering) rather
  // than actually broken. Real connectivity is what /v1/health/ready
  // reports, not server startup.
  app.decorate('db', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}

export default fp(databasePlugin, { name: 'database' });
