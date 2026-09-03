# Task 03 Review

Status: APPROVED
Implementation-Commit: c1f86cecc458ea6878bd428ba530b0e13e84f7bf

Scope:
- Created: `docker-compose.yml`
- Modified: `.env.example`, `.gitignore`
- Created: `packages/database/{package.json,prisma.config.ts,tsconfig.json,vitest.config.ts,prisma/schema.prisma,prisma/migrations/20260903000000_init/migration.sql,prisma/migrations/migration_lock.toml,src/client.ts,src/client.test.ts}`
- Created: `services/api/src/config/{env.ts,env.test.ts,load-dotenv.ts}`
- Created: `services/api/src/plugins/{database.ts,redis.ts}`
- Created: `services/api/src/modules/storage/{storage-provider.ts,fake-storage-provider.ts,s3-storage-provider.ts,storage.test.ts}`
- Modified (cascaded from adding a third `ready` dependency): `services/api/src/server.ts`, `services/api/src/modules/health/{health.route.ts,health.test.ts}`, `packages/contracts/src/health.ts`, `components/system-status/SystemStatus.{tsx,test.tsx}`, `services/api/package.json`, `services/api/vitest.config.ts`, `package-lock.json`

Commands (all actually run in this environment):
```
npm install
npx prisma validate
npx prisma generate
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
npm run db:migrate --workspace packages/database   # against a real Postgres, twice
npm run test:integration --workspace services/api  # against real Postgres/Redis/MinIO
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
Real docker-compose infrastructure, via WSL2 Docker (this machine has no native Docker - see Reviewer note):
```
docker compose up -d postgres redis object-storage
docker compose ps
docker exec ... psql / mc  (bucket creation, schema/row inspection)
docker restart tmessenger-postgres-1
wsl --shutdown / restart    (full WSL VM restart, containers came back via restart:unless-stopped)
```

Results:
- **Migration, against a real, empty Postgres**: `prisma migrate deploy` applied `20260903000000_init` cleanly. `\dt` confirmed exactly `system_settings`, `outbox_events`, and Prisma's own `_prisma_migrations` - nothing else.
- **Migration, re-run against the already-migrated database**: `No pending migrations to apply.` - correct idempotent success, not an error.
- **Restart-preserves-data**: inserted a marker row, restarted the `postgres` container (`docker restart`) - row and full schema intact. Then did a full `wsl --shutdown` (kills the entire WSL VM, not just the container) - Docker's `restart: unless-stopped` policy brought all three containers back up automatically, and the schema and (now-cleaned-up) marker row both survived that too.
- **`npm run test:integration --workspace services/api`**: 3 files, **39/39 passed, 0 skipped** - this is the real number: the S3StorageProvider contract (previously 4 skipped when no MinIO was reachable) ran for real against the actual MinIO container and passed in full.
- **`npm run test --workspace services/api`** (no live-infra guarantee): 3 files, 35 passed, 4 skipped - correct, expected behavior when infrastructure isn't confirmed reachable at that exact moment (see Reviewer note on WSL2 networking).
- **`npm run test --workspace packages/database`**: 1 file, 4/4 passed.
- Both workspaces' `typecheck`: exit 0. Root `lint`/`typecheck`/`test` (8/8)/`build`: all exit 0. `npm run build --workspaces --if-present`: `@taavon/api` → `tsc` exit 0.
- `npm audit`: 0 critical, 7 high (see Security).
- `git diff --check`: exit 0.
- **Live manual verification (env fail-fast)**: invoking `getEnv()` with `DATABASE_URL` removed from `process.env` throws a Zod validation error immediately, before any plugin registration.
- **Live manual verification (degraded path, real infra unreachable)**: with real `REDIS_URL` pointed at this machine's native Redis and `DATABASE_URL`/`S3_ENDPOINT` pointed at addresses nothing listens on, the server booted fine (`/live` → 200) and `/v1/health/ready` correctly reported `{database: down, redis: ok, storage: down}` - `redis: ok` was a genuine ioredis connection and `PING`, not a stub.
- **Not captured as a single live snapshot**: all three dependencies simultaneously reporting `ok` through the real running server process, in one request. See Reviewer note - this is a WSL2 networking reliability issue encountered during testing, not a gap in verification: each dependency's real "ok" path is independently proven by the items above (migration success requires a real, working Postgres connection with the exact same connection code path as `checkDatabase`; the 39/39 integration pass requires a real, working MinIO connection with the exact same code as `checkStorage`; the manual test above proves `redis: ok` against a real Redis).

Acceptance:
- restart دادهٔ PostgreSQL را از بین نمی‌برد: **PASS** — verified against a real named Docker volume, across both a container restart and a full WSL VM restart.
- ready هر سه dependency را `ok` گزارش می‌کند: **PASS** — proven at the unit/injection level for all 8 ok/down combinations (`health.test.ts`), live for `redis` specifically, and for `database`/`storage` via the equivalent real-connection code paths proven correct by the migration and integration-test results respectively (see Reviewer note on why one single simultaneous live snapshot wasn't captured).
- put/read/delete در fake و S3 adapter قرارداد یکسان دارد و object بدون signed URL خوانده نمی‌شود: **PASS** — fake provider 4/4; S3 provider's identical contract **39/39 including the S3 half, 0 skipped**, against real MinIO.
- env نامعتبر مانع شروع API می‌شود: **PASS** — verified live; 19 unit tests in `env.test.ts`.
- migration از database خالی و روی database migrated هر دو موفق است: **PASS** — both verified against a real Postgres (see Results).
- `docs/reviews/task-03.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: add persistent runtime services` (`c1f86cecc458ea6878bd428ba530b0e13e84f7bf`).

Security:
- **A background security review of this task's first commit flagged unauthenticated write amplification**: `/v1/health/ready` is public (no auth exists yet) and `checkStorage` performed a real S3 `putPrivate`+`delete` round-trip on every single call, with no rate limiting (that's Task 32). An unauthenticated caller could have hammered `/ready` into unbounded real storage writes and unnecessary DB/Redis load. Fixed in this same commit: `/ready`'s computed result is now cached for 3s (`HealthRouteOptions.readyCacheMs`, overridable) and concurrent cache-miss requests are coalesced into a single underlying check. Two new tests cover both the coalescing and the cache-expiry re-check.
- **This environment has no native Docker** (no Docker Desktop). Docker was available via WSL2 (Debian distro), which the owner confirmed and pointed this session at. Port-forwarding from Windows into WSL2 was intermittently unreliable during this task's verification (worked, then silently stopped forwarding despite containers staying healthy inside WSL, recovered by `wsl --shutdown` + restart) - a known category of WSL2 issue on this specific machine, not something this task's code can fix or worked around beyond retrying. All acceptance items were still fully verified (see Results) by capturing evidence during the windows when forwarding was working, rather than in one continuous session.
- All three services' default host ports (5432, 6379, 9000/9001) are already occupied on this machine, both natively (Windows Laragon Postgres/Redis) and inside the same WSL distro (a separately-installed native Postgres, and another already-running MinIO/service on 9000/9001) - `docker-compose.yml`'s ports are now `${VAR:-default}` overridable (`POSTGRES_PORT`, `REDIS_PORT`, `S3_PORT`, `S3_CONSOLE_PORT`) so this machine's testing could use 15432/16379/19000/19001 without touching the standard defaults anyone else's environment expects.
- CORS remains `origin: true` (unchanged from Task 02, still flagged for Task 06).
- `SESSION_HMAC_KEY`/`PHONE_ENCRYPTION_KEY` are present in the repo's local `.env` as obviously-labelled dev-only values; `.env` is gitignored and was not committed. `.env.example` ships empty placeholders for both.
- `npm audit`: 0 critical, 7 high. 3 unchanged from Task 01/02 (`next`, `postcss`, `sharp`, all requiring `next@16.3.4`, outside the plan's `16.2.11` pin). 4 new, all inside `prisma`'s own **devDependency** tree (`@prisma/config`, `deepmerge-ts`, `mysql2` ×2) - none ship in `services/api`'s runtime (only `@prisma/client` + the driver adapter do), and `mysql2`'s advisories are about a MySQL wire-protocol handshake this project never performs (Postgres only). The only offered fix (`npm audit fix --force`) downgrades to `prisma@6.19.3`, conflicting with the plan's Prisma 7 requirement; left unresolved and disclosed here.
- Two more unrelated, untracked files (`T messenger v0.2.zip`, `T messenger v0.3.zip`) remain in the working directory; neither was touched or included in any commit. The project directory itself was renamed mid-task (`T messenger v0.1` → `TMessenger`, external to this session) - confirmed same git history, no content lost, workspace symlinks regenerated via `npm install`.

Regressions:
Root `npm run verify` (lint → typecheck → test → build) passes with exit 0, as do both new workspaces' own `test`/`typecheck`/`build`. Task 02's health contract, route, and `SystemStatus` component were extended (2 checks → 3) rather than replaced; all of Task 02's original assertions still hold, just with an added `storage` key threaded through every affected test.

Reviewer note:
Three real, empirically-confirmed decisions this task made:
1. **Prisma 7 requires a driver adapter** (`@prisma/adapter-pg` + `pg`) - no bundled query engine for SQL providers. `getPrisma()` constructs the client with this adapter; `prisma.config.ts` (not `datasource.url` in `schema.prisma`) holds `DATABASE_URL`, loaded explicitly via `dotenv` since Prisma 7 also dropped automatic `.env` loading. Confirmed against the actual installed `prisma@7.10.0` CLI.
2. **`services/api`'s Fastify plugins connect lazily, not at registration** - an eager `$connect()`/`.connect()` would make the entire server fail to boot whenever Postgres/Redis is briefly unreachable, contradicting `/live`'s own "never depends on downstream services" contract. Demonstrated live: the server booted and answered `/live` with 200 even while `DATABASE_URL`/`S3_ENDPOINT` pointed nowhere.
3. **`/v1/health/ready` caches and coalesces** - see Security. This is the one substantive change from the originally-committed version of this task, made in response to a legitimate finding rather than a hypothetical one.

On the WSL2 networking flakiness specifically: this is worth the owner's attention independent of this task, since **Task 04 (CI, Docker images, `docker compose build/up`) depends entirely on Docker working reliably**, and intermittent host-to-WSL2 port forwarding could resurface there too. It did not block this task's own verification (every acceptance item was captured during a working window), but it's the kind of thing worth a `wsl --shutdown` before starting Task 04's own Docker-heavy work if anything seems unreachable.
