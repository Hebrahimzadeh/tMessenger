# تعاون‌آفرینی (taavon)

MVP platform for تعاون‌آفرینی: a Persian-first Next.js PWA, a modular
Fastify API, PostgreSQL, Redis, and S3-compatible object storage. See
`docs/*-mvp-sonnet5.md` for the full implementation plan and
`docs/taavonafarin-master-platform-architecture-v3.md` for the product and
architecture rationale.

## Project layout

```text
app/, components/, lib/, hooks/    Next.js PWA (this workspace's root package)
services/api/                      Fastify API (@taavon/api)
packages/contracts/                Shared Zod schemas/types (@taavon/contracts)
packages/database/                 Prisma schema, migrations, client (@taavon/database)
docs/reviews/                      Per-task review evidence
deploy/                            Reverse proxy config and deploy runbook
```

## Run locally (without Docker)

**Prerequisites:** Node.js 24 (see `.nvmrc`), and either Docker or your own
local PostgreSQL 16 / Redis 7 / S3-compatible storage.

1. Install dependencies (this is an npm workspaces monorepo - one install at
   the root covers the web app, the API, and both packages):

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in every value. `SESSION_HMAC_KEY`
   and `PHONE_ENCRYPTION_KEY` have no default - the API refuses to start
   without them (see `services/api/src/config/env.ts`).

3. Start Postgres/Redis/object storage. Either via Docker Compose:

   ```bash
   docker compose up -d postgres redis object-storage
   ```

   or point `DATABASE_URL`/`REDIS_URL`/`S3_*` in `.env` at your own local
   services.

4. Apply migrations:

   ```bash
   npm run db:migrate --workspace packages/database
   ```

5. Run the API and the web app in separate terminals:

   ```bash
   npm run dev --workspace services/api   # http://localhost:4000
   npm run dev                             # http://localhost:3000
   ```

   Visit `http://localhost:3000/system-status` to confirm the API,
   database, Redis, and storage are all reachable.

## Common commands

```bash
npm run verify                              # lint + typecheck + unit tests + build (root)
npm run test --workspace services/api       # API unit tests (skips real-infra checks if unreachable)
npm run test:integration --workspace services/api   # same suite, expects real Postgres/Redis/MinIO
npm run typecheck --workspace packages/database
npm run test:e2e                            # Playwright against the local dev server
```

## Run the full stack with Docker Compose

This builds and runs everything - Postgres, Redis, object storage, the API,
the web app, and a Caddy reverse proxy that is the only port published to
the host:

```bash
docker compose build
docker compose up -d
docker compose ps
```

Then visit `http://localhost/` and `http://localhost/system-status`. See
[`deploy/README.md`](deploy/README.md) for the full deploy/rollback runbook,
required environment variables, and log/secret-hygiene notes.

## Tests

| Command | What it needs |
|---|---|
| `npm run test` | Nothing extra - unit tests only, gracefully skips real-infra checks |
| `npm run test:integration --workspace services/api` | Real `DATABASE_URL`/`REDIS_URL`/`S3_*` (e.g. `docker compose up -d postgres redis object-storage`) |
| `npx playwright test tests/e2e/baseline.spec.ts` | Nothing extra - starts its own dev server on port 4300 |
| `npx playwright test tests/e2e/system-status.spec.ts` | The full stack running via `docker compose up -d` (targets `http://localhost` by default; override with `SYSTEM_STATUS_BASE_URL`) |

CI (`.github/workflows/ci.yml`) runs the full matrix - locked install, lint,
typecheck, unit tests, a from-zero migration, integration tests against
real Postgres/Redis/MinIO service containers, and the production build - on
every push and pull request.
