import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from 'dotenv';

// Env vars live in the repo root .env (one file for the whole monorepo,
// same as services/api's own load-dotenv.ts) - Node has no automatic .env
// loading, so this must happen explicitly, first, before anything else in
// this process reads process.env.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../../.env') });
