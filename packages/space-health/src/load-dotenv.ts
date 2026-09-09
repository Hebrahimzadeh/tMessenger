import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from 'dotenv';

// Env vars live in the repo root .env (one file for the whole monorepo),
// not a package-local .env - same reasoning as services/api's own
// load-dotenv.ts. This package's repository tests need a real
// DATABASE_URL to exercise createPrismaSpaceHealthRepository against
// Postgres.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env') });
