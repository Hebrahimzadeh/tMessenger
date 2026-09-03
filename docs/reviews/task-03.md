# Task 03 Review

Status: APPROVED
Implementation-Commit: 65cda3b9dc3fca43ff787a96d48016bcd3d171a9

Scope:
- Created: `docker-compose.yml`
- Modified: `.env.example`, `.gitignore`
- Created: `packages/database/{package.json,prisma.config.ts,tsconfig.json,vitest.config.ts,prisma/schema.prisma,prisma/migrations/20260903000000_init/migration.sql,prisma/migrations/migration_lock.toml,src/client.ts,src/client.test.ts}`
- Created: `services/api/src/config/{env.ts,env.test.ts,load-dotenv.ts}`
- Created: `services/api/src/plugins/{database.ts,redis.ts}`
- Created: `services/api/src/modules/storage/{storage-provider.ts,fake-storage-provider.ts,s3-storage-provider.ts,storage.test.ts}`
- Modified (cascaded from adding a third `ready` dependency): `services/api/src/server.ts`, `services/api/src/modules/health/{health.route.ts,health.test.ts}`, `packages/contracts/src/health.ts`, `components/system-status/SystemStatus.{tsx,test.tsx}`, `services/api/package.json`, `package-lock.json`

Commands (all actually run in this environment):
```
npm install
npx prisma validate
npx prisma generate
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
npm run test --workspace services/api
npm run test --workspace packages/database
npm run typecheck --workspace services/api
npm run typecheck --workspace packages/database
npm run lint
npm run typecheck
npm run test
npm run build
npm run build --workspaces --if-present
npm audit
git diff --check
```
Manual, against real running services (not part of the automated suite):
```
services/api: npm run dev  (real REDIS_URL -> this machine's native Redis; DATABASE_URL/S3_ENDPOINT pointed at addresses nothing listens on)
curl http://localhost:4000/v1/health/live
curl -i http://localhost:4000/v1/health/ready
node --eval invoking getEnv() with DATABASE_URL deleted from process.env
```

Results:
- `npm run test --workspace services/api`: 3 files, 33 passed, 4 skipped (the S3-backed contract - see Security). 0 failed.
- `npm run test --workspace packages/database`: 1 file, 4/4 passed.
- Both workspaces' `typecheck`: exit 0.
- Root `lint`/`typecheck`/`test` (8/8)/`build`: all exit 0.
- `npm run build --workspaces --if-present`: `@taavon/api` → `tsc` exit 0; `@taavon/database`/`@taavon/contracts` have no build script, correctly skipped.
- `npm audit`: 0 critical, 7 high (up from 3 in Task 02 - see Security for the 4 new ones, all in `prisma`'s own devDependency tree).
- `git diff --check`: exit 0.
- **Live manual verification (real Redis, unreachable Postgres/MinIO):** `GET /v1/health/live` → `200 {"status":"ok","version":"0.1.0"}`. `GET /v1/health/ready` → `503 {"status":"degraded","checks":{"database":"down","redis":"ok","storage":"down"}}` - `redis: ok` here is a genuine ioredis connection and `PING` against this machine's real, natively-running Redis, not a stub. `database`/`storage` correctly report `down` against addresses nothing is listening on. The server booting and answering `/live` at all, despite two unreachable dependencies, confirms the plugins' lazy-connect design (see Reviewer note).
- **Live manual verification (env fail-fast):** invoking `getEnv()` with `DATABASE_URL` removed from `process.env` throws a Zod validation error immediately; nothing about `server.ts`'s flow proceeds past that point (it's the first statement in `main()`).
- **Migration SQL provenance:** generated via Prisma's own `prisma migrate diff --from-empty --to-schema` (a static, schema-only computation Prisma itself performs - no live database involved), not hand-typed. Not yet applied against a real Postgres instance - see Security.

Acceptance:
- restart دادهٔ PostgreSQL را از بین نمی‌برد: **NOT VERIFIED HERE** — no Docker in this environment (see Security). `docker-compose.yml` declares a named volume (`postgres_data`) exactly as Compose's own documented mechanism for this; correctness depends on Docker's own volume semantics, not on code this task wrote.
- ready هر سه dependency را `ok` گزارش می‌کند: **PARTIALLY VERIFIED** — proven at the unit/injection level for all 8 ok/down combinations across all three checks (`health.test.ts`, including the new `it.each` matrix), and proven live for `redis` specifically against this machine's real native Redis. `database`/`storage` reporting `ok` against a genuinely reachable Postgres/MinIO is **not verified live** — no such instance was reachable here.
- put/read/delete در fake و S3 adapter قرارداد یکسان دارد و object بدون signed URL خوانده نمی‌شود: **PARTIALLY VERIFIED** — the fake provider's contract is fully green (4/4). The S3 provider's identical contract test exists and runs, but skipped (4/4 skipped) since no reachable S3-compatible endpoint exists here; see Security for why and what would make it run.
- env نامعتبر مانع شروع API می‌شود: **PASS** — verified live (see Results); also 19 unit tests in `env.test.ts` (shape + production-strength rules).
- migration از database خالی و روی database migrated هر دو موفق است: **NOT VERIFIED HERE** — no live Postgres to run `prisma migrate deploy` against, twice, and compare. The SQL itself was generated by Prisma's own tooling (see Results), which is strong evidence of correctness but not the same as an applied migration.
- `docs/reviews/task-03.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: add persistent runtime services` (`65cda3b9dc3fca43ff787a96d48016bcd3d171a9`).

