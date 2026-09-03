import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Env vars live in the repo root .env (one file for the whole monorepo, same
// as the Next.js app already reads), not a package-local .env. Prisma 7 no
// longer auto-loads .env files at all, so this has to happen explicitly.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
