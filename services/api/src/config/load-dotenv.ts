import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from 'dotenv';

// Env vars live in the repo root .env (one file for the whole monorepo,
// same as the Next.js app and packages/database's prisma.config.ts already
// read), not a package-local .env. Node/Fastify has no automatic .env
// loading, so this has to happen explicitly, and first - before anything
// else in this process reads process.env.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../../.env') });