Security:
- **This environment has no Docker** (no Docker Desktop, no WSL Docker) — confirmed by direct check, not assumed. This blocks exactly three things, all listed above as not-verified: real Postgres migration apply, restart/volume-persistence, and the S3-provider contract against real MinIO. Nothing in the *code* is a known gap; the gap is this execution environment. This surfaced in the conversation before this task started and is unresolved — the owner should either provide Docker access or run `docker compose up -d postgres redis object-storage && npm run db:migrate && npm run test:integration --workspace services/api && docker compose ps` themselves before relying on this task's live-infra guarantees. **Task 04 (CI, Docker images) cannot proceed at all without Docker being resolved one way or another** — this is no longer optional past this point.
- CORS remains `origin: true` (unchanged from Task 02, still deliberate and still flagged for Task 06).
- `SESSION_HMAC_KEY`/`PHONE_ENCRYPTION_KEY` are present in the repo's local `.env` as obviously-labelled dev-only values (`local-dev-only-...-not-for-prod`); `.env` is gitignored and was not committed. `.env.example` ships empty placeholders for both, forcing every real environment to set its own.
- `npm audit`: 0 critical, 7 high. 3 are unchanged from Task 01/02 (`next`, `postcss`, `sharp` - all require `next@16.3.4`, outside the plan's `16.2.11` pin). 4 are new, all inside `prisma`'s own **devDependency** tree (`@prisma/config`, `deepmerge-ts`, `mysql2` ×2 advisories) - none of these ship in `services/api`'s runtime (only `@prisma/client` + the driver adapter do; the `prisma` CLI package itself is dev-only and never imported by application code), and `mysql2`'s vulnerabilities are specifically about a MySQL wire-protocol handshake this project never performs (Postgres only). `npm audit fix --force`'s only offered resolution is downgrading to `prisma@6.19.3`, which conflicts with the plan's explicit "Prisma 7" requirement; left unresolved and disclosed here rather than silently downgraded.
- Two more unrelated, untracked files (`T messenger v0.2.zip`, `T messenger v0.3.zip`) appeared in the working directory during this task; neither was touched or included in any commit.

Regressions:
Root `npm run verify` (lint → typecheck → test → build) passes with exit 0, as do both new workspaces' own `test`/`typecheck`/`build`. Task 02's health contract, route, and `SystemStatus` component were extended (2 checks → 3) rather than replaced; all of Task 02's original assertions still hold, just with an added `storage` key threaded through every affected test.

Reviewer note:
Two real architecture decisions this task made, both because empirical checks in this exact environment forced them, not from a priori preference:
1. **Prisma 7 requires a driver adapter** (`@prisma/adapter-pg` + `pg`) — there is no bundled query engine to fall back to, unlike Prisma 5/6. `getPrisma()` constructs the client with this adapter; `prisma.config.ts` (not `datasource.url` in `schema.prisma`, which Prisma 7 deprecated) holds `DATABASE_URL`, loaded explicitly via `dotenv` since Prisma 7 also dropped automatic `.env` loading. This was confirmed against the actual installed `prisma@7.10.0` CLI and its own vendored upgrade-guide documentation (`prisma init` scaffolds this; the scaffolded skill/doc bundle itself was deleted after reading it — it's not part of this task's deliverable), not from possibly-stale prior knowledge of older Prisma versions.
2. **`services/api`'s Fastify plugins connect lazily, not at registration.** An earlier draft called `$connect()`/`.connect()` synchronously inside `database.ts`/`redis.ts`, which would make the *entire server* fail to boot — not just `/ready` degrade — whenever Postgres or Redis is briefly unreachable at startup. That contradicts `/live`'s own stated contract ("never depends on downstream services") at the server-boot level, so both plugins were changed to decorate immediately and let Prisma/ioredis connect (and retry) in the background; `/v1/health/ready` is the only place connectivity is actually asserted. This is exactly what the live manual test above demonstrates.

One test-writing subtlety worth flagging: the S3 contract test's availability probe originally hung for 30+ seconds because `localhost:9000` — Compose's conventional MinIO port, and the initial `.env` default — has IntelliJ IDEA listening on it on this machine, accepting the TCP connection but never completing an S3 handshake, which defeated the AWS SDK's own retry/timeout tuning. Fixed with a hard `Promise.race` timeout around the probe, independent of SDK internals. `docker-compose.yml` itself still uses the conventional port 9000/9001 (correct for any other environment); only this task's *local `.env` and test defaults* were affected, and are trivially reconfigurable per-machine.
